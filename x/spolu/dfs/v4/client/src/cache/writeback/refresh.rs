use super::*;

struct Refresh<'a> {
    inner: &'a Inner,
    anchor: String,
    base: Option<Object>,
    pins: Vec<(Arc<Gate>, u64)>,
    inflight: Vec<Arc<Receipt>>,
}
impl Refresh<'_> {
    fn unchanged(&self) -> bool {
        self.pins.iter().all(|(gate, generation)| {
            gate.primary_generation.load(Ordering::Acquire) == *generation
        })
    }
}
impl Drop for Refresh<'_> {
    fn drop(&mut self) {
        for (gate, _) in &self.pins {
            gate.refreshes.fetch_sub(1, Ordering::AcqRel);
        }
        self.inner.changed.notify_one();
    }
}

impl Pending {
    pub(in crate::cache) fn expire(&mut self, id: &str) {
        if let Some(node) = self.objects.get_mut(id) {
            node.expires = Instant::now();
        }
    }

    fn project(&self, id: &str, base: Option<Object>) -> Result<Option<Object>> {
        let mut current = base;
        if let Some(node) = self.objects.get(id) {
            for group in node.primary.iter().filter_map(|id| self.groups.get(id)) {
                for edit in &group.operations {
                    apply_metadata(&mut current, id, &edit.rpc)?;
                }
                if group.deleted.iter().any(|deleted| deleted == id) {
                    current = None;
                }
            }
            if !node.pending.is_empty()
                && let Some(object) = &mut current
            {
                object.revision.clear();
            }
        }
        Ok(current)
    }
}

impl Inner {
    fn begin_refresh(&self, id: &str) -> Result<Option<Refresh<'_>>> {
        let pending = self.pending.lock();
        let Some(node) = pending.objects.get(id) else {
            return Ok(None);
        };
        let mut refresh = Refresh {
            inner: self,
            anchor: id.into(),
            base: node.base.clone(),
            pins: vec![],
            inflight: vec![],
        };
        let mut seen = BTreeSet::new();
        loop {
            let anchor = &refresh.anchor;
            if !seen.insert(anchor.clone()) || seen.len() > MAX_GROUPS + 1 {
                return Err(status(ErrorCode::InvalidInput));
            }
            let gate = self.gate(anchor)?;
            gate.refreshes.fetch_add(1, Ordering::AcqRel);
            let generation = gate.primary_generation.load(Ordering::Acquire);
            refresh.pins.push((gate, generation));
            let Some(node) = pending.objects.get(anchor) else {
                break;
            };
            if let Some(error) = pending.errors.get(anchor) {
                return Err(status(*error));
            }
            // Existing ancestors are used only to validate a tentative creation's authority.
            if node.base.is_some() && anchor != id {
                break;
            }
            let groups: Vec<_> = node
                .primary
                .iter()
                .filter_map(|id| pending.groups.get(id))
                .collect();
            refresh.inflight.extend(
                groups
                    .iter()
                    .filter(|g| g.inflight)
                    .map(|g| g.receipt.clone()),
            );
            if node.base.is_some() {
                break;
            }
            // Only a queued local create can justify a missing server object. Deleted objects
            // never become new empty bases, and a creation in flight must resolve before rebasing.
            refresh.anchor = groups
                .iter()
                .flat_map(|g| &g.operations)
                .find_map(|operation| match &operation.rpc.operation {
                    Some(edit::Operation::Create(r)) if r.object_id == *anchor => {
                        Some(r.parent_id.clone())
                    }
                    _ => None,
                })
                .ok_or_else(|| status(ErrorCode::NotFound))?;
        }
        Ok(Some(refresh))
    }

    /// @cc [owner:spolu,label:concurrency;security] refresh-pending-without-publication
    /// Expiry MUST NOT force queued edits to publish. Refresh MUST preserve ordered local edits and
    /// coherent size/blocks, with dispatch paused until its snapshot is installed or discarded.
    /// A changed base with unresolved primary writes MUST wait only their captured in-flight results;
    /// an unchanged base MAY retain them. Pending creates MUST validate an existing ancestor and MUST
    /// resolve in-flight creations before treating their base as absent. Hits/edits MUST NOT renew TTLs.
    pub(in crate::cache) async fn refresh_pending(&self, id: &str) -> Result<bool> {
        let Some(refresh) = self.begin_refresh(id)? else {
            return Ok(false);
        };
        if refresh.base.is_none() && !refresh.inflight.is_empty() {
            let receipts = refresh.inflight.clone();
            drop(refresh);
            return self.wait_refresh(receipts).await;
        }
        let started = Instant::now();
        let result = self
            .rpc
            .stat(ObjectRequest {
                object_id: refresh.anchor.clone(),
            })
            .await;
        let received = Instant::now();
        self.active()?;
        let wait = {
            let mut pending = self.pending.lock();
            if !refresh.unchanged() {
                return Ok(true);
            }
            let same_base = matches!((&refresh.base, &result), (Some(base), Ok(object)) if base.revision == object.revision);
            if !same_base && !refresh.inflight.is_empty() {
                Some(refresh.inflight.clone())
            } else {
                let object = match result {
                    Ok(object) => object,
                    Err(error) => {
                        pending.expire(id);
                        return Err(error);
                    }
                };
                let base = if refresh.base.is_some() {
                    Some(object.clone())
                } else {
                    if !object.directory {
                        return Err(status(ErrorCode::NotDirectory));
                    }
                    None
                };
                let current = pending.project(id, base.clone())?;
                let bytes = base.as_ref().map_or(0, object_weight)
                    + current.as_ref().map_or(0, object_weight);
                let memory = self
                    .cache
                    .lock()
                    .reserve(bytes * 2)
                    .ok_or_else(|| status(ErrorCode::Capacity))?;
                if let Some(node) = pending.objects.get_mut(id) {
                    node.base = base;
                    node.current = current;
                    node.expires = self.deadline(received);
                    node._refresh_memory = Some(memory);
                }
                self.remember_object(&object, started, received);
                self.rpc.record(
                    if refresh.base.is_some() {
                        "refresh.rebase"
                    } else {
                        "refresh.tentative"
                    },
                    started.elapsed(),
                    false,
                );
                None
            }
        };
        drop(refresh);
        if let Some(receipts) = wait {
            self.wait_refresh(receipts).await?;
        }
        Ok(true)
    }

    async fn wait_refresh(&self, receipts: Vec<Arc<Receipt>>) -> Result<bool> {
        let _wait = self.rpc.measure("wait.refresh_inflight");
        for receipt in receipts {
            receipt.wait().await?;
        }
        Ok(true)
    }
}
