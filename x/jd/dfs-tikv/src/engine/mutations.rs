use super::*;

#[derive(Serialize, Deserialize)]
struct Recorded {
    request: RequestId,
    digest: [u8; 32],
    principal: Id,
    outcome: Outcome,
    targets: Vec<Id>,
}

struct Applied {
    extra: Vec<Node>,
    node: Option<Node>,
    previous: Option<Node>,
    written: u32,
    targets: Vec<Id>,
    changed: Vec<Id>,
    subtrees: Vec<Id>,
    reset: bool,
}

impl Engine {
    pub async fn mutate(
        &self,
        session_id: &str,
        request: RequestId,
        mutation: Mutation,
    ) -> Result<Outcome> {
        let digest = hash(&bincode::serialize(&(&request, &mutation))?);
        for attempt in 0..RETRIES {
            let mut keys = Vec::new();
            match &mutation {
                Mutation::Create { parent, name, .. } => {
                    keys.push(key(&["node", parent]));
                    keys.push(key(&["entry", parent, name]));
                }
                Mutation::Write {
                    node, base, handle, ..
                }
                | Mutation::Truncate {
                    node, base, handle, ..
                }
                | Mutation::SetAttr {
                    node, base, handle, ..
                } => {
                    keys.push(key(&["node", node]));
                    keys.push(key(&["manifest", node, base]));
                    if let Some(handle) = handle {
                        keys.push(if let Some(pin) = handle.strip_prefix("view:") {
                            key(&["pin", session_id, pin])
                        } else {
                            key(&["handle", session_id, handle])
                        });
                    }
                }
                Mutation::Unlink { parent, name, .. } => {
                    keys.push(key(&["node", parent]));
                    keys.push(key(&["entry", parent, name]));
                }
                _ => {}
            }
            let mut context = self.context_with(session_id, keys, Some(&request)).await?;
            let session = context.record.session.clone();
            if request.expires_ms <= now_ms() {
                return Err(err(libc::ESTALE, "retry epoch expired"));
            }
            let request_key = ["request", &session.principal, &request.epoch, &request.id];
            if let Some(record) = context.batch.load::<Recorded>(&request_key).await? {
                if record.request != request
                    || record.digest != digest
                    || record.principal != session.principal
                {
                    return Err(err(libc::EINVAL, "retry payload mismatch"));
                }
                let outcome = self
                    .authorized_outcome(&context.batch, &session, record)
                    .await?;
                if let Some(node) = &outcome.node
                    && !context
                        .batch
                        .load::<bool>(&["pin", session_id, &node.id])
                        .await?
                        .unwrap_or(false)
                {
                    context
                        .batch
                        .save(&["pin", session_id, &node.id], &true)
                        .await?;
                    if matches!(context.batch.commit().await?, Commit::Conflict) {
                        backoff(attempt).await;
                        continue;
                    }
                }
                return Ok(outcome);
            }
            if request.incarnation != self.incarnation
                || request.epoch != session.retry_epoch
                || request.expires_ms != session.retry_expires_ms
            {
                return Err(err(libc::ESTALE, "request epoch or incarnation mismatch"));
            }
            let applied = self
                .apply(&mut context.batch, &session, &mut context.state, &mutation)
                .await?;
            for node in &applied.extra {
                context.state.head = context
                    .state
                    .head
                    .checked_add(1)
                    .ok_or_else(|| err(libc::EOVERFLOW, "tenant head"))?;
                let sequence = format!("{:020}", context.state.head);
                context
                    .batch
                    .save(
                        &["change", &sequence],
                        &Change {
                            head: context.state.head,
                            node: Some(node.id.clone()),
                            reset: false,
                            time_ms: now_ms(),
                            old_parent: node.parent.clone(),
                            old_name: Some(node.name.clone()),
                            new_parent: node.parent.clone(),
                            new_name: Some(node.name.clone()),
                        },
                    )
                    .await?;
                context
                    .batch
                    .save(
                        &["index_event", &sequence],
                        &IndexEvent {
                            head: context.state.head,
                            nodes: vec![node.id.clone()],
                            subtree_roots: Vec::new(),
                            policy_changed: false,
                        },
                    )
                    .await?;
            }
            context.state.head = context
                .state
                .head
                .checked_add(1)
                .ok_or_else(|| err(libc::EOVERFLOW, "tenant head"))?;
            if applied.reset {
                context.state.auth_generation = context
                    .state
                    .auth_generation
                    .checked_add(1)
                    .ok_or_else(|| err(libc::EOVERFLOW, "policy generation"))?;
            }
            let outcome = Outcome {
                head: context.state.head,
                node: applied.node,
                written: applied.written,
            };
            let record = Recorded {
                request: request.clone(),
                digest,
                principal: session.principal.clone(),
                outcome: outcome.clone(),
                targets: applied.targets,
            };
            context.batch.save(&request_key, &record).await?;
            if let Some(node) = &outcome.node {
                context
                    .batch
                    .save(&["pin", session_id, &node.id], &true)
                    .await?;
            }
            let sequence = format!("{:020}", context.state.head);
            context
                .batch
                .save(
                    &["change", &sequence],
                    &Change {
                        head: context.state.head,
                        node: outcome.node.as_ref().map(|n| n.id.clone()),
                        reset: applied.reset,
                        time_ms: now_ms(),
                        old_parent: applied.previous.as_ref().and_then(|n| n.parent.clone()),
                        old_name: applied.previous.as_ref().map(|n| n.name.clone()),
                        new_parent: outcome
                            .node
                            .as_ref()
                            .filter(|n| !n.unlinked)
                            .and_then(|n| n.parent.clone()),
                        new_name: outcome
                            .node
                            .as_ref()
                            .filter(|n| !n.unlinked)
                            .map(|n| n.name.clone()),
                    },
                )
                .await?;
            context
                .batch
                .save(
                    &["index_event", &sequence],
                    &IndexEvent {
                        head: context.state.head,
                        nodes: applied.changed,
                        subtree_roots: applied.subtrees,
                        policy_changed: applied.reset,
                    },
                )
                .await?;
            context.state.retained_bytes = context
                .state
                .retained_bytes
                .checked_add(context.batch.staged_bytes() as u64 + 4096)
                .ok_or_else(|| err(libc::EDQUOT, "retained bytes overflow"))?;
            if context.state.retained_bytes > self.limits.retained_bytes {
                return Err(err(libc::EDQUOT, "retained storage quota"));
            }
            context.batch.save(&["state"], &context.state).await?;
            let mut public = outcome;
            if let Some(node) = public.node {
                public.node = Some(self.public_node(&context.batch, &session, node).await?);
            }
            match context.batch.commit().await? {
                Commit::Published { .. } => return Ok(public),
                Commit::Conflict => backoff(attempt).await,
            }
        }
        Err(err(libc::EAGAIN, "publication contention"))
    }

