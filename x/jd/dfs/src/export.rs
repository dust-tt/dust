use super::*;

pub(super) struct IndexLease {
    pub session: Id,
    expires_ms: u64,
    nodes: Vec<Node>,
    grants: Vec<IndexGrant>,
}

impl Engine {
    fn index_session(&self, session: &str) -> Result<Session> {
        let session = self.session(session)?;
        if !session.admin || session.scope.is_some() {
            return Err(err(
                libc::EACCES,
                "workspace export requires an unscoped administrator",
            ));
        }
        Ok(session)
    }

    pub fn begin_index_snapshot(
        &self,
        session: &str,
        after: Option<IndexBoundary>,
    ) -> Result<IndexSnapshot> {
        self.begin_index_export(session, after, false)
    }

    pub fn begin_index_delta(
        &self,
        session: &str,
        after: Option<IndexBoundary>,
    ) -> Result<IndexSnapshot> {
        self.begin_index_export(session, after, true)
    }

    fn begin_index_export(
        &self,
        session: &str,
        after: Option<IndexBoundary>,
        incremental: bool,
    ) -> Result<IndexSnapshot> {
        let session = self.index_session(session)?;
        let mut leases = self.index_leases.lock();
        leases.retain(|_, lease| lease.expires_ms > now_ms());
        if leases.len() >= 4 {
            return Err(err(libc::EAGAIN, "index snapshot capacity"));
        }
        let (_, reader) =
            self.persistence_barrier(|| self.store.reader(), || self.store.persist())?;
        let state = reader.state(&session.tenant)?;
        let mut reset = after.as_ref().is_none_or(|cursor| {
            cursor.tenant != session.tenant
                || cursor.incarnation != self.incarnation
                || cursor.head > state.head
                || cursor.head < state.journal_floor
                || state.head - cursor.head > 4096
        });
        let mut changes = Vec::new();
        if !reset {
            let after = after
                .as_ref()
                .ok_or_else(|| err(libc::EINVAL, "missing cursor"))?;
            for head in after.head + 1..=state.head {
                let change: Change = reader
                    .get(
                        "changes",
                        key(&session.tenant, &["sequence", &format!("{head:020}")]),
                    )?
                    .ok_or_else(|| err(libc::EIO, "index journal gap"))?;
                reset |= change.reset && (!incremental || change.node.is_some());
                changes.push(change);
            }
        }
        if reset {
            changes.clear();
        }
        let nodes: Vec<Node> = if incremental && !reset {
            changes
                .iter()
                .filter_map(|change| change.node.clone())
                .collect::<BTreeSet<_>>()
                .iter()
                .map(|node| reader.node(&session.tenant, node))
                .collect::<Result<_>>()?
        } else {
            reader
                .scan::<Node>("metadata", key(&session.tenant, &["node"]))?
                .into_iter()
                .map(|(_, node)| node)
                .filter(|node| !node.unlinked)
                .collect()
        };
        if nodes.len() > self.limits.max_nodes {
            return Err(err(libc::EOVERFLOW, "index snapshot capacity"));
        }
        let grants = if incremental {
            Vec::new()
        } else {
            let mut grants: BTreeMap<(Id, Id), IndexGrant> = reader
                .scan::<IndexGrant>("metadata", key(&session.tenant, &["search_grant"]))?
                .into_iter()
                .map(|(_, grant)| ((grant.node.clone(), grant.token.clone()), grant))
                .collect();
            for (grant_key, (node, _)) in
                reader.scan::<(Id, u16)>("metadata", key(&session.tenant, &["grant_by_subject"]))?
            {
                let parts = decode_key(&grant_key)?;
                let subject = parts
                    .get(2)
                    .ok_or_else(|| err(libc::EIO, "invalid grant key"))?;
                let token = search::grant_token(&node, subject);
                grants.insert((node.clone(), token.clone()), IndexGrant { node, token });
            }
            if grants.len() > 4096 {
                return Err(err(libc::EOVERFLOW, "search grant capacity"));
            }
            grants.into_values().collect()
        };
        let lease = id();
        let expires_ms = session.expires_ms.min(now_ms() + 60_000);
        leases.insert(
            lease.clone(),
            IndexLease {
                session: session.id,
                expires_ms,
                nodes,
                grants,
            },
        );
        Ok(IndexSnapshot {
            lease,
            tenant: session.tenant.clone(),
            cursor: IndexBoundary {
                tenant: session.tenant,
                incarnation: self.incarnation.clone(),
                head: state.head,
            },
            expires_ms,
            reset,
            changes,
        })
    }

    fn with_index_lease<T>(
        &self,
        session: &str,
        lease: &str,
        f: impl FnOnce(&Session, &IndexLease) -> Result<T>,
    ) -> Result<T> {
        let session = self.index_session(session)?;
        let leases = self.index_leases.lock();
        let lease = leases
            .get(lease)
            .filter(|lease| lease.session == session.id && lease.expires_ms > now_ms())
            .ok_or_else(|| err(libc::ESTALE, "index lease expired or absent"))?;
        f(&session, lease)
    }

