use super::*;

impl Engine {
    pub async fn view(&self, session_id: &str) -> Result<View> {
        let context = self.context(session_id).await?;
        let session = &context.record.session;
        let mut nodes = BTreeMap::<Id, Node>::new();
        let mut after = None;
        let mut bytes = 0usize;
        loop {
            let page = context
                .batch
                .scan(&key(&["node"]), after.as_deref(), 256)
                .await?;
            if page.is_empty() {
                break;
            }
            after = page.last().map(|(key, _)| key.clone());
            for (_, value) in page {
                let node: Node = decode(&value, VALUE_LIMIT)?;
                if node.unlinked {
                    continue;
                }
                bytes = bytes
                    .saturating_add(node.retained_bytes().saturating_mul(3))
                    .saturating_add(1024);
                if nodes.len() >= self.limits.max_nodes || bytes > self.limits.snapshot_bytes {
                    return Err(err(libc::E2BIG, "authorized view capacity"));
                }
                nodes.insert(node.id.clone(), node);
            }
        }
        let mut grants = HashMap::<Id, u16>::new();
        if !session.admin {
            for subject in self.subjects(&context.batch, session).await? {
                let mut after = None;
                loop {
                    let page = context
                        .batch
                        .scan(&key(&["grant_by_subject", &subject]), after.as_deref(), 256)
                        .await?;
                    if page.is_empty() {
                        break;
                    }
                    after = page.last().map(|(key, _)| key.clone());
                    for (_, value) in page {
                        let (node, verbs): (Id, u16) = decode(&value, VALUE_LIMIT)?;
                        if !grants.contains_key(&node) {
                            bytes = bytes.saturating_add(node.len()).saturating_add(192);
                            if bytes > self.limits.snapshot_bytes {
                                return Err(err(libc::E2BIG, "grant view capacity"));
                            }
                        }
                        *grants.entry(node).or_default() |= verbs;
                    }
                }
            }
        }
        let mut resolved = HashMap::<Id, (u16, bool, usize)>::new();
        for node in nodes.values() {
            let mut inherited = (
                if session.admin { ALL } else { 0 },
                session.scope.is_none(),
                0,
            );
            let mut path = Vec::new();
            let mut seen = BTreeSet::new();
            let mut next = Some(node.id.as_str());
            while let Some(current) = next {
                if let Some(value) = resolved.get(current) {
                    inherited = *value;
                    break;
                }
                if !seen.insert(current) {
                    return Err(err(libc::ELOOP, "view ancestry cycle"));
                }
                let ancestor = nodes
                    .get(current)
                    .ok_or_else(|| err(libc::EIO, "view ancestor missing"))?;
                path.push(ancestor);
                next = ancestor.parent.as_deref();
            }
            for ancestor in path.into_iter().rev() {
                inherited.0 |= grants.get(&ancestor.id).copied().unwrap_or(0);
                inherited.1 |= session.scope.as_ref() == Some(&ancestor.id);
                inherited.2 += 1;
                resolved.insert(ancestor.id.clone(), inherited);
            }
        }
        let root = session.scope.as_ref().unwrap_or(&context.state.root);
        let mut ordered: Vec<_> = nodes.values().collect();
        ordered.sort_by_key(|node| resolved[&node.id].2);
        let mut reachable = BTreeSet::new();
        let mut output = Vec::new();
        for node in ordered {
            let (verbs, in_scope, _) = resolved[&node.id];
            if verbs == 0 || !in_scope {
                continue;
            }
            let parent_reachable = node.parent.as_ref().is_some_and(|parent| {
                reachable.contains(parent)
                    && resolved[parent].0 & (LIST | TRAVERSE) == LIST | TRAVERSE
            });
            let (visible_parent, visible_name) = if &node.id == root {
                (None, "files".to_owned())
            } else if parent_reachable {
                (node.parent.clone(), node.name.clone())
            } else {
                (None, format!("{}~{}", node.name, node.id))
            };
            reachable.insert(node.id.clone());
            let mut public = node.clone();
            public.parent = visible_parent.clone();
            public.name = visible_name.clone();
            output.push(ViewNode {
                node: public,
                visible_parent,
                visible_name,
                verbs,
            });
        }
        let ids: Vec<_> = output.iter().map(|node| node.node.id.clone()).collect();
        self.pin_many(session_id, context.state.auth_generation, &ids)
            .await?;
        Ok(View {
            incarnation: self.incarnation.clone(),
            head: context.state.head,
            auth_generation: context.state.auth_generation,
            nodes: output,
        })
    }

