use anyhow::{Context, Result, ensure};
use clap::Args;
use dfs_protocol::{error::status, rpc::ErrorCode};
use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use slatedb::{
    Db, DbSnapshot, WriteBatch,
    config::{ObjectStoreCacheOptions, Settings},
    db_cache::foyer::{FoyerCache, FoyerCacheOptions},
    object_store::ObjectStore,
};
use std::{path::PathBuf, sync::Arc};
use tonic::Status;

#[derive(Args, Clone, Debug)]
pub struct CacheConfig {
    #[arg(long, env = "DFS_CACHE_MEMORY_MIB", default_value_t = 1024)]
    pub cache_memory_mib: u64,
    #[arg(long, env = "DFS_CACHE_DISK_GIB", default_value_t = 16)]
    pub cache_disk_gib: usize,
    #[arg(long, env = "DFS_MAX_UNFLUSHED_MIB", default_value_t = 512)]
    pub max_unflushed_mib: usize,
    #[arg(long, env = "DFS_CACHE_DIR", default_value = "/tmp/dfs-v1-cache")]
    pub cache_dir: PathBuf,
}
impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            cache_memory_mib: 1024,
            cache_disk_gib: 16,
            max_unflushed_mib: 512,
            cache_dir: "/tmp/dfs-v1-cache".into(),
        }
    }
}

pub struct Storage {
    pub(crate) db: Arc<Db>,
}
impl Storage {
    /// @cc [owner:spolu,label:backend] discard-owned-cache-on-start
    /// Startup MUST remove only this store's cache directory before opening SlateDB. A failed reset
    /// MUST fail startup. Foreign/nonempty unmarked databases MUST be rejected, never relabeled.
    pub async fn open(
        store: Arc<dyn ObjectStore>,
        prefix: &str,
        identity: &str,
        config: &CacheConfig,
    ) -> Result<Self> {
        ensure!(
            !prefix.is_empty() && !prefix.starts_with('/') && !prefix.ends_with('/'),
            "invalid storage prefix"
        );
        ensure!(
            prefix
                .split('/')
                .all(|p| !p.is_empty() && p != "." && p != ".."),
            "invalid storage prefix"
        );
        ensure!(
            config.max_unflushed_mib >= 8,
            "write budget must be at least 8 MiB"
        );
        let memory = config
            .cache_memory_mib
            .checked_mul(1024 * 1024)
            .context("RAM cache size overflow")?;
        let disk = config
            .cache_disk_gib
            .checked_mul(1024 * 1024 * 1024)
            .context("disk cache size overflow")?;
        let write = config
            .max_unflushed_mib
            .checked_mul(1024 * 1024)
            .context("write budget overflow")?;
        let directory = config
            .cache_dir
            .join(hex::encode(Sha256::digest(format!("{identity}/{prefix}"))));
        match tokio::fs::remove_dir_all(&directory).await {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e).context("reset owned cache"),
        }
        tokio::fs::create_dir_all(&directory).await?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700)).await?;
        }
        let settings = Settings {
            max_unflushed_bytes: write,
            l0_sst_size_bytes: (64 * 1024 * 1024).min(write / 4),
            object_store_cache_options: ObjectStoreCacheOptions {
                root_folder: (disk > 0).then_some(directory),
                max_cache_size_bytes: Some(disk),
                cache_on_flush: true,
                cache_on_compaction: true,
                preload_disk_cache_on_startup: None,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut builder = Db::builder(prefix, store).with_settings(settings);
        if memory == 0 {
            builder = builder.with_db_cache_disabled();
        } else {
            builder = builder.with_db_cache(
                Arc::new(FoyerCache::new_with_opts(FoyerCacheOptions {
                    max_capacity: memory,
                    ..Default::default()
                })),
                0,
            );
        }
        let db = Arc::new(builder.build().await?);
        if let Err(error) = check_format(&db).await {
            let _ = db.close().await;
            return Err(error);
        }
        Ok(Self { db })
    }
    pub async fn snapshot(&self) -> Result<Arc<DbSnapshot>, Status> {
        self.db.snapshot().await.map_err(failed)
    }
    pub async fn close(&self) -> Result<()> {
        self.db.close().await?;
        Ok(())
    }
    pub async fn flush(&self) -> Result<()> {
        self.db.flush().await?;
        Ok(())
    }
    pub(crate) async fn publish(&self, batch: WriteBatch) -> Result<(), Status> {
        if !batch.is_empty() {
            self.db.write(batch).await.map_err(failed)?;
        }
        Ok(())
    }
}
async fn check_format(db: &Db) -> Result<()> {
    if let Some(value) = db.get(b"dfs-format").await? {
        ensure!(
            value.as_ref() == b"dfs-v1-blocks-1",
            "incompatible database format"
        );
    } else {
        let mut scan = db.scan(..).await?;
        ensure!(scan.next().await?.is_none(), "unmarked nonempty database");
        db.put(b"dfs-format", b"dfs-v1-blocks-1")
            .await?
            .await_durable()
            .await?;
    }
    Ok(())
}
pub(crate) fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, Status> {
    postcard::to_stdvec(value).map_err(failed)
}
pub(crate) fn decode<T: DeserializeOwned>(value: &[u8]) -> Result<T, Status> {
    let (value, rest) = postcard::take_from_bytes(value).map_err(failed)?;
    if !rest.is_empty() {
        return Err(status(ErrorCode::Unavailable));
    }
    Ok(value)
}
pub(crate) fn failed(error: impl std::fmt::Display) -> Status {
    tracing::error!(error = %error, "storage operation failed");
    status(ErrorCode::Unavailable)
}
