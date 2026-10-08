use super::*;

pub(super) struct Owner {
    pub session: Id,
    pub lease: WriterLease,
    pub opens: HashMap<Id, Id>,
}

impl Engine {
    pub fn open_writeback(
        &self,
        session: &str,
        node: &str,
        request: &str,
    ) -> Result<WritebackHandle> {
        if request.is_empty() || request.len() > 128 {
            return Err(err(libc::EINVAL, "invalid writer open identity"));
        }
        let _guard = self.writer.lock();
        let session = self.session(session)?;
        let reader = self.store.reader();
        let node = self.live_node(&reader, &session, node, None, true)?;
        self.require(&reader, &session, &node.id, READ | WRITE)?;
        if node.kind != Kind::File {
            return Err(err(libc::EISDIR, "not a regular file"));
        }
        let public = self.public_node(&reader, &session, node.clone())?;
        let now = now_ms();
        let key = (session.tenant.clone(), node.id.clone());
        let mut writers = self.writers.lock();
        if writers
            .get(&key)
            .is_some_and(|owner| owner.lease.expires_ms <= now)
        {
            writers.remove(&key);
        }
        if let Some(owner) = writers.get(&key) {
            if owner.session != session.id {
                return Err(err(libc::EBUSY, "exclusive writer active"));
            }
            if let Some(handle) = owner.opens.get(request) {
                return Ok(WritebackHandle {
                    handle: handle.clone(),
                    node: public,
                    lease: owner.lease.clone(),
                });
            }
        }
        let mut handles = self.handles.lock();
        if handles.len() >= self.limits.max_handles {
            return Err(err(libc::EMFILE, "handle capacity"));
        }
        let owner = writers.entry(key).or_insert_with(|| Owner {
            session: session.id.clone(),
            lease: WriterLease {
                generation: id(),
                expires_ms: now
                    .saturating_add(self.limits.writer_lease_ms)
                    .min(session.expires_ms),
            },
            opens: HashMap::new(),
        });
        let handle = id();
        handles.insert(
            handle.clone(),
            Handle {
                session: session.id.clone(),
                node: node.id,
                write: true,
                fence: Some(owner.lease.generation.clone()),
            },
        );
        owner.opens.insert(request.into(), handle.clone());
        Ok(WritebackHandle {
            handle,
            node: public,
            lease: owner.lease.clone(),
        })
    }

    pub fn renew_writeback(&self, session: &str, handle: &str) -> Result<WriterLease> {
        let _guard = self.writer.lock();
        let session = self.session(session)?;
        let reader = self.store.reader();
        let handle = self
            .handles
            .lock()
            .get(handle)
            .cloned()
            .ok_or_else(|| err(libc::ESTALE, "writer handle absent"))?;
        if handle.session != session.id {
            return Err(err(libc::EACCES, "writer handle owner mismatch"));
        }
        self.require(&reader, &session, &handle.node, READ | WRITE)?;
        let mut writers = self.writers.lock();
        let owner = writers
            .get_mut(&(session.tenant.clone(), handle.node))
            .filter(|owner| {
                owner.session == session.id
                    && handle.fence.as_ref() == Some(&owner.lease.generation)
                    && owner.lease.expires_ms > now_ms()
            })
            .ok_or_else(|| err(libc::ESTALE, "writer lease lost"))?;
        owner.lease.expires_ms = now_ms()
            .saturating_add(self.limits.writer_lease_ms)
            .min(session.expires_ms);
        Ok(owner.lease.clone())
    }

    pub(super) fn check_writer(
        &self,
        reader: &Reader<'_>,
        session: &Session,
        node: &str,
        handle: Option<&str>,
    ) -> Result<()> {
        let fence = handle.and_then(|handle| {
            self.handles
                .lock()
                .get(handle)
                .and_then(|handle| handle.fence.clone())
        });
        let writers = self.writers.lock();
        let owner = writers
            .get(&(session.tenant.clone(), node.into()))
            .filter(|owner| owner.lease.expires_ms > now_ms());
        if let Some(fence) = fence {
            self.require(reader, session, node, READ | WRITE)?;
            if owner
                .is_none_or(|owner| owner.session != session.id || owner.lease.generation != fence)
            {
                return Err(err(libc::ESTALE, "writer lease lost"));
            }
        } else if owner.is_some() {
            return Err(err(libc::EBUSY, "exclusive writer active"));
        }
        Ok(())
    }
}
