use super::*;

impl CachedClient {
    pub fn get_metadata(&self, request: ObjectRequest) -> Result<Metadata> {
        self.run(async {
            let gate = self.inner.gate(&request.object_id)?;
            let _guard = gate.mutex.lock().await;
            self.inner.metadata_locked(&request.object_id, &gate).await
        })
    }
}
impl Inner {
    /// @cc [owner:spolu,label:concurrency;security] revision-bound-extended-metadata
    /// Extended metadata MUST match freshly authorized attributes. Pending edits MUST settle before
    /// fetching canonical xattrs; only this object's finite prefix may be forced. Caller MUST hold
    /// the object gate to prevent an edit racing metadata validation or installation.
    pub(super) async fn metadata_locked(&self, id: &ObjectRef, gate: &Gate) -> Result<Metadata> {
        self.flush(id).await?;
        let object = self.stat_locked(id, gate).await?;
        let key = Key::Metadata(*id, object.revision);
        if let Some(entry) = self.cache.lock().get(&key)
            && let Value::Metadata(metadata) = &entry.value
        {
            return Ok(metadata.clone());
        }
        let started = Instant::now();
        let metadata = self
            .rpc
            .get_metadata(ObjectRequest { object_id: *id })
            .await?;
        self.active()?;
        if metadata.object.id != *id || metadata.object.read_version < object.read_version {
            return Err(status(ErrorCode::StaleView));
        }
        let received = Instant::now();
        self.remember_object(&metadata.object, started, received);
        self.cache.lock().insert(
            Key::Metadata(*id, metadata.object.revision),
            Value::Metadata(metadata.clone()),
            received,
            self.expires,
        );
        Ok(metadata)
    }
}
