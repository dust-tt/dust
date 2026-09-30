use super::CacheConfig;
use crate::storage::{MAX_FILE_BYTES, UploadError};
use anyhow::{Result, ensure};
use futures::{
    Stream, StreamExt,
    stream::{self, BoxStream},
};
use im::OrdMap;
use sha2::{Digest, Sha256};
use slatedb::{
    bytes::{Bytes, BytesMut},
    object_store::path::Path,
};
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicU64, Ordering},
    },
};

const PAGE: u64 = 64 * 1024;

struct Budget {
    used: Arc<AtomicU64>,
    limit: u64,
}
struct Lease {
    used: Arc<AtomicU64>,
    size: u64,
}
impl Budget {
    fn reserve(&self, size: u64) -> Option<Lease> {
        self.used
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |used| {
                used.checked_add(size).filter(|sum| *sum <= self.limit)
            })
            .ok()?;
        Some(Lease {
            used: self.used.clone(),
            size,
        })
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        self.used.fetch_sub(self.size, Ordering::AcqRel);
    }
}

enum Data {
    Memory(Bytes),
    Disk(tempfile::TempPath),
}
struct Chunk {
    data: Data,
    _lease: Lease,
}
impl Chunk {
    async fn read(self: &Arc<Self>) -> Result<Bytes> {
        match &self.data {
            Data::Memory(bytes) => Ok(bytes.clone()),
            Data::Disk(_) => {
                let chunk = self.clone();
                tokio::task::spawn_blocking(move || match &chunk.data {
                    Data::Disk(path) => Ok(Bytes::from(std::fs::read(path)?)),
                    Data::Memory(bytes) => Ok(bytes.clone()),
                })
                .await?
            }
        }
    }
}

/// Immutable pages share unchanged content across versions, including pending versions.
pub(crate) struct LocalVersion {
    pages: OrdMap<u64, Arc<Chunk>>,
    pub size: u64,
}
impl LocalVersion {
    async fn page(&self, number: u64) -> Result<Bytes> {
        match self.pages.get(&number) {
            Some(chunk) => chunk.read().await,
            None => Ok(Bytes::new()),
        }
    }
    pub fn stream(self: &Arc<Self>, offset: u64, length: u64) -> BoxStream<'static, Result<Bytes>> {
        let end = self.size.min(offset.saturating_add(length));
        stream::try_unfold(
            (self.clone(), offset),
            move |(version, offset)| async move {
                if offset >= end {
                    return Ok(None);
                }
                let page = version.page(offset / PAGE).await?;
                let start = (offset % PAGE) as usize;
                let count = (end - offset).min(PAGE - offset % PAGE) as usize;
                let bytes = if start + count <= page.len() {
                    page.slice(start..start + count)
                } else {
                    let mut bytes = vec![0; count];
                    if start < page.len() {
                        let count = count.min(page.len() - start);
                        bytes[..count].copy_from_slice(&page[start..start + count]);
                    }
                    Bytes::from(bytes)
                };
                Ok(Some((bytes, (version, offset + count as u64))))
            },
        )
        .boxed()
    }
}

#[derive(Default)]
struct Index {
    versions: HashMap<Path, Weak<LocalVersion>>,
    blocks: HashMap<(Path, u64), Weak<Chunk>>,
    clean: VecDeque<Clean>,
}

enum Clean {
    Version { _version: Arc<LocalVersion> },
    Block { _chunk: Arc<Chunk> },
}

pub(crate) struct Staging {
    memory: Budget,
    disk: Budget,
    directory: tempfile::TempDir,
    index: Mutex<Index>,
}

impl Staging {
    pub fn new(config: &CacheConfig) -> Result<Self> {
        ensure!(
            config.cache_memory_bytes > 0 || config.cache_disk_bytes > 0,
            "empty staging budget"
        );
        std::fs::create_dir_all(&config.cache_dir)?;
        Ok(Self {
            memory: Budget {
                used: Arc::new(AtomicU64::new(0)),
                limit: config.cache_memory_bytes,
            },
            disk: Budget {
                used: Arc::new(AtomicU64::new(0)),
                limit: config.cache_disk_bytes,
            },
            directory: tempfile::Builder::new()
                .prefix("dfs-cache-")
                .tempdir_in(&config.cache_dir)?,
            index: Mutex::new(Index::default()),
        })
    }

    pub fn get(&self, key: &Path) -> Result<Option<Arc<LocalVersion>>> {
        Ok(self
            .index
            .lock()
            .map_err(|_| anyhow::anyhow!("content cache unavailable"))?
            .versions
            .get(key)
            .and_then(Weak::upgrade))
    }

