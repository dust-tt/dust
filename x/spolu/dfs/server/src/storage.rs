use std::{str::FromStr, sync::Arc};

use anyhow::{Context, Result, bail};
use clap::Args;
use slatedb::{
    Db, Settings,
    config::{CompactorOptions, GarbageCollectorOptions},
    object_store::{ObjectStore, gcp::GoogleCloudStorageBuilder, path::Path, prefix::PrefixStore},
};
use thiserror::Error;
use tokio::sync::Mutex;

use crate::model::WorkspaceId;
pub use cache::{CacheConfig, WriteMode};
pub use commit::{MetadataBatch, MetadataMutation};
pub use content::BlobRead;
use keys::Keyspace;
pub use operations::OperationRecord;
pub use read::{ChangeEvent, ReadView};
pub use upload::{MAX_FILE_BYTES, UploadConfig, UploadError, UploadedBlob};

/**
 * @cc [owner:spolu,label:backend] explicit-storage-configuration
 * GCS storage MUST require both a bucket and a nonempty dedicated prefix. Configured storage
 * failures MUST fail startup, never fall back to ephemeral storage. Credentials MUST come from
 * ADC (GOOGLE_APPLICATION_CREDENTIALS, local ADC, or attached credentials), not command-line
 * arguments, checked-in files, or unrelated SERVICE_ACCOUNT environment configuration.
 */
#[derive(Args)]
pub struct StorageConfig {
    /// Existing GCS bucket name, without gs:// or an object path.
    #[arg(long, env = "DFS_GCS_BUCKET", requires = "gcs_prefix")]
    gcs_bucket: Option<String>,

    /// Dedicated prefix within the bucket, such as dfs-dev/spolu.
    #[arg(long, env = "DFS_GCS_PREFIX", requires = "gcs_bucket")]
    gcs_prefix: Option<StoragePrefix>,

    #[command(flatten)]
    uploads: UploadConfig,

    #[command(flatten)]
    cache: CacheConfig,
}

impl StorageConfig {
    /// Without storage configuration, only the existing HTTP scaffold is started.
    pub async fn open(&self) -> Result<Option<Storage>> {
        match (&self.gcs_bucket, &self.gcs_prefix) {
            (None, None) => Ok(None),
            (Some(bucket), Some(prefix)) => {
                let store = gcs_store(bucket)?;
                let transfers = self.uploads.budget()?;
                let mut storage = Storage::open(store, prefix).await?;
                storage.transfers = Arc::new(transfers);
                storage.enable_cache(self.cache.clone())?;
                Ok(Some(storage))
            }
            _ => bail!("GCS storage requires both --gcs-bucket and --gcs-prefix"),
        }
    }
}

fn gcs_store(bucket: &str) -> Result<Arc<dyn ObjectStore>> {
    if bucket.is_empty() || bucket.contains(['/', ':']) || bucket.chars().any(char::is_whitespace) {
        bail!("expected a GCS bucket name without a scheme or path");
    }
    let builder = GoogleCloudStorageBuilder::new().with_bucket_name(bucket);
    let builder = match std::env::var("GOOGLE_APPLICATION_CREDENTIALS") {
        Ok(path) => builder.with_application_credentials(path),
        Err(std::env::VarError::NotPresent) => builder,
        Err(std::env::VarError::NotUnicode(_)) => {
            bail!("GOOGLE_APPLICATION_CREDENTIALS must be a UTF-8 file path")
        }
    };
    let store = builder.build().context("configure GCS credentials")?;
    Ok(Arc::new(store))
}

/**
 * @cc [owner:spolu,label:backend] storage-prefix-separation
 * Storage prefixes MUST be nonempty canonical relative paths. Reject empty, dot, and traversal
 * components instead of normalizing them. SlateDB objects MUST live under metadata/ and file
 * contents under blobs/ within the configured prefix; neither may address the bucket root.
 */
#[derive(Clone, Debug)]
pub struct StoragePrefix(Path);

impl StoragePrefix {
    pub fn metadata_path(&self) -> Path {
        self.0.clone().join("metadata")
    }

    pub fn blobs_path(&self) -> Path {
        self.0.clone().join("blobs")
    }
}

impl FromStr for StoragePrefix {
    type Err = InvalidStoragePrefix;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.split('/').any(|component| {
            component.is_empty()
                || matches!(component, "." | "..")
                || !component
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        }) {
            return Err(InvalidStoragePrefix);
        }
        Path::parse(value)
            .map(Self)
            .map_err(|_| InvalidStoragePrefix)
    }
}

#[derive(Debug, Error)]
#[error(
    "expected a nonempty relative prefix using letters, digits, '-', '_', '.', and '/' separators"
)]
pub struct InvalidStoragePrefix;

pub struct Storage {
    metadata: Arc<Db>,
    metadata_cache: Arc<dyn slatedb::db_cache::DbCache>,
    blobs: Arc<dyn ObjectStore>,
    publish: Arc<Mutex<()>>,
    cache: Option<Arc<cache::Cache>>,
    object_locks: locks::ObjectLockTable,
    transfers: Arc<upload::TransferBudget>,
    content_locks: locks::ObjectLockTable,
    request_locks: locks::ObjectLockTable,
}

/// A trusted internal handle. Session authorization is required before constructing or using it.
pub struct WorkspaceStorage<'a> {
    storage: &'a Storage,
    keys: Keyspace,
}

