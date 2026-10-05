use async_trait::async_trait;
use bytes::Bytes;
use foyer::{
    BlockEngineConfig, DeviceBuilder, FsDeviceBuilder, HybridCache, HybridCacheBuilder,
    PsyncIoEngineConfig,
};
use futures::{
    StreamExt,
    stream::{self, BoxStream},
};
use lance_io::object_store::{ObjectStoreParams, ObjectStoreProvider};
use moka::sync::Cache;
use object_store::{path::Path, *};
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
use tokio::sync::{OwnedRwLockWriteGuard, RwLock};

const PART: u64 = 256 * 1024;
const STRIPES: usize = 1024;

#[derive(Debug)]
struct Head {
    generation: [u8; 16],
    meta: ObjectMeta,
    attributes: Attributes,
}

/// @cc [owner:spolu,label:backend;concurrency] sole-writer-object-cache
/// Every mutation of cached storage MUST pass through this process and this cache. Reads MUST hold
/// their stripe until the head is loaded; mutations MUST invalidate it before awaiting upstream.
/// New heads MUST get fresh chunk namespaces, including after eviction and failed/cancelled writes.
/// Parts MUST use the captured head generation and ETag, preventing mixed versions. Failed/cancelled
/// mutations MUST disable caching for their stripe until restart. Listing MUST go upstream.
#[derive(Debug)]
pub(super) struct ObjectCache {
    parts: HybridCache<([u8; 16], u64), Vec<u8>>,
    heads: Cache<String, Arc<Head>>,
    gates: Vec<Arc<Gate>>,
    pub hits: AtomicU64,
    pub remote_requests: AtomicU64,
    pub remote_bytes: AtomicU64,
}

impl ObjectCache {
    /// @cc [owner:spolu,label:backend;performance] disposable-object-cache
    /// The caller MUST provide an exclusively owned directory. Startup MUST discard it, and failures
    /// to reset or open it MUST fail startup. Cached parts MUST be bounded independently of file size.
    pub async fn open(
        directory: &std::path::Path,
        memory: usize,
        disk: usize,
    ) -> anyhow::Result<Arc<Self>> {
        match tokio::fs::remove_dir_all(directory).await {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
        tokio::fs::create_dir_all(directory).await?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700)).await?;
        }
        let mut builder = HybridCacheBuilder::new()
            .with_name("dfs-lance-objects")
            .with_flush_on_close(false)
            .memory(memory)
            .with_weighter(|_: &([u8; 16], u64), v: &Vec<u8>| v.len() + 128)
            .storage()
            .with_io_engine_config(PsyncIoEngineConfig::new());
        if disk > 0 {
            builder = builder.with_engine_config(
                BlockEngineConfig::new(
                    FsDeviceBuilder::new(directory)
                        .with_capacity(disk)
                        .build()?,
                )
                .with_block_size(16 * 1024 * 1024),
            );
        }
        Ok(Arc::new(Self {
            parts: builder.build().await?,
            heads: Cache::new(16_384),
            gates: (0..STRIPES)
                .map(|_| {
                    Arc::new(Gate {
                        lock: Arc::new(RwLock::new(())),
                        poisoned: AtomicBool::new(false),
                    })
                })
                .collect(),
            hits: AtomicU64::new(0),
            remote_requests: AtomicU64::new(0),
            remote_bytes: AtomicU64::new(0),
        }))
    }
    fn gate(&self, key: &str) -> Arc<Gate> {
        let mut hash = DefaultHasher::new();
        key.hash(&mut hash);
        self.gates[hash.finish() as usize % STRIPES].clone()
    }
    async fn mutation(&self, key: &str) -> Mutation {
        let gate = self.gate(key);
        let guard = gate.lock.clone().write_owned().await;
        self.heads.invalidate(key);
        Mutation {
            gate,
            _guard: guard,
            completed: false,
        }
    }
    pub async fn close(&self) -> anyhow::Result<()> {
        self.parts.close().await?;
        Ok(())
    }
}

