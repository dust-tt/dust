use super::*;
use dfs_protocol::ObjectRef;

struct Refresh<'a> {
    inner: &'a Inner,
    anchor: ObjectRef,
    base: Option<Attr>,
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

pub(in crate::cache) struct DirectoryRefresh<'a> {
    inner: &'a Inner,
    gate: Arc<Gate>,
}
impl Drop for DirectoryRefresh<'_> {
    fn drop(&mut self) {
        self.gate.refreshes.fetch_sub(1, Ordering::AcqRel);
        self.inner.changed.notify_one();
    }
}

impl Pending {
    pub(in crate::cache) fn expire(&mut self, id: &ObjectRef) {
        if let Some(node) = self.objects.get_mut(id) {
            node.expires = Instant::now();
        }
    }

    fn project(&self, id: &ObjectRef, base: Option<Attr>) -> Result<Option<Attr>> {
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
    /// @cc [owner:spolu,label:concurrency;performance] stabilize-directory-publication
    /// A raced listing MUST await captured in-flight groups with dispatch enabled. It MAY pause new
    /// dispatch only once no group is in flight, so queued edits can meet their buffering deadlines.
    /// During the final snapshot, queued edits MUST remain visible through the overlay. The pause
    /// MUST survive installation/projection and release on success, error or cancellation.
    pub(in crate::cache) async fn stabilize_directory(
        &self,
        id: &ObjectRef,
        gate: Arc<Gate>,
    ) -> Result<DirectoryRefresh<'_>> {
        let _wait = self.rpc.measure("wait.directory_inflight");
        loop {
            let inflight: Vec<_> = {
                let pending = self.pending.lock();
                let inflight: Vec<_> = pending
                    .objects
                    .get(id)
                    .into_iter()
                    .flat_map(|node| &node.pending)
                    .filter_map(|id| pending.groups.get(id))
                    .filter(|group| group.inflight)
                    .map(|group| group.receipt.clone())
                    .collect();
                if inflight.is_empty() {
                    gate.refreshes.fetch_add(1, Ordering::AcqRel);
                    return Ok(DirectoryRefresh { inner: self, gate });
                }
                inflight
            };
            for receipt in inflight {
                receipt.wait().await?;
            }
        }
    }

    fn begin_refresh(&self, id: &ObjectRef) -> Result<Option<Refresh<'_>>> {
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
            if !seen.insert(*anchor) || seen.len() > MAX_GROUPS + 1 {
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
                    Some(edit::Operation::Create(r)) if r.object_id == *anchor => Some(r.parent_id),
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
    pub(in crate::cache) async fn refresh_pending(&self, id: &ObjectRef) -> Result<bool> {
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
            .stat_one(ObjectRequest {
                object_id: refresh.anchor,
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
                    node.expires = self.deadline(started);
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
