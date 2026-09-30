use super::*;
use futures::{StreamExt, TryStreamExt, stream};
use slatedb::object_store::ObjectStore;
use tokio::sync::Mutex as AsyncMutex;

impl Cache {
    pub fn start(
        self: &Arc<Self>,
        metadata: Arc<Db>,
        blobs: Arc<dyn ObjectStore>,
        publish: Arc<AsyncMutex<()>>,
    ) -> Result<()> {
        let cache = Arc::downgrade(self);
        let worker = tokio::spawn(async move {
            loop {
                let Some(cache) = cache.upgrade() else {
                    return;
                };
                let wake = cache.wake.notified();
                if cache.stop.load(Ordering::Acquire) {
                    return;
                }
                let empty = match cache.state.lock() {
                    Ok(state) => state.pending.is_empty(),
                    Err(_) => {
                        cache.failed.store(true, Ordering::Release);
                        cache.progress.notify_waiters();
                        return;
                    }
                };
                if empty || {
                    #[cfg(test)]
                    {
                        cache.paused.load(Ordering::Acquire)
                    }
                    #[cfg(not(test))]
                    {
                        false
                    }
                } {
                    tokio::select! { _ = wake => {}, _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {} }
                    continue;
                }
                tokio::time::sleep(std::time::Duration::from_millis(
                    cache.config.persist_interval_ms,
                ))
                .await;
                let pending = match cache.state.lock() {
                    Ok(state) => state.pending.iter().take(4096).cloned().collect::<Vec<_>>(),
                    Err(_) => {
                        cache.failed.store(true, Ordering::Release);
                        cache.progress.notify_waiters();
                        return;
                    }
                };
                if let Err(error) = cache.persist(&metadata, &blobs, &publish, &pending).await {
                    tracing::warn!(error = %error, "background persistence deferred");
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
                if cache.failed.load(Ordering::Acquire) {
                    cache.progress.notify_waiters();
                    return;
                }
            }
        });
        *self
            .worker
            .lock()
            .map_err(|_| anyhow::anyhow!("worker unavailable"))? = Some(worker);
        Ok(())
    }

    /// @cc [owner:spolu,label:backend] ordered-background-persistence
    /// Coalesce a contiguous pending prefix and upload only versions referenced by its final object
    /// rows. Preserve receipts and events for all mutations. Reads MUST pin their selected local
    /// version before retirement; skipped versions MUST never enter the clean eviction cache.
    /// Blob retries MUST be create-only and verify ambiguous completion. Never skip a failed prefix.
    /// After a SlateDB submission error, stop persistence and reject new mutations until restart;
    /// retrying an ambiguous metadata batch could violate prefix ordering. Retirement MUST preserve
    /// newer overlay entries, and clean eviction MUST only follow remote content availability.
    async fn persist(
        &self,
        metadata: &Db,
        blobs: &Arc<dyn ObjectStore>,
        publish: &AsyncMutex<()>,
        pending: &[Arc<Pending>],
    ) -> Result<()> {
        let Some(last) = pending.last() else {
            return Ok(());
        };
        let mut rows = Rows::new();
        let mut latest = std::collections::BTreeMap::new();
        let mut versions = 0_u64;
        for batch in pending {
            rows.extend(batch.rows.clone());
            for blob in &batch.blobs {
                latest.insert(blob.object_key()?, blob.clone());
                versions += 1;
            }
        }
        let mut uploads = Vec::new();
        for (key, blob) in latest {
            if let Some(Some(value)) = rows.get(&key)
                && blob.is_referenced_by(value)?
            {
                uploads.push(blob);
            }
        }
        let uploaded_versions = uploads.len();
        let uploaded_bytes = uploads
            .iter()
            .map(|blob| blob.content().size_bytes)
            .sum::<u64>();
        stream::iter(uploads.clone())
            .map(|blob| async move { blob.persist(blobs).await })
            .buffer_unordered(self.config.persist_concurrency)
            .try_collect::<Vec<_>>()
            .await?;
        let result = async {
            let handle = {
                let _publish = publish.lock().await;
                metadata.write(write_batch(&rows)).await?
            };
            self.applied.store(last.id, Ordering::Release);
            handle.await_durable().await?;
            Ok::<_, anyhow::Error>(())
        }
        .await;
        if let Err(error) = result {
            self.failed.store(true, Ordering::Release);
            return Err(error);
        }
        {
            let _publish = publish.lock().await;
            let mut state = self
                .state
                .lock()
                .map_err(|_| anyhow::anyhow!("overlay unavailable"))?;
            for key in rows.keys() {
                if state.overlay.get(key).is_some_and(|(id, _)| *id <= last.id) {
                    state.overlay.remove(key);
                    state.pins.remove(key);
                }
            }
            for _ in pending {
                if let Some(batch) = state.pending.pop_front() {
                    state.bytes -= batch.bytes;
                }
            }
            self.durable.store(last.id, Ordering::Release);
        }
        for blob in &uploads {
            if let Some(local) = &blob.local {
                self.staging.retain_clean(local.clone())?;
            }
        }
        let (memory_bytes, disk_bytes) = self.staging.usage();
        tracing::info!(
            visible = self.visible.load(Ordering::Acquire),
            applied = self.applied.load(Ordering::Acquire),
            durable = last.id,
            uploaded_versions,
            uploaded_bytes,
            coalesced_versions = versions.saturating_sub(uploaded_versions as u64),
            memory_bytes,
            disk_bytes,
            "dfs persistence progress"
        );
        self.progress.notify_waiters();
        Ok(())
    }
}