impl WorkspaceStorage<'_> {
    pub async fn read_view(&self) -> Result<ReadView> {
        let _publish = if self.storage.cache.is_some() {
            Some(self.storage.publish.lock().await)
        } else {
            None
        };
        self.read_view_inner().await
    }

    async fn read_view_inner(&self) -> Result<ReadView> {
        Ok(ReadView {
            _content_pins: self
                .storage
                .cache
                .as_ref()
                .map(|cache| cache.content_pins())
                .transpose()?
                .unwrap_or_default(),
            overlay: self
                .storage
                .cache
                .as_ref()
                .map(|cache| cache.snapshot())
                .transpose()?
                .unwrap_or_default(),
            keys: self.keys.clone(),
            snapshot: self.storage.metadata.snapshot().await?,
        })
    }
}

impl Storage {
    async fn get_visible(&self, key: Vec<u8>) -> Result<Option<slatedb::bytes::Bytes>> {
        if let Some(cache) = &self.cache
            && let Some((_, value)) = cache.snapshot()?.get(&key)
        {
            return Ok(value.clone());
        }
        Ok(self.metadata.get(key).await?)
    }

    pub(crate) async fn reserve_transfer(&self) -> Result<upload::TransferLease, UploadError> {
        self.transfers.acquire().await
    }

    pub fn workspace(&self, workspace: &WorkspaceId) -> Result<WorkspaceStorage<'_>> {
        Ok(WorkspaceStorage {
            storage: self,
            keys: Keyspace::new(workspace.clone())?,
        })
    }

    /// Enable volatile publication before exposing this storage to clients.
    pub fn enable_cache(&mut self, config: CacheConfig) -> Result<()> {
        if config.write_mode == WriteMode::Cached {
            anyhow::ensure!(self.cache.is_none(), "cache already enabled");
            let cache = cache::Cache::new(config)?;
            cache.start(
                self.metadata.clone(),
                self.blobs.clone(),
                self.publish.clone(),
            )?;
            self.cache = Some(cache);
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn pause_persistence(&self, paused: bool) {
        if let Some(cache) = &self.cache {
            cache
                .paused
                .store(paused, std::sync::atomic::Ordering::Release);
            cache.resume();
        }
    }

    pub fn cached(&self) -> bool {
        self.cache.is_some()
    }

    /// Explicit maintenance/shutdown barrier; cached client fsync does not call this.
    pub async fn drain_persistence(&self) -> Result<()> {
        if let Some(cache) = &self.cache {
            cache.drain().await?;
        }
        self.metadata.flush().await?;
        Ok(())
    }

    /**
     * @cc [owner:spolu,label:error-handling] bounded-storage-retries
     * Each backend attempt MUST use bounded retries. Cached blob persistence may retry with backoff
     * while bounded staging applies backpressure. A SlateDB submission/durability error MUST halt
     * cached publication until restart; it MUST NOT retry an ambiguously submitted metadata batch.
     */
    pub async fn open(store: Arc<dyn ObjectStore>, prefix: &StoragePrefix) -> Result<Self> {
        Self::open_with_settings(
            store,
            prefix,
            Settings {
                object_store_max_retries: Some(0),
                compactor_options: Some(CompactorOptions {
                    object_store_max_retries: Some(0),
                    ..Default::default()
                }),
                garbage_collector_options: Some(GarbageCollectorOptions {
                    object_store_max_retries: Some(0),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .await
    }

    async fn open_with_settings(
        store: Arc<dyn ObjectStore>,
        prefix: &StoragePrefix,
        settings: Settings,
    ) -> Result<Self> {
        let blobs = Arc::new(PrefixStore::new(store.clone(), prefix.blobs_path()));
        let metadata_cache = Arc::new(slatedb::db_cache::foyer::FoyerCache::new());
        let metadata = Db::builder(prefix.metadata_path(), store)
            .with_settings(settings)
            .with_db_cache(metadata_cache.clone(), 0)
            .build()
            .await
            .context("open SlateDB metadata store")?;
        if let Err(error) = codec::check_format(&metadata).await {
            metadata
                .close()
                .await
                .context("close incompatible metadata store")?;
            return Err(error);
        }
        Ok(Self {
            metadata: Arc::new(metadata),
            metadata_cache,
            blobs,
            publish: Arc::new(Mutex::new(())),
            cache: None,
            object_locks: locks::ObjectLockTable::default(),
            transfers: Arc::new(UploadConfig::default().budget()?),
            content_locks: locks::ObjectLockTable::default(),
            request_locks: locks::ObjectLockTable::default(),
        })
    }

    /**
     * @cc [owner:spolu,label:concurrency] storage-shutdown
     * After draining HTTP requests, shutdown MUST drain cached publication with a bounded timeout,
     * then await SlateDB close and propagate failures.
     * Dropping the server's storage handle MUST NOT be treated as a successful close.
     */
    pub async fn close(&self) -> Result<()> {
        if let Some(cache) = &self.cache {
            cache.close().await?;
        }
        self.metadata
            .close()
            .await
            .context("close SlateDB metadata store")?;
        self.metadata_cache.close().await?;
        Ok(())
    }
}

pub(crate) mod cache;
mod codec;
mod commit;
mod content;
mod keys;
mod locks;
mod operations;
mod read;
#[cfg(test)]
mod tests;
mod upload;
mod workspace;

impl Drop for Storage {
    fn drop(&mut self) {
        if let Some(cache) = &self.cache {
            cache.abort();
        }
    }
}
