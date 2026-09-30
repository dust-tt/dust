//! Volatile publication overlay and bounded local content staging.
mod staging;
mod worker;

use anyhow::{Context, Result, ensure};
use clap::{Args, ValueEnum};
use im::OrdMap;
use slatedb::{Db, WriteBatch, WriteHandle, bytes::Bytes};
pub(crate) use staging::LocalVersion;
use staging::Staging;
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
use tokio::sync::Notify;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, ValueEnum)]
pub enum WriteMode {
    #[default]
    Sync,
    Cached,
}

#[derive(Args, Clone)]
pub struct CacheConfig {
    /// Cached fsync acknowledges server visibility; sync waits for remote durability.
    #[arg(long, env = "DFS_WRITE_MODE", value_enum, default_value = "sync")]
    pub write_mode: WriteMode,
    /// Local disposable staging directory; never used as recovery input.
    #[arg(long, env = "DFS_CACHE_DIR", default_value_os_t = std::env::temp_dir())]
    pub cache_dir: PathBuf,
    #[arg(long, env = "DFS_CACHE_MEMORY_BYTES", default_value_t = 256 * 1024 * 1024)]
    pub cache_memory_bytes: u64,
    #[arg(long, env = "DFS_CACHE_DISK_BYTES", default_value_t = 4 * 1024 * 1024 * 1024)]
    pub cache_disk_bytes: u64,
    #[arg(long, env = "DFS_OVERLAY_BYTES", default_value_t = 128 * 1024 * 1024)]
    pub overlay_bytes: u64,
    #[arg(long, env = "DFS_PERSIST_INTERVAL_MS", default_value_t = 100)]
    pub persist_interval_ms: u64,
    #[arg(long, env = "DFS_PERSIST_CONCURRENCY", default_value_t = 16)]
    pub persist_concurrency: usize,
    #[arg(long, env = "DFS_PERSIST_DRAIN_TIMEOUT_SECONDS", default_value_t = 60)]
    pub persist_drain_timeout_seconds: u64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            write_mode: WriteMode::Sync,
            cache_dir: std::env::temp_dir(),
            cache_memory_bytes: 256 * 1024 * 1024,
            cache_disk_bytes: 4 * 1024 * 1024 * 1024,
            overlay_bytes: 128 * 1024 * 1024,
            persist_interval_ms: 100,
            persist_concurrency: 16,
            persist_drain_timeout_seconds: 60,
        }
    }
}

pub(super) type Rows = std::collections::BTreeMap<Vec<u8>, Option<Bytes>>;
pub(super) type Overlay = OrdMap<Vec<u8>, (u64, Option<Bytes>)>;
pub(super) type ContentPins = im::HashMap<Vec<u8>, Arc<LocalVersion>>;

pub(super) struct Pending {
    id: u64,
    rows: Rows,
    blobs: Vec<super::UploadedBlob>,
    bytes: u64,
}

#[derive(Default)]
struct State {
    overlay: Overlay,
    pins: ContentPins,
    pending: VecDeque<Arc<Pending>>,
    bytes: u64,
}

pub(super) struct Cache {
    config: CacheConfig,
    state: Mutex<State>,
    pub staging: Staging,
    wake: Notify,
    progress: Notify,
    pub visible: AtomicU64,
    pub applied: AtomicU64,
    pub durable: AtomicU64,
    failed: AtomicBool,
    #[cfg(test)]
    pub paused: AtomicBool,
    stop: AtomicBool,
    worker: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl Cache {
    pub fn new(config: CacheConfig) -> Result<Arc<Self>> {
        ensure!(
            config.overlay_bytes > 0
                && (1..=32).contains(&config.persist_concurrency)
                && config.persist_interval_ms <= 60_000
                && (1..=3600).contains(&config.persist_drain_timeout_seconds),
            "invalid cache configuration"
        );
        let staging = Staging::new(&config)?;
        Ok(Arc::new(Self {
            config,
            staging,
            state: Mutex::new(State::default()),
            wake: Notify::new(),
            progress: Notify::new(),
            visible: AtomicU64::new(0),
            applied: AtomicU64::new(0),
            durable: AtomicU64::new(0),
            failed: AtomicBool::new(false),
            #[cfg(test)]
            paused: AtomicBool::new(false),
            stop: AtomicBool::new(false),
            worker: Mutex::new(None),
        }))
    }

    #[cfg(test)]
    pub fn resume(&self) {
        self.wake.notify_one();
    }

    pub fn snapshot(&self) -> Result<Overlay> {
        Ok(self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("overlay unavailable"))?
            .overlay
            .clone())
    }

