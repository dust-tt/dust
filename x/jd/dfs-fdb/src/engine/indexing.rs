use super::*;

pub(crate) const MAX_TEXT_BYTES: u64 = 8 << 20;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Checkpoint {
    pub uuid: String,
    pub head: u64,
}

pub(crate) struct IndexPlan {
    pub tenant: Id,
    pub session: Id,
    pub expected: Option<Checkpoint>,
    pub next: Checkpoint,
    pub source_head: u64,
    pub nodes: Vec<Id>,
    batch: PublicationBatch,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Document {
    pub node_id: Id,
    pub source_version: Id,
    pub entry_token: Id,
    pub basename: String,
    pub kind: String,
    pub size: u64,
    pub mtime_ms: u64,
    pub deleted: bool,
    pub source_head: u64,
    pub content_status: String,
    pub text: Option<String>,
}

impl Engine {
    pub(crate) async fn prepare_index(
        &self,
        session: &str,
        uuid: &str,
        limit: usize,
    ) -> Result<IndexPlan> {
        if limit == 0 || limit > 1024 {
            return Err(err(libc::EINVAL, "index event batch size"));
        }
        let context = self.context(session).await?;
        if !context.record.session.admin || context.record.session.scope.is_some() {
            return Err(err(
                libc::EACCES,
                "indexing requires unscoped administrator",
            ));
        }
        let expected: Option<Checkpoint> = context.batch.load(&["index_checkpoint"]).await?;
        let previous = expected.as_ref().filter(|c| c.uuid == uuid);
        let from = previous.map_or(0, |c| c.head);
        if from > context.state.head || from < context.state.journal_floor {
            return Err(err(
                libc::ESTALE,
                "index checkpoint outside retained journal",
            ));
        }
        let through = context.state.head.min(from.saturating_add(limit as u64));
        let mut nodes = BTreeSet::new();
        if previous.is_none() {
            nodes.insert(context.state.root.clone());
        }
        if through > from {
            let after = key(&["index_event", &format!("{from:020}")]);
            let events = context
                .batch
                .scan(
                    &key(&["index_event"]),
                    Some(&after),
                    (through - from) as usize,
                )
                .await?;
            if events.len() != (through - from) as usize {
                return Err(err(libc::EIO, "index journal gap"));
            }
            for (offset, (event_key, bytes)) in events.into_iter().enumerate() {
                let head = from + offset as u64 + 1;
                let event: IndexEvent = decode(&bytes, VALUE_LIMIT)?;
                if event.head != head
                    || event.nodes.len() > 4
                    || event_key != key(&["index_event", &format!("{head:020}")])
                {
                    return Err(err(libc::EIO, "invalid index event"));
                }
                nodes.extend(event.nodes);
            }
        }
        Ok(IndexPlan {
            tenant: context.record.session.tenant,
            session: session.to_owned(),
            expected,
            next: Checkpoint {
                uuid: uuid.to_owned(),
                head: through,
            },
            source_head: context.state.head,
            nodes: nodes.into_iter().collect(),
            batch: context.batch,
        })
    }

    pub(crate) async fn index_document(&self, plan: &IndexPlan, node: &str) -> Result<Document> {
        let node = plan.batch.node(node).await?;
        let mut status = if node.unlinked {
            "deleted"
        } else if node.kind == Kind::Directory {
            "directory"
        } else if node.size > MAX_TEXT_BYTES {
            "too_large"
        } else {
            "indexed"
        };
        let text = if status == "indexed" {
            let manifest = self.manifest(&plan.batch, &node, &node.version).await?;
            let mut bytes = Vec::with_capacity(node.size as usize);
            while (bytes.len() as u64) < node.size {
                let page = self
                    .read_manifest(
                        &plan.batch,
                        &manifest,
                        bytes.len() as u64,
                        (node.size - bytes.len() as u64).min(MAX_IO_BYTES as u64) as u32,
                    )
                    .await?;
                if page.is_empty() {
                    return Err(err(libc::EIO, "index content length mismatch"));
                }
                bytes.extend(page);
            }
            match String::from_utf8(bytes) {
                Ok(text) if !text.contains('\0') => Some(text),
                _ => {
                    status = "binary";
                    None
                }
            }
        } else {
            None
        };
        Ok(Document {
            node_id: node.id,
            source_version: node.version,
            entry_token: node.entry_token,
            basename: node.name,
            kind: if node.kind == Kind::File {
                "file"
            } else {
                "directory"
            }
            .to_owned(),
            size: node.size,
            mtime_ms: node.mtime_ms,
            deleted: node.unlinked,
            source_head: plan.source_head,
            content_status: status.to_owned(),
            text,
        })
    }

    pub(crate) async fn finish_index(&self, plan: &IndexPlan) -> Result<bool> {
        for attempt in 0..RETRIES {
            let mut context = self.session_context(&plan.session).await?;
            if !context.record.session.admin
                || context.record.session.scope.is_some()
                || context.record.session.tenant != plan.tenant
            {
                return Err(err(libc::EACCES, "index authority changed"));
            }
            let current: Option<Checkpoint> = context.batch.load(&["index_checkpoint"]).await?;
            if current != plan.expected {
                return Ok(false);
            }
            context
                .batch
                .save(&["index_checkpoint"], &plan.next)
                .await?;
            if matches!(context.batch.commit().await?, Commit::Published { .. }) {
                return Ok(true);
            }
            backoff(attempt).await;
        }
        Err(err(libc::EAGAIN, "index checkpoint contention"))
    }
}