    pub fn renew_index_snapshot(&self, session: &str, lease: &str) -> Result<u64> {
        let session = self.index_session(session)?;
        let mut leases = self.index_leases.lock();
        let now = now_ms();
        leases.retain(|_, lease| lease.expires_ms > now);
        let lease = leases
            .get_mut(lease)
            .filter(|lease| lease.session == session.id)
            .ok_or_else(|| err(libc::ESTALE, "index lease expired or absent"))?;
        lease.expires_ms = session.expires_ms.min(now.saturating_add(60_000));
        Ok(lease.expires_ms)
    }

    pub fn list_index_nodes(&self, session: &str, lease: &str, offset: u32) -> Result<Vec<Node>> {
        self.with_index_lease(session, lease, |_, lease| {
            Ok(lease
                .nodes
                .iter()
                .skip(offset as usize)
                .take(256)
                .cloned()
                .collect())
        })
    }

    pub fn list_index_grants(
        &self,
        session: &str,
        lease: &str,
        offset: u32,
    ) -> Result<Vec<IndexGrant>> {
        self.with_index_lease(session, lease, |_, lease| {
            Ok(lease
                .grants
                .iter()
                .skip(offset as usize)
                .take(256)
                .cloned()
                .collect())
        })
    }

    pub fn read_index_content(
        &self,
        session: &str,
        lease: &str,
        node: &str,
        offset: u64,
        size: u32,
    ) -> Result<Vec<u8>> {
        if size as usize > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "index read size"));
        }
        self.with_index_lease(session, lease, |session, lease| {
            let node = lease
                .nodes
                .binary_search_by(|candidate| candidate.id.as_str().cmp(node))
                .ok()
                .map(|index| &lease.nodes[index])
                .ok_or_else(|| err(libc::ENOENT, "node absent from snapshot"))?;
            let reader = self.store.reader();
            let manifest = self.manifest(&reader, &session.tenant, node, &node.version)?;
            self.read_manifest(&reader, &session.tenant, &manifest, offset, size)
        })
    }

    pub fn end_index_snapshot(&self, session: &str, lease: &str) -> Result<()> {
        self.index_session(session)?;
        let mut leases = self.index_leases.lock();
        if leases
            .get(lease)
            .is_some_and(|lease| lease.session != session)
        {
            return Err(err(libc::EACCES, "index lease owner"));
        }
        leases.remove(lease);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renewal_preserves_snapshot_and_never_revives_expired_authority() {
        let directory = tempfile::tempdir().unwrap();
        let engine = Engine::open(
            directory.path(),
            vec![Credential {
                token_hash: token_hash("admin"),
                tenant: "tenant".into(),
                issuer: "test".into(),
                subject: "admin".into(),
                principal: "admin".into(),
                admin: true,
                scope: None,
                expires_ms: u64::MAX,
            }],
            Limits::default(),
        )
        .unwrap();
        let session = engine.login("admin").unwrap();
        let snapshot = engine.begin_index_snapshot(&session.id, None).unwrap();
        let before = engine
            .list_index_nodes(&session.id, &snapshot.lease, 0)
            .unwrap();
        engine
            .index_leases
            .lock()
            .get_mut(&snapshot.lease)
            .unwrap()
            .expires_ms = now_ms() + 10_000;
        let renewed = engine
            .renew_index_snapshot(&session.id, &snapshot.lease)
            .unwrap();
        assert!(renewed > now_ms() + 50_000);
        assert_eq!(
            before,
            engine
                .list_index_nodes(&session.id, &snapshot.lease, 0)
                .unwrap()
        );
        let session_expiry = now_ms() + 5_000;
        engine
            .sessions
            .write()
            .get_mut(&session.id)
            .unwrap()
            .expires_ms = session_expiry;
        assert_eq!(
            engine
                .renew_index_snapshot(&session.id, &snapshot.lease)
                .unwrap(),
            session_expiry
        );
        engine
            .index_leases
            .lock()
            .get_mut(&snapshot.lease)
            .unwrap()
            .expires_ms = 0;
        assert_eq!(
            engine
                .renew_index_snapshot(&session.id, &snapshot.lease)
                .unwrap_err()
                .code,
            libc::ESTALE
        );
        assert!(!engine.index_leases.lock().contains_key(&snapshot.lease));
        let snapshot = engine.begin_index_snapshot(&session.id, None).unwrap();
        engine
            .sessions
            .write()
            .get_mut(&session.id)
            .unwrap()
            .expires_ms = 0;
        assert_eq!(
            engine
                .renew_index_snapshot(&session.id, &snapshot.lease)
                .unwrap_err()
                .code,
            libc::EACCES
        );
        engine.logout(&session.id);
        assert!(engine.index_leases.lock().is_empty());
    }
}