    pub fn register(&self, key: Path, version: Arc<LocalVersion>) -> Result<Arc<LocalVersion>> {
        let mut index = self
            .index
            .lock()
            .map_err(|_| anyhow::anyhow!("content cache unavailable"))?;
        if index.versions.len() >= 65_536 {
            index.versions.retain(|_, value| value.strong_count() > 0);
        }
        ensure!(
            index.versions.len() < 131_072,
            "content version capacity exhausted"
        );
        index.versions.insert(key, Arc::downgrade(&version));
        Ok(version)
    }

    pub fn retain_clean(&self, version: Arc<LocalVersion>) -> Result<()> {
        let mut index = self
            .index
            .lock()
            .map_err(|_| anyhow::anyhow!("content cache unavailable"))?;
        if index.clean.len() >= 8192 {
            index.clean.pop_front();
        }
        index.clean.push_back(Clean::Version { _version: version });
        Ok(())
    }

    pub async fn read_block(
        &self,
        store: &Arc<dyn slatedb::object_store::ObjectStore>,
        path: &Path,
        size: u64,
        block: u64,
    ) -> Result<Bytes> {
        use slatedb::object_store::{GetOptions, GetRange};
        let key = (path.clone(), block);
        let cached = self
            .index
            .lock()
            .map_err(|_| anyhow::anyhow!("cache unavailable"))?
            .blocks
            .get(&key)
            .and_then(Weak::upgrade);
        if let Some(chunk) = cached {
            return chunk.read().await;
        }
        let start = block * 1024 * 1024;
        let end = size.min(start + 1024 * 1024);
        let result = store
            .get_opts(
                path,
                GetOptions {
                    range: Some(GetRange::Bounded(start..end)),
                    ..Default::default()
                },
            )
            .await?;
        ensure!(
            result.meta.size == size && result.range == (start..end),
            "invalid remote block"
        );
        let bytes = result.bytes().await?;
        ensure!(bytes.len() as u64 == end - start, "truncated remote block");
        match self.chunk(bytes.clone()).await {
            Ok(chunk) => {
                let mut index = self
                    .index
                    .lock()
                    .map_err(|_| anyhow::anyhow!("cache unavailable"))?;
                if index.blocks.len() >= 8192 {
                    index.blocks.retain(|_, value| value.strong_count() > 0);
                }
                if index.blocks.len() < 8192 {
                    index.blocks.insert(key, Arc::downgrade(&chunk));
                    if index.clean.len() >= 8192 {
                        index.clean.pop_front();
                    }
                    index.clean.push_back(Clean::Block { _chunk: chunk });
                }
            }
            Err(UploadError::Capacity) => {}
            Err(error) => return Err(error.into()),
        }
        Ok(bytes)
    }

    /// @cc [owner:spolu,label:performance;backend] bounded-content-staging
    /// Account shared immutable pages once, reserving RAM or disk before retaining bytes. Only
    /// clean
    /// cache references may be evicted; upload descriptors, pending batches, and streams MUST pin
    /// their pages. Disk spill MUST NOT fsync and MUST never be replayed after restart. Exhausted
    /// staging MUST reject publication without modifying the previous version.
    async fn chunk(&self, bytes: Bytes) -> Result<Arc<Chunk>, UploadError> {
        let size = bytes.len() as u64;
        let memory = loop {
            if let Some(lease) = self.memory.reserve(size) {
                break Some(lease);
            }
            let removed = self
                .index
                .lock()
                .map_err(|_| anyhow::anyhow!("cache unavailable"))?
                .clean
                .pop_front();
            if removed.is_none() {
                break None;
            }
        };
        if let Some(lease) = memory {
            return Ok(Arc::new(Chunk {
                data: Data::Memory(bytes),
                _lease: lease,
            }));
        }
        let lease = self.disk.reserve(size).ok_or(UploadError::Capacity)?;
        let directory = self.directory.path().to_owned();
        tokio::task::spawn_blocking(move || {
            use std::io::Write;
            let mut file = tempfile::NamedTempFile::new_in(directory)?;
            file.write_all(&bytes)?;
            Ok::<_, std::io::Error>(Arc::new(Chunk {
                data: Data::Disk(file.into_temp_path()),
                _lease: lease,
            }))
        })
        .await
        .map_err(|error| UploadError::Backend(error.into()))?
        .map_err(|error| {
            if matches!(error.raw_os_error(), Some(28 | 69 | 122)) {
                UploadError::Capacity
            } else {
                UploadError::Backend(error.into())
            }
        })
    }