#[derive(Debug)]
struct Gate {
    lock: Arc<RwLock<()>>,
    poisoned: AtomicBool,
}
struct Mutation {
    gate: Arc<Gate>,
    _guard: OwnedRwLockWriteGuard<()>,
    completed: bool,
}
impl Mutation {
    fn finish<T>(mut self, result: Result<T>) -> Result<T> {
        self.completed = result.is_ok();
        result
    }
}
impl Drop for Mutation {
    fn drop(&mut self) {
        if !self.completed {
            self.gate.poisoned.store(true, Ordering::Release);
        }
    }
}

#[derive(Debug)]
pub(super) struct Provider {
    pub inner: Arc<dyn ObjectStoreProvider>,
    pub cache: Arc<ObjectCache>,
}
#[async_trait]
impl ObjectStoreProvider for Provider {
    async fn new_store(
        &self,
        base: url::Url,
        params: &ObjectStoreParams,
    ) -> lance_core::Result<lance_io::object_store::ObjectStore> {
        let mut store = self.inner.new_store(base, params).await?;
        store.inner = Arc::new(CachedStore {
            inner: store.inner,
            cache: self.cache.clone(),
            prefix: store.store_prefix.clone(),
        });
        Ok(store)
    }
}

#[derive(Clone, Debug)]
struct CachedStore {
    inner: Arc<dyn ObjectStore>,
    cache: Arc<ObjectCache>,
    prefix: String,
}
impl std::fmt::Display for CachedStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "dfs object cache")
    }
}
impl CachedStore {
    fn key(&self, path: &Path) -> String {
        format!("{}\0{}", self.prefix, path)
    }
    async fn load_head(&self, path: &Path, key: &str, options: &GetOptions) -> Result<Arc<Head>> {
        if let Some(head) = self.cache.heads.get(key) {
            return Ok(head);
        }
        self.cache.remote_requests.fetch_add(1, Ordering::Relaxed);
        let result = self
            .inner
            .get_opts(
                path,
                GetOptions {
                    head: true,
                    extensions: options.extensions.clone(),
                    ..Default::default()
                },
            )
            .await?;
        let head = Arc::new(Head {
            generation: *uuid::Uuid::new_v4().as_bytes(),
            meta: result.meta,
            attributes: result.attributes,
        });
        self.cache.heads.insert(key.into(), head.clone());
        Ok(head)
    }
    async fn part(&self, path: &Path, head: &Head, start: u64) -> Result<Bytes> {
        let key = (head.generation, start);
        match self.cache.parts.get(&key).await {
            Ok(Some(entry)) => {
                self.cache.hits.fetch_add(1, Ordering::Relaxed);
                return Ok(Bytes::copy_from_slice(entry.value()));
            }
            Ok(None) => {}
            Err(_) => tracing::warn!("object cache read failed; fetching upstream"),
        }
        self.cache.remote_requests.fetch_add(1, Ordering::Relaxed);
        let result = self
            .inner
            .get_opts(
                path,
                GetOptions {
                    range: Some(GetRange::Bounded(start..(start + PART).min(head.meta.size))),
                    if_match: head.meta.e_tag.clone(),
                    ..Default::default()
                },
            )
            .await?;
        let bytes = result.bytes().await?;
        self.cache
            .remote_bytes
            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
        self.cache.parts.insert(key, bytes.to_vec());
        Ok(bytes)
    }
}