    async fn authorized_outcome(
        &self,
        batch: &PublicationBatch,
        session: &Session,
        record: Recorded,
    ) -> Result<Outcome> {
        for target in &record.targets {
            if self.verbs(batch, session, target).await? == 0 {
                return Err(err(libc::EACCES, "outcome no longer authorized"));
            }
        }
        let mut outcome = record.outcome;
        if let Some(node) = outcome.node {
            if self.verbs(batch, session, &node.id).await? == 0 {
                return Err(err(libc::EACCES, "outcome node no longer authorized"));
            }
            outcome.node = Some(self.public_node(batch, session, node).await?);
        }
        Ok(outcome)
    }

    pub async fn resolve_publication(
        &self,
        session_id: &str,
        publication: PublicationId,
    ) -> Result<Option<Publication>> {
        for attempt in 0..RETRIES {
            let mut context = self.context(session_id).await?;
            let session = context.record.session.clone();
            if publication.tenant != session.tenant {
                return Err(err(libc::EACCES, "publication tenant mismatch"));
            }
            let Some(record) = context
                .batch
                .load::<Recorded>(&[
                    "request",
                    &session.principal,
                    &publication.request.epoch,
                    &publication.request.id,
                ])
                .await?
            else {
                return Ok(None);
            };
            if record.request != publication.request
                || record.digest != publication.digest
                || record.principal != session.principal
            {
                return Err(err(libc::EINVAL, "publication identity mismatch"));
            }
            let outcome = self
                .authorized_outcome(&context.batch, &session, record)
                .await?;
            if let Some(node) = &outcome.node
                && !context
                    .batch
                    .load::<bool>(&["pin", session_id, &node.id])
                    .await?
                    .unwrap_or(false)
            {
                context
                    .batch
                    .save(&["pin", session_id, &node.id], &true)
                    .await?;
                if matches!(context.batch.commit().await?, Commit::Conflict) {
                    backoff(attempt).await;
                    continue;
                }
            }
            return Ok(Some(Publication {
                receipt: PublicationReceipt {
                    publication,
                    tenant_head: outcome.head,
                },
                outcome,
            }));
        }
        Err(err(libc::EAGAIN, "receipt resolution contention"))
    }