    pub fn content_pins(&self) -> Result<ContentPins> {
        Ok(self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("overlay unavailable"))?
            .pins
            .clone())
    }

    /// @cc [owner:spolu,label:backend;concurrency] atomic-volatile-publication
    /// Under the shared publication lock, publish rows, tombstones, indexes, and receipts as one
    /// immutable overlay snapshot. Reserve bounded queue capacity before changing visible state.
    /// Keep staged content alive until its ordered persistence batch is durable; never write a
    /// reference to SlateDB before its bytes exist remotely.
    pub fn publish(&self, rows: Rows, blobs: Vec<super::UploadedBlob>) -> Result<()> {
        ensure!(
            !self.failed.load(Ordering::Acquire) && !self.stop.load(Ordering::Acquire),
            "persistence unavailable"
        );
        let bytes = rows
            .iter()
            .map(|(key, value)| (key.len() + value.as_ref().map_or(0, Bytes::len) + 128) as u64)
            .sum::<u64>();
        let pins = blobs
            .iter()
            .filter_map(|blob| blob.local.as_ref().map(|local| (blob, local)))
            .map(|(blob, local)| Ok((blob.object_key()?, local.clone())))
            .collect::<Result<Vec<_>>>()?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("overlay unavailable"))?;
        ensure!(
            state.bytes.saturating_add(bytes) <= self.config.overlay_bytes
                && state.pending.len() < 65_536,
            "metadata staging capacity exhausted"
        );
        let id = self
            .visible
            .load(Ordering::Relaxed)
            .checked_add(1)
            .context("publication counter exhausted")?;
        for (key, value) in &rows {
            state.overlay.insert(key.clone(), (id, value.clone()));
            if value.is_none() {
                state.pins.remove(key);
            }
        }
        for (key, local) in pins {
            state.pins.insert(key, local);
        }
        state.bytes += bytes;
        state.pending.push_back(Arc::new(Pending {
            id,
            rows,
            blobs,
            bytes,
        }));
        self.visible.store(id, Ordering::Release);
        self.wake.notify_one();
        Ok(())
    }

    pub async fn drain(&self) -> Result<()> {
        let target = self.visible.load(Ordering::Acquire);
        loop {
            let progress = self.progress.notified();
            ensure!(
                !self.failed.load(Ordering::Acquire),
                "background persistence failed"
            );
            if self.durable.load(Ordering::Acquire) >= target {
                return Ok(());
            }
            self.wake.notify_one();
            progress.await;
        }
    }

    pub fn abort(&self) {
        self.stop.store(true, Ordering::Release);
        self.wake.notify_one();
        if let Ok(mut worker) = self.worker.lock()
            && let Some(worker) = worker.take()
        {
            worker.abort();
        }
    }

    pub async fn close(&self) -> Result<()> {
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(self.config.persist_drain_timeout_seconds),
            self.drain(),
        )
        .await
        .context("persistence drain timed out")?;
        self.stop.store(true, Ordering::Release);
        self.wake.notify_one();
        let worker = self
            .worker
            .lock()
            .map_err(|_| anyhow::anyhow!("worker unavailable"))?
            .take();
        if let Some(worker) = worker {
            worker.await?;
        }
        result
    }
}

pub(super) fn write_batch(rows: &Rows) -> WriteBatch {
    let mut batch = WriteBatch::new();
    for (key, value) in rows {
        match value {
            Some(value) => batch.put(key, value.clone()),
            None => batch.delete(key),
        }
    }
    batch
}

pub(super) enum Publication {
    Remote(WriteHandle),
    Visible,
}
impl Publication {
    pub async fn acknowledge(self) -> Result<()> {
        match self {
            Self::Remote(handle) => {
                handle.await_durable().await?;
                Ok(())
            }
            Self::Visible => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests;
