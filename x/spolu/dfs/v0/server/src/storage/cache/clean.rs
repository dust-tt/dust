use std::{
    hash::{BuildHasherDefault, DefaultHasher},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

use anyhow::{Result, ensure};
use foyer::{
    BlockEngineConfig, DeviceBuilder, FsDeviceBuilder, HybridCache, HybridCacheBuilder,
    HybridCachePolicy,
};
use slatedb::bytes::Bytes;

type Disk = HybridCache<String, Vec<u8>, BuildHasherDefault<DefaultHasher>>;

/// @cc [owner:spolu,label:security;backend] disposable-clean-content
/// Admit only immutable bytes already available remotely, under complete workspace/object/version
/// and block-offset keys. Callers MUST provide a fresh empty directory scoped by bucket and database
/// prefix, and MUST authorize reads using current metadata. Never recover data from a previous start.
/// Cache read failures, mismatched keys, or wrong lengths MUST miss and fall back to the remote store.
pub(crate) struct CleanCache {
    disk: Disk,
    hits: AtomicU64,
    misses: AtomicU64,
}

impl CleanCache {
    pub async fn open(directory: &Path, capacity: usize) -> Result<Self> {
        ensure!(
            capacity >= 64 * 1024 * 1024,
            "content read cache requires at least 64 MiB"
        );
        let device = FsDeviceBuilder::new(directory)
            .with_capacity(capacity)
            .build()?;
        let disk = HybridCacheBuilder::new()
            .with_name("dfs-clean-content")
            .with_policy(HybridCachePolicy::WriteOnInsertion)
            .memory(4 * 1024 * 1024)
            .with_hash_builder(BuildHasherDefault::<DefaultHasher>::default())
            .with_weighter(|key: &String, bytes: &Vec<u8>| 128 + key.len() + bytes.len())
            .storage()
            .with_engine_config(BlockEngineConfig::new(device))
            .build()
            .await?;
        Ok(Self {
            disk,
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
        })
    }

    fn key(path: &slatedb::object_store::path::Path, block: u64) -> String {
        format!("{path}/{block}")
    }

    pub async fn get(
        &self,
        path: &slatedb::object_store::path::Path,
        block: u64,
        length: usize,
    ) -> Option<Bytes> {
        let key = Self::key(path, block);
        if let Ok(Some(entry)) = self.disk.get(&key).await {
            if entry.key() == &key && entry.value().len() == length {
                self.hits.fetch_add(1, Ordering::Relaxed);
                return Some(Bytes::copy_from_slice(entry.value()));
            }
            self.disk.remove(&key);
        }
        self.misses.fetch_add(1, Ordering::Relaxed);
        None
    }

    pub fn insert(&self, path: &slatedb::object_store::path::Path, block: u64, bytes: &[u8]) {
        if bytes.len() > 1024 * 1024 {
            return;
        }
        self.disk.insert(Self::key(path, block), bytes.to_vec());
    }

    /// Pace background prefill so bursts do not overflow the best-effort admission buffers.
    pub async fn wait(&self) {
        self.disk.storage().wait().await;
    }

    pub async fn close(&self) -> Result<()> {
        self.disk.close().await?;
        tracing::info!(
            clean_disk_hits = self.hits.load(Ordering::Relaxed),
            clean_disk_misses = self.misses.load(Ordering::Relaxed),
            "dfs disk content cache metrics"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use slatedb::object_store::path::Path as ObjectPath;

    #[tokio::test]
    async fn cached_blocks_keep_exact_keys_and_reject_wrong_lengths() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let key = ObjectPath::from("v1/workspace/object/version");
        let cache = CleanCache::open(directory.path(), 64 * 1024 * 1024).await?;
        cache.insert(&key, 0, b"hello");
        cache.wait().await;
        ensure!(cache.get(&key, 0, 5).await == Some(Bytes::from_static(b"hello")));
        for other in ["v1/other/object/version", "v1/workspace/object/new"] {
            ensure!(cache.get(&ObjectPath::from(other), 0, 5).await.is_none());
        }
        ensure!(cache.get(&key, 1, 5).await.is_none());
        ensure!(cache.get(&key, 0, 6).await.is_none());
        cache.close().await?;
        Ok(())
    }
}