    pub async fn persist_through(
        &self,
        session: &str,
        receipt: PublicationReceipt,
        level: DurabilityLevel,
    ) -> Result<PersistenceConfirmation> {
        let published = self
            .resolve_publication(session, receipt.publication.clone())
            .await?
            .ok_or_else(|| err(libc::ESTALE, "publication outcome unknown"))?;
        if published.receipt != receipt {
            return Err(err(libc::EINVAL, "publication receipt mismatch"));
        }
        Ok(PersistenceConfirmation {
            incarnation: self.incarnation.clone(),
            engine_prefix: published.outcome.head,
            level,
        })
    }

    async fn checked_entry(
        &self,
        batch: &PublicationBatch,
        parent: &str,
        name: &str,
        expected: &str,
    ) -> Result<Entry> {
        check_name(name)?;
        let entry = batch
            .entry(parent, name)
            .await?
            .ok_or_else(|| err(libc::ENOENT, "entry absent"))?;
        if entry.token != expected {
            return Err(err(libc::ESTALE, "entry changed"));
        }
        Ok(entry)
    }

    async fn empty_directory(&self, batch: &PublicationBatch, node: &Node) -> Result<()> {
        if node.kind == Kind::Directory
            && !batch
                .scan(&key(&["entry", &node.id]), None, 1)
                .await?
                .is_empty()
        {
            return Err(err(libc::ENOTEMPTY, "directory not empty"));
        }
        Ok(())
    }