#[async_trait]
impl ObjectStore for CachedStore {
    async fn get_opts(&self, path: &Path, options: GetOptions) -> Result<GetResult> {
        // Explicit historical versions retain the backend's version-selection semantics.
        if options.version.is_some() {
            return self.inner.get_opts(path, options).await;
        }
        let key = self.key(path);
        let gate = self.cache.gate(&key);
        let guard = gate.lock.read().await;
        if gate.poisoned.load(Ordering::Acquire) {
            return self.inner.get_opts(path, options).await;
        }
        let head = self.load_head(path, &key, &options).await?;
        drop(guard);
        if head.meta.e_tag.is_none() {
            return self.inner.get_opts(path, options).await;
        }
        options.check_preconditions(&head.meta)?;
        let range = options
            .range
            .as_ref()
            .map(|r| r.as_range(head.meta.size))
            .transpose()
            .map_err(|source| Error::Generic {
                store: "dfs object cache",
                source: Box::new(source),
            })?
            .unwrap_or(0..head.meta.size);
        let payload = if options.head {
            stream::empty().boxed()
        } else {
            let store = self.clone();
            let path = path.clone();
            let head = head.clone();
            let requested = range.clone();
            stream::iter(range.start / PART..range.end.div_ceil(PART))
                .map(move |part| {
                    let (store, path, head, requested) =
                        (store.clone(), path.clone(), head.clone(), requested.clone());
                    async move {
                        let start = part * PART;
                        let bytes = store.part(&path, &head, start).await?;
                        let from = requested.start.saturating_sub(start) as usize;
                        let to = (requested.end - start).min(bytes.len() as u64) as usize;
                        bytes
                            .get(from..to)
                            .map(Bytes::copy_from_slice)
                            .ok_or_else(|| Error::Generic {
                                store: "dfs object cache",
                                source: "invalid cached range".into(),
                            })
                    }
                })
                .buffered(8)
                .boxed()
        };
        Ok(GetResult {
            payload: GetResultPayload::Stream(payload),
            meta: head.meta.clone(),
            range,
            attributes: head.attributes.clone(),
            extensions: Default::default(),
        })
    }
    async fn put_opts(
        &self,
        path: &Path,
        payload: PutPayload,
        options: PutOptions,
    ) -> Result<PutResult> {
        let key = self.key(path);
        let mutation = self.cache.mutation(&key).await;
        mutation.finish(self.inner.put_opts(path, payload, options).await)
    }
    async fn put_multipart_opts(
        &self,
        path: &Path,
        options: PutMultipartOptions,
    ) -> Result<Box<dyn MultipartUpload>> {
        Ok(Box::new(Upload {
            inner: self.inner.put_multipart_opts(path, options).await?,
            cache: self.cache.clone(),
            key: self.key(path),
        }))
    }
    fn delete_stream(
        &self,
        paths: BoxStream<'static, Result<Path>>,
    ) -> BoxStream<'static, Result<Path>> {
        let store = self.clone();
        paths
            .map(move |path| {
                let store = store.clone();
                async move {
                    let path = path?;
                    let key = store.key(&path);
                    let mutation = store.cache.mutation(&key).await;
                    mutation.finish(store.inner.delete(&path).await)?;
                    Ok(path)
                }
            })
            .buffered(10)
            .boxed()
    }
    fn list(&self, prefix: Option<&Path>) -> BoxStream<'static, Result<ObjectMeta>> {
        self.inner.list(prefix)
    }
    fn list_with_offset(
        &self,
        prefix: Option<&Path>,
        offset: &Path,
    ) -> BoxStream<'static, Result<ObjectMeta>> {
        self.inner.list_with_offset(prefix, offset)
    }
    async fn list_with_delimiter(&self, prefix: Option<&Path>) -> Result<ListResult> {
        self.inner.list_with_delimiter(prefix).await
    }
    async fn copy_opts(&self, from: &Path, to: &Path, options: CopyOptions) -> Result<()> {
        let key = self.key(to);
        let mutation = self.cache.mutation(&key).await;
        mutation.finish(self.inner.copy_opts(from, to, options).await)
    }
}

#[derive(Debug)]
struct Upload {
    inner: Box<dyn MultipartUpload>,
    cache: Arc<ObjectCache>,
    key: String,
}
#[async_trait]
impl MultipartUpload for Upload {
    fn put_part(&mut self, data: PutPayload) -> UploadPart {
        self.inner.put_part(data)
    }
    async fn complete(&mut self) -> Result<PutResult> {
        let mutation = self.cache.mutation(&self.key).await;
        mutation.finish(self.inner.complete().await)
    }
    async fn abort(&mut self) -> Result<()> {
        self.inner.abort().await
    }
}

#[cfg(test)]
mod tests;