    pub async fn stage<S: Stream<Item = Result<Bytes>> + Send>(
        &self,
        input: S,
    ) -> Result<Arc<LocalVersion>, UploadError> {
        futures::pin_mut!(input);
        let mut pages = OrdMap::new();
        let mut buffer = BytesMut::with_capacity(PAGE as usize);
        let mut size = 0_u64;
        while let Some(bytes) =
            tokio::time::timeout(std::time::Duration::from_secs(30), input.next())
                .await
                .map_err(|_| UploadError::Input)?
        {
            let bytes = bytes.map_err(|_| UploadError::Input)?;
            if bytes.len() > super::super::upload::MAX_INPUT_CHUNK_BYTES
                || size.saturating_add(bytes.len() as u64) > MAX_FILE_BYTES
            {
                return Err(UploadError::Input);
            }
            let mut remaining = bytes.as_ref();
            while !remaining.is_empty() {
                let count = remaining.len().min(PAGE as usize - buffer.len());
                buffer.extend_from_slice(&remaining[..count]);
                size += count as u64;
                remaining = &remaining[count..];
                if buffer.len() == PAGE as usize {
                    pages.insert(
                        (size - 1) / PAGE,
                        self.chunk(Bytes::copy_from_slice(&buffer)).await?,
                    );
                    buffer.clear();
                }
            }
        }
        if !buffer.is_empty() {
            pages.insert(
                (size - 1) / PAGE,
                self.chunk(Bytes::copy_from_slice(&buffer)).await?,
            );
        }
        Ok(Arc::new(LocalVersion { pages, size }))
    }

    pub async fn edit(
        &self,
        base: &LocalVersion,
        offset: u64,
        length: u64,
        size: u64,
        mut input: BoxStream<'static, Result<Bytes>>,
    ) -> Result<(Arc<LocalVersion>, [u8; 32]), UploadError> {
        let mut pages = base.pages.clone();
        if size < base.size {
            let remove: Vec<_> = pages
                .range(size.div_ceil(PAGE)..)
                .map(|(number, _)| *number)
                .collect();
            for number in remove {
                pages.remove(&number);
            }
            if !size.is_multiple_of(PAGE)
                && let Some(chunk) = pages.get(&(size / PAGE))
            {
                let bytes = chunk.read().await?;
                pages.insert(
                    size / PAGE,
                    self.chunk(Bytes::copy_from_slice(
                        &bytes[..bytes.len().min((size % PAGE) as usize)],
                    ))
                    .await?,
                );
            }
        }
        let mut received = 0_u64;
        let mut hash = Sha256::new();
        while let Some(bytes) =
            tokio::time::timeout(std::time::Duration::from_secs(30), input.next())
                .await
                .map_err(|_| UploadError::Input)?
        {
            let bytes = bytes.map_err(|_| UploadError::Input)?;
            if bytes.len() > super::super::upload::MAX_INPUT_CHUNK_BYTES
                || bytes.len() as u64 > length.saturating_sub(received)
            {
                return Err(UploadError::Input);
            }
            hash.update(&bytes);
            let mut consumed = 0;
            while consumed < bytes.len() {
                let position = offset + received;
                let number = position / PAGE;
                let start = (position % PAGE) as usize;
                let count = (bytes.len() - consumed).min(PAGE as usize - start);
                let page_size = (size - number * PAGE).min(PAGE) as usize;
                let mut page = vec![0; page_size];
                if let Some(chunk) = pages.get(&number) {
                    let old = chunk.read().await?;
                    let copy = page_size.min(old.len());
                    page[..copy].copy_from_slice(&old[..copy]);
                }
                page[start..start + count].copy_from_slice(&bytes[consumed..consumed + count]);
                pages.insert(number, self.chunk(Bytes::from(page)).await?);
                received += count as u64;
                consumed += count;
            }
        }
        if received != length {
            return Err(UploadError::Input);
        }
        Ok((
            Arc::new(LocalVersion { pages, size }),
            hash.finalize().into(),
        ))
    }

    pub fn usage(&self) -> (u64, u64) {
        (
            self.memory.used.load(Ordering::Acquire),
            self.disk.used.load(Ordering::Acquire),
        )
    }
}

impl std::fmt::Debug for LocalVersion {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("LocalVersion")
            .field("size", &self.size)
            .field("pages", &self.pages.len())
            .finish()
    }
}