    async fn apply(
        &self,
        batch: &mut PublicationBatch,
        session: &Session,
        state: &mut State,
        mutation: &Mutation,
    ) -> Result<Applied> {
        let mut applied = Applied {
            extra: Vec::new(),
            node: None,
            previous: None,
            written: 0,
            targets: Vec::new(),
            changed: Vec::new(),
            subtrees: Vec::new(),
            reset: false,
        };
        match mutation {
            Mutation::PutFiles { files } => {
                validate_file_updates(files)?;
                let mut parents = BTreeSet::new();
                let mut offset = 0;
                while offset < files.len() {
                    let mut end = offset;
                    let mut bytes = 0;
                    while end < files.len()
                        && end - offset < 48
                        && (end == offset || bytes + files[end].data.len() <= 896 << 10)
                    {
                        bytes += files[end].data.len();
                        end += 1;
                    }
                    let group = &files[offset..end];
                    let mut keys = group
                        .iter()
                        .flat_map(|file| {
                            [
                                key(&["node", &file.node.id]),
                                key(&[
                                    "entry",
                                    file.node.parent.as_ref().unwrap(),
                                    &file.node.name,
                                ]),
                                key(&["manifest", &file.node.id, &file.node.version]),
                            ]
                        })
                        .collect::<Vec<_>>();
                    keys.extend(
                        group
                            .iter()
                            .map(|file| file.node.parent.as_ref().unwrap())
                            .collect::<BTreeSet<_>>()
                            .into_iter()
                            .map(|parent| key(&["node", parent])),
                    );
                    if bytes <= 896 << 10 {
                        keys.extend(
                            group
                                .iter()
                                .flat_map(|file| file.data.chunks(CHUNK_BYTES))
                                .map(|bytes| key(&["chunk", &hex(&hash(bytes))])),
                        );
                    }
                    keys.sort();
                    keys.dedup();
                    batch.prefetch(&keys).await?;
                    for file in group {
                        let node = &file.node;
                        let parent = node.parent.as_ref().unwrap();
                        check_name(&node.name)?;
                        if let Some(base) = &file.base {
                            let previous = if node.kind == Kind::Directory {
                                let previous = batch.node(&node.id).await?;
                                self.require(batch, session, &node.id, WRITE).await?;
                                if previous.kind != Kind::Directory || &previous.version != base {
                                    return Err(err(libc::ESTALE, "directory version changed"));
                                }
                                previous
                            } else {
                                self.checked_file(
                                    batch,
                                    session,
                                    &node.id,
                                    base,
                                    Some(&format!("view:{}", node.id)),
                                )
                                .await?
                            };
                            if previous.parent != node.parent
                                || previous.name != node.name
                                || previous.entry_token != node.entry_token
                                || previous.unlinked
                            {
                                return Err(err(libc::ESTALE, "file identity changed"));
                            }
                        } else {
                            if parents.insert(parent.clone()) {
                                self.parent(batch, session, parent, CREATE | WRITE).await?;
                            }
                            if batch.entry(parent, &node.name).await?.is_some()
                                || batch.load::<Node>(&["node", &node.id]).await?.is_some()
                            {
                                return Err(err(libc::EEXIST, "file identity exists"));
                            }
                            if state.node_count >= self.limits.max_nodes as u64 {
                                return Err(err(libc::EDQUOT, "node quota"));
                            }
                            state.node_count += 1;
                            batch
                                .save(
                                    &["entry", parent, &node.name],
                                    &Entry {
                                        node: node.id.clone(),
                                        token: node.entry_token.clone(),
                                    },
                                )
                                .await?;
                        }
                        if batch
                            .load::<Manifest>(&["manifest", &node.id, &node.version])
                            .await?
                            .is_some()
                        {
                            return Err(err(libc::EEXIST, "file generation exists"));
                        }
                        let mut manifest = Manifest {
                            size: node.size,
                            chunks: BTreeMap::new(),
                        };
                        for (index, bytes) in file.data.chunks(CHUNK_BYTES).enumerate() {
                            manifest.chunks.insert(
                                index as u64,
                                self.save_chunk(batch, bytes.to_vec()).await?,
                            );
                        }
                        if node.kind == Kind::File {
                            self.save_file(batch, node, &manifest).await?;
                        } else {
                            batch.save(&["node", &node.id], node).await?;
                        }
                        batch.save(&["pin", &session.id, &node.id], &true).await?;
                        applied.targets.push(node.id.clone());
                        applied.targets.push(parent.clone());
                        applied.extra.push(node.clone());
                    }
                    offset = end;
                }
                applied.node = applied.extra.pop();
            }
            Mutation::Create {
                parent,
                name,
                kind,
                mode,
            } => {
                check_name(name)?;
                self.parent(batch, session, parent, CREATE).await?;
                if batch.entry(parent, name).await?.is_some() {
                    return Err(err(libc::EEXIST, "name exists"));
                }
                if state.node_count >= self.limits.max_nodes as u64 {
                    return Err(err(libc::EDQUOT, "node quota"));
                }
                let node = Node {
                    id: id(),
                    parent: Some(parent.clone()),
                    name: name.clone(),
                    kind: *kind,
                    version: id(),
                    entry_token: id(),
                    size: 0,
                    mode: mode & 0o777,
                    mtime_ms: now_ms(),
                    unlinked: false,
                };
                batch.save(&["node", &node.id], &node).await?;
                batch
                    .save(
                        &["entry", parent, name],
                        &Entry {
                            node: node.id.clone(),
                            token: node.entry_token.clone(),
                        },
                    )
                    .await?;
                if *kind == Kind::File {
                    self.save_file(batch, &node, &Manifest::default()).await?;
                }
                state.node_count += 1;
                applied.targets.push(parent.clone());
                applied.node = Some(node);
            }
            Mutation::Write {
                node,
                base,
                offset,
                data,
                append,
                handle,
            } => {
                let node = self
                    .checked_file(batch, session, node, base, handle.as_deref())
                    .await?;
                applied.previous = Some(node.clone());
                applied.targets.push(node.id.clone());
                applied.node = Some(
                    self.write_content(batch, node, *offset, data, *append)
                        .await?,
                );
                applied.written = data.len() as u32;
            }
            Mutation::Truncate {
                node,
                base,
                size,
                handle,
            } => {
                let node = self
                    .checked_file(batch, session, node, base, handle.as_deref())
                    .await?;
                applied.previous = Some(node.clone());
                applied.targets.push(node.id.clone());
                applied.node = Some(self.truncate_content(batch, node, *size).await?);
            }
            Mutation::SetAttr {
                node,
                base,
                mode,
                mtime_ms,
                handle,
            } => {
                let mut node = self
                    .live_node(batch, session, node, handle.as_deref(), true)
                    .await?;
                self.require(batch, session, &node.id, WRITE).await?;
                if node.version != *base {
                    return Err(err(libc::ESTALE, "version changed"));
                }
                applied.previous = Some(node.clone());
                let manifest = if node.kind == Kind::File {
                    Some(self.manifest(batch, &node, &node.version).await?)
                } else {
                    None
                };
                if let Some(mode) = mode {
                    node.mode = mode & 0o777;
                }
                if let Some(mtime_ms) = mtime_ms {
                    node.mtime_ms = *mtime_ms;
                }
                node.version = id();
                if let Some(manifest) = manifest {
                    self.save_file(batch, &node, &manifest).await?;
                }
                batch.save(&["node", &node.id], &node).await?;
                applied.targets.push(node.id.clone());
                applied.node = Some(node);
            }
            Mutation::Unlink {
                parent,
                name,
                expected,
                directory,
            } => {
                self.parent(batch, session, parent, DELETE).await?;
                let entry = self.checked_entry(batch, parent, name, expected).await?;
                let mut node = batch.node(&entry.node).await?;
                if *directory != (node.kind == Kind::Directory) {
                    return Err(err(
                        if *directory {
                            libc::ENOTDIR
                        } else {
                            libc::EISDIR
                        },
                        "unlink kind",
                    ));
                }
                self.empty_directory(batch, &node).await?;
                applied.previous = Some(node.clone());
                node.unlinked = true;
                batch.save(&["node", &node.id], &node).await?;
                batch.remove(&["entry", parent, name]).await?;
                applied.targets.push(parent.clone());
                applied.subtrees.push(node.id.clone());
                applied.node = Some(node);
            }
            Mutation::Rename {
                parent,
                name,
                expected,
                new_parent,
                new_name,
                destination,
            } => {
                check_name(new_name)?;
                self.parent(batch, session, parent, DELETE | RENAME).await?;
                self.parent(batch, session, new_parent, CREATE | RENAME)
                    .await?;
                let source = self.checked_entry(batch, parent, name, expected).await?;
                let mut node = batch.node(&source.node).await?;
                self.require(batch, session, &node.id, GRANT).await?;
                let dest = batch.entry(new_parent, new_name).await?;
                if dest.as_ref().map(|entry| &entry.token) != destination.as_ref() {
                    return Err(err(libc::ESTALE, "destination changed"));
                }
                if parent != new_parent
                    && self
                        .ancestry(batch, new_parent)
                        .await?
                        .iter()
                        .any(|n| n.id == node.id)
                {
                    return Err(err(libc::EINVAL, "rename cycle"));
                }
                if let Some(dest) = dest
                    && dest.node != node.id
                {
                    self.require(batch, session, &dest.node, DELETE).await?;
                    let mut old = batch.node(&dest.node).await?;
                    if old.kind != node.kind {
                        return Err(err(
                            if old.kind == Kind::Directory {
                                libc::EISDIR
                            } else {
                                libc::ENOTDIR
                            },
                            "replacement kind",
                        ));
                    }
                    self.empty_directory(batch, &old).await?;
                    old.unlinked = true;
                    batch.save(&["node", &old.id], &old).await?;
                    applied.changed.push(old.id.clone());
                    applied.subtrees.push(old.id);
                }
                applied.previous = Some(node.clone());
                batch.remove(&["entry", parent, name]).await?;
                node.parent = Some(new_parent.clone());
                node.name = new_name.clone();
                node.entry_token = id();
                batch.save(&["node", &node.id], &node).await?;
                batch
                    .save(
                        &["entry", new_parent, new_name],
                        &Entry {
                            node: node.id.clone(),
                            token: node.entry_token.clone(),
                        },
                    )
                    .await?;
                applied.targets.extend([parent.clone(), new_parent.clone()]);
                applied.subtrees.push(node.id.clone());
                applied.node = Some(node);
                applied.reset = true;
            }
            Mutation::Grant {
                node,
                subject,
                verbs,
            } => {
                if subject.is_empty() || subject.len() > 512 || verbs & !ALL != 0 {
                    return Err(err(libc::EINVAL, "invalid grant"));
                }
                self.live_node(batch, session, node, None, false).await?;
                self.require(batch, session, node, GRANT | verbs).await?;
                if *verbs == 0 {
                    batch.remove(&["grant", node, subject]).await?;
                    batch.remove(&["grant_by_subject", subject, node]).await?;
                } else {
                    batch.save(&["grant", node, subject], verbs).await?;
                    batch
                        .save(&["grant_by_subject", subject, node], &(node, verbs))
                        .await?;
                }
                applied.targets.push(node.clone());
                applied.reset = true;
            }
            Mutation::Member {
                group,
                principal,
                present,
            } => {
                if !session.admin || session.scope.is_some() {
                    return Err(err(libc::EACCES, "unscoped administrator required"));
                }
                if group.is_empty()
                    || group.len() > 512
                    || group == principal
                    || !batch
                        .load::<bool>(&["principal", principal])
                        .await?
                        .unwrap_or(false)
                    || batch
                        .load::<bool>(&["principal", group])
                        .await?
                        .unwrap_or(false)
                {
                    return Err(err(libc::EINVAL, "invalid group or principal"));
                }
                if *present {
                    let rows = batch
                        .scan(
                            &key(&["groups", principal]),
                            None,
                            self.limits.max_groups + 1,
                        )
                        .await?;
                    if rows.len() >= self.limits.max_groups
                        && batch
                            .load::<Id>(&["groups", principal, group])
                            .await?
                            .is_none()
                    {
                        return Err(err(libc::E2BIG, "group capacity"));
                    }
                    batch.save(&["groups", principal, group], group).await?;
                } else {
                    batch.remove(&["groups", principal, group]).await?;
                }
                applied.targets.push(state.root.clone());
                applied.reset = true;
            }
        }
        if let Some(node) = &applied.node {
            applied.changed.push(node.id.clone());
        }
        Ok(applied)
    }
}