    async fn pin_many(&self, session: &str, auth_generation: u64, nodes: &[Id]) -> Result<()> {
        for nodes in nodes.chunks(1024) {
            let mut done = false;
            for attempt in 0..RETRIES {
                let mut context = self.context(session).await?;
                if context.state.auth_generation != auth_generation {
                    return Err(err(libc::ESTALE, "view authority changed"));
                }
                let mut changed = false;
                for nodes in nodes.chunks(256) {
                    let keys = nodes
                        .iter()
                        .map(|node| key(&["pin", session, node]))
                        .collect::<Vec<_>>();
                    context.batch.prefetch(&keys).await?;
                    for node in nodes {
                        if !context
                            .batch
                            .load::<bool>(&["pin", session, node])
                            .await?
                            .unwrap_or(false)
                        {
                            context.batch.save(&["pin", session, node], &true).await?;
                            changed = true;
                        }
                    }
                }
                if !changed || matches!(context.batch.commit().await?, Commit::Published { .. }) {
                    done = true;
                    break;
                }
                backoff(attempt).await;
            }
            if !done {
                return Err(err(libc::EAGAIN, "view pin contention"));
            }
        }
        let context = self.context(session).await?;
        if context.state.auth_generation != auth_generation {
            return Err(err(libc::ESTALE, "view authority changed"));
        }
        Ok(())
    }

    pub async fn changes(&self, session: &str, cursor: Cursor) -> Result<Delta> {
        let mut context = self.context(session).await?;
        let state = &context.state;
        if cursor.incarnation != self.incarnation || cursor.head > state.head {
            return Err(err(libc::ESTALE, "cursor boundary mismatch"));
        }
        let mut delta = Delta {
            incarnation: self.incarnation.clone(),
            from_head: cursor.head,
            head: state.head,
            auth_generation: state.auth_generation,
            reset: cursor.head < state.journal_floor || state.head - cursor.head > 4096,
            upserts: Vec::new(),
            removed: Vec::new(),
        };
        if delta.reset {
            return Ok(delta);
        }
        let mut changed = BTreeSet::new();
        let count = (state.head - cursor.head) as usize;
        let events = if count == 0 {
            Vec::new()
        } else {
            context
                .batch
                .scan(
                    &key(&["change"]),
                    Some(&key(&["change", &format!("{:020}", cursor.head)])),
                    count,
                )
                .await?
        };
        if events.len() != count {
            return Err(err(libc::EIO, "journal gap"));
        }
        for (index, (event_key, bytes)) in events.into_iter().enumerate() {
            let sequence = cursor.head + index as u64 + 1;
            let change: Change = decode(&bytes, VALUE_LIMIT)?;
            if change.head != sequence || event_key != key(&["change", &format!("{sequence:020}")])
            {
                return Err(err(libc::EIO, "journal sequence"));
            }
            if change.reset {
                delta.reset = true;
                return Ok(delta);
            }
            changed.extend(change.node);
            changed.extend(change.old_parent);
            changed.extend(change.new_parent);
        }
        let caller = &context.record.session;
        let root = caller.scope.as_ref().unwrap_or(&state.root);
        let changed = changed.into_iter().collect::<Vec<_>>();
        for ids in changed.chunks(256) {
            let keys = ids.iter().map(|id| key(&["node", id])).collect::<Vec<_>>();
            context.batch.prefetch(&keys).await?;
            for id in ids.iter().cloned() {
                let mut node = context.batch.node(&id).await?;
                let verbs = self.verbs(&context.batch, caller, &id).await?;
                if verbs == 0 || node.unlinked {
                    delta.removed.push(id);
                    continue;
                }
                let parent_visible = match &node.parent {
                    Some(parent) => {
                        self.verbs(&context.batch, caller, parent).await? & (LIST | TRAVERSE)
                            == LIST | TRAVERSE
                    }
                    None => false,
                };
                let (visible_parent, visible_name) = if &id == root {
                    (None, "files".to_owned())
                } else if parent_visible {
                    (node.parent.clone(), node.name.clone())
                } else {
                    (None, format!("{}~{}", node.name, node.id))
                };
                node.parent = visible_parent.clone();
                node.name = visible_name.clone();
                delta.upserts.push(ViewNode {
                    node,
                    visible_parent,
                    visible_name,
                    verbs,
                });
            }
        }
        let ids: Vec<_> = delta
            .upserts
            .iter()
            .map(|node| node.node.id.clone())
            .collect();
        if !ids.is_empty() {
            self.pin_many(session, state.auth_generation, &ids).await?;
        }
        Ok(delta)
    }

    pub async fn metrics(&self, session: &str) -> Result<Metrics> {
        let context = self.context(session).await?;
        if !context.record.session.admin || context.record.session.scope.is_some() {
            return Err(err(libc::EACCES, "administrator required"));
        }
        Ok(Metrics {
            published: context.state.head,
            persisted: context.state.head,
            retained_bytes: context.state.retained_bytes,
            ..Metrics::default()
        })
    }
}
