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
pub use commit::{BlobUpload, MetadataBatch, MetadataMutation};
use keys::Keyspace;
pub use read::{ChangeEvent, ReadView};

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
}

impl StorageConfig {
    /// Without storage configuration, only the existing HTTP scaffold is started.
    pub async fn open(&self) -> Result<Option<Storage>> {
        match (&self.gcs_bucket, &self.gcs_prefix) {
            (None, None) => Ok(None),
            (Some(bucket), Some(prefix)) => {
                let store = gcs_store(bucket)?;
                Ok(Some(Storage::open(store, prefix).await?))
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
    metadata: Db,
    blobs: Arc<dyn ObjectStore>,
    publish: Mutex<()>,
}

/// A trusted internal handle. Session authorization is required before constructing or using it.
pub struct WorkspaceStorage<'a> {
    storage: &'a Storage,
    keys: Keyspace,
}

impl WorkspaceStorage<'_> {
    pub async fn read_view(&self) -> Result<ReadView> {
        Ok(ReadView {
            keys: self.keys.clone(),
            snapshot: self.storage.metadata.snapshot().await?,
        })
    }
}

impl Storage {
    pub fn workspace(&self, workspace: &WorkspaceId) -> Result<WorkspaceStorage<'_>> {
        Ok(WorkspaceStorage {
            storage: self,
            keys: Keyspace::new(workspace.clone())?,
        })
    }

    /**
     * @cc [owner:spolu,label:error-handling] bounded-storage-retries
     * SlateDB and its background workers MUST NOT retry backend failures indefinitely. Rely on
     * the GCS client's bounded retries so credential and exhausted I/O failures can propagate.
     */
    pub(crate) async fn open(store: Arc<dyn ObjectStore>, prefix: &StoragePrefix) -> Result<Self> {
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
        let metadata = Db::builder(prefix.metadata_path(), store)
            .with_settings(settings)
            .with_db_cache_disabled()
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
            metadata,
            blobs,
            publish: Mutex::new(()),
        })
    }

    /**
     * @cc [owner:spolu,label:concurrency] storage-shutdown
     * After draining HTTP requests, shutdown MUST await SlateDB close and propagate its failure.
     * Dropping the server's storage handle MUST NOT be treated as a successful close.
     */
    pub async fn close(&self) -> Result<()> {
        self.metadata
            .close()
            .await
            .context("close SlateDB metadata store")
    }
}

mod codec;
mod commit;
mod keys;
mod read;
#[cfg(test)]
mod tests;
mod workspace;
