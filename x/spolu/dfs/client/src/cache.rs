use std::{
    num::NonZeroUsize,
    ops::Deref,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use lru::LruCache;
use serde::{Serialize, de::DeserializeOwned};

use super::*;

const BLOCK_BYTES: u64 = 1024 * 1024;
const LIMIT_BYTES: usize = 256 * 1024 * 1024;
const CHECK_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Eq, PartialEq, Hash)]
enum Key {
    Stat(String),
    Lookup(String, String),
    List(String, Option<String>, usize),
    Block(String, String, u64),
}

#[derive(Clone)]
enum Value {
    Attributes(Result<ObjectAttributes>),
    Page(ListResponse),
    Block(Arc<[u8]>),
}

fn attributes_size(attributes: &ObjectAttributes) -> usize {
    256 + attributes.object_id.len()
        + attributes.mime_type.len()
        + attributes
            .xattrs
            .iter()
            .map(|(key, value)| 64 + key.len() + value.len())
            .sum::<usize>()
}

fn weight(key: &Key, value: &Value) -> usize {
    let key_bytes = match key {
        Key::Stat(id) => id.len(),
        Key::Lookup(id, name) | Key::Block(id, name, _) => id.len() + name.len(),
        Key::List(id, after, _) => id.len() + after.as_ref().map_or(0, String::len),
    };
    192 + key_bytes
        + match value {
            Value::Attributes(Ok(attributes)) => attributes_size(attributes),
            Value::Attributes(Err(_)) => 0,
            Value::Page(page) => {
                64 + page.next_after.as_ref().map_or(0, String::len)
                    + page
                        .entries
                        .iter()
                        .map(|entry| 64 + entry.name.len() + attributes_size(&entry.attributes))
                        .sum::<usize>()
            }
            Value::Block(bytes) => bytes.len(),
        }
}

struct Store {
    entries: LruCache<Key, Value>,
    bytes: usize,
    limit: usize,
}

impl Store {
    fn new(limit: usize) -> Result<Self> {
        Ok(Self {
            entries: LruCache::new(NonZeroUsize::new(131_072).ok_or(Error::Configuration)?),
            bytes: 0,
            limit,
        })
    }

    fn clear(&mut self) {
        self.entries.clear();
        self.bytes = 0;
    }

    fn insert(&mut self, key: Key, value: Value) {
        let bytes = weight(&key, &value);
        if bytes > self.limit {
            return;
        }
        if let Some((key, value)) = self.entries.push(key, value) {
            self.bytes -= weight(&key, &value);
        }
        self.bytes += bytes;
        while self.bytes > self.limit {
            if let Some((key, value)) = self.entries.pop_lru() {
                self.bytes -= weight(&key, &value);
            } else {
                break;
            }
        }
    }
}

struct State {
    revision: Option<u64>,
    deadline: Option<Instant>,
    fatal: Option<Error>,
    metadata: Store,
    content: Store,
    generation: u64,
    mutations: usize,
    hits: u64,
    misses: u64,
}

impl State {
    fn clear(&mut self) {
        self.metadata.clear();
        self.deadline = None;
    }

    fn current(&mut self) -> Result<Option<u64>> {
        if let Some(error) = self.fatal {
            return Err(error);
        }
        if self.mutations > 0
            || self
                .deadline
                .is_none_or(|deadline| Instant::now() >= deadline)
        {
            self.clear();
            return Ok(None);
        }
        Ok(self.revision)
    }
}

struct Mutation<'a>(&'a Shared);

impl Drop for Mutation<'_> {
    fn drop(&mut self) {
        if let Ok(mut state) = self.0.state.lock() {
            state.clear();
            state.generation = state.generation.wrapping_add(1);
            state.mutations -= 1;
        }
    }
}

struct Shared {
    state: Mutex<State>,
    stopped: AtomicBool,
}

/// @cc [owner:spolu,label:security;performance] bounded-client-cache
/// One cache MUST belong to one immutable session. Cached metadata and authorization require a
/// fresh server check, measured from request start with a monotonic clock. Revision changes, check
/// failures, and freshness expiry MUST discard metadata. Immutable version-keyed blocks may remain
/// until LRU eviction, but reading them MUST first select a version through authorized metadata.
/// Bound metadata and content by bytes and count. Local mutations MUST invalidate metadata before
/// and after publication, and checks started before those mutations MUST NOT restore freshness.
/// Mutations MUST publish at the server; this cache MUST never hold unacknowledged writes.
pub struct CachedClient {
    client: Client,
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}

#[derive(Clone, Copy)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub retained_bytes: usize,
    pub metadata_fresh: bool,
}

impl Deref for CachedClient {
    type Target = Client;
    fn deref(&self) -> &Client {
        &self.client
    }
}

impl CachedClient {
    /// @cc [owner:spolu,label:security] shared-cache-deadline
    /// Downstream caches MUST capture this deadline before reading metadata and expire their copy
    /// by that same instant. Never add another TTL after this deadline or extend it after a read.
    pub fn cache_deadline(&self) -> Result<Option<Instant>> {
        let mut state = self.shared.state.lock().map_err(|_| Error::Internal)?;
        Ok(state.current()?.and(state.deadline))
    }

    pub fn cache_stats(&self) -> Result<CacheStats> {
        let mut state = self.shared.state.lock().map_err(|_| Error::Internal)?;
        let metadata_fresh = state.current()?.is_some();
        Ok(CacheStats {
            hits: state.hits,
            misses: state.misses,
            retained_bytes: state.metadata.bytes + state.content.bytes,
            metadata_fresh,
        })
    }

    pub fn new(client: Client) -> Result<Self> {
        client.session()?;
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                revision: None,
                deadline: None,
                fatal: None,
                metadata: Store::new(32 * 1024 * 1024)?,
                content: Store::new(LIMIT_BYTES)?,
                generation: 0,
                mutations: 0,
                hits: 0,
                misses: 0,
            }),
            stopped: AtomicBool::new(false),
        });
        let worker = {
            let shared = shared.clone();
            let client = client.clone();
            std::thread::Builder::new()
                .name("dfs-cache".into())
                .spawn(move || poll(client, shared))
                .map_err(|_| Error::Configuration)?
        };
        Ok(Self {
            client,
            shared,
            worker: Some(worker),
        })
    }

    fn mutation(&self) -> Result<Mutation<'_>> {
        let mut state = self.shared.state.lock().map_err(|_| Error::Internal)?;
        state.clear();
        state.generation = state.generation.wrapping_add(1);
        state.mutations += 1;
        Ok(Mutation(&self.shared))
    }

    pub fn mkdir(&self, request: &MkdirRequest) -> Result<ObjectAttributes> {
        let _mutation = self.mutation()?;
        self.client.mkdir(request)
    }

    pub fn update(&self, request: &UpdateMetadataRequest) -> Result<ObjectAttributes> {
        let _mutation = self.mutation()?;
        self.client.update(request)
    }

    pub fn rename(&self, request: &RenameRequest) -> Result<ObjectAttributes> {
        let _mutation = self.mutation()?;
        self.client.rename(request)
    }

    pub fn remove(&self, request: &RemoveRequest, directory: bool) -> Result<()> {
        let _mutation = self.mutation()?;
        self.client.remove(request, directory)
    }

    pub fn open(&self, request: &OpenFileRequest) -> Result<OpenFileResponse> {
        let _mutation = if request.truncate {
            Some(self.mutation()?)
        } else {
            None
        };
        self.client.open(request)
    }

    pub fn truncate(&self, request: &TruncateFileRequest) -> Result<MutationReceipt> {
        let _mutation = self.mutation()?;
        self.client.truncate(request)
    }

    pub fn commit_upload(&self, request: &CommitUploadRequest) -> Result<MutationReceipt> {
        let _mutation = self.mutation()?;
        self.client.commit_upload(request)
    }

    pub fn write<R: Read + Send + 'static>(
        &self,
        handle: &str,
        request_id: &str,
        sequence: u64,
        offset: u64,
        length: u64,
        reader: R,
    ) -> Result<MutationReceipt> {
        let _mutation = self.mutation()?;
        self.client
            .write(handle, request_id, sequence, offset, length, reader)
    }

    fn cached(&self, key: &Key) -> Result<Option<Value>> {
        let mut state = self.shared.state.lock().map_err(|_| Error::Internal)?;
        let current = state.current()?;
        let value = if matches!(key, Key::Block(..)) {
            state.content.entries.get(key).cloned()
        } else if current.is_some() {
            state.metadata.entries.get(key).cloned()
        } else {
            None
        };
        if value.is_some() {
            state.hits += 1;
        } else {
            state.misses += 1;
        }
        Ok(value)
    }

    fn admit(
        &self,
        revision: Option<u64>,
        entries: impl IntoIterator<Item = (Key, Value)>,
    ) -> Result<()> {
        let mut state = self.shared.state.lock().map_err(|_| Error::Internal)?;
        let current = state.current()?;
        for (key, value) in entries {
            if matches!(key, Key::Block(..)) {
                state.content.insert(key, value);
            } else if revision.is_some() && current == revision {
                state.metadata.insert(key, value);
            }
        }
        Ok(())
    }

    fn fetch<T: Serialize, R: DeserializeOwned>(
        &self,
        path: &str,
        body: &T,
    ) -> (Option<u64>, Result<R>) {
        let response = self
            .client
            .request(Method::POST, path)
            .and_then(|request| request.json(body).send().map_err(|_| Error::Transport));
        match response {
            Ok(response) => {
                let revision = response_revision(&response);
                (revision, check(Ok(response)).and_then(decode))
            }
            Err(error) => (None, Err(error)),
        }
    }

    pub fn stat(&self, id: &str) -> Result<ObjectAttributes> {
        let key = Key::Stat(id.into());
        if let Some(Value::Attributes(attributes)) = self.cached(&key)? {
            return attributes;
        }
        let (revision, result) = self.fetch(
            "objects/stat",
            &StatRequest {
                object_id: id.into(),
            },
        );
        if result.is_ok() || matches!(result, Err(Error::NotFound)) {
            self.admit(revision, [(key, Value::Attributes(result.clone()))])?;
        }
        result
    }

    pub fn lookup(&self, parent: &str, name: &str) -> Result<ObjectAttributes> {
        let key = Key::Lookup(parent.into(), name.into());
        if let Some(Value::Attributes(attributes)) = self.cached(&key)? {
            return attributes;
        }
        let (revision, result) = self.fetch(
            "objects/lookup",
            &LookupRequest {
                parent_id: parent.into(),
                name: name.into(),
            },
        );
        if result.is_ok() || matches!(result, Err(Error::NotFound)) {
            self.admit(revision, [(key, Value::Attributes(result.clone()))])?;
        }
        if let Ok(object) = &result {
            self.admit(
                revision,
                [(
                    Key::Stat(object.object_id.clone()),
                    Value::Attributes(result.clone()),
                )],
            )?;
        }
        result
    }

    pub fn list(&self, id: &str, after: Option<String>, limit: usize) -> Result<ListResponse> {
        let key = Key::List(id.into(), after.clone(), limit);
        if let Some(Value::Page(page)) = self.cached(&key)? {
            return Ok(page);
        }
        let (revision, result) = self.fetch::<_, ListResponse>(
            "objects/list",
            &ListRequest {
                directory_id: id.into(),
                after,
                limit,
            },
        );
        let page = result?;
        self.admit(
            revision,
            [(key, Value::Page(page.clone()))]
                .into_iter()
                .chain(page.entries.iter().flat_map(|entry| {
                    [
                        (
                            Key::Lookup(id.into(), entry.name.clone()),
                            Value::Attributes(Ok(entry.attributes.clone())),
                        ),
                        (
                            Key::Stat(entry.attributes.object_id.clone()),
                            Value::Attributes(Ok(entry.attributes.clone())),
                        ),
                    ]
                })),
        )?;
        Ok(page)
    }

    /// Read at most one bounded FUSE request, selecting immutable blocks from live attributes.
    pub fn read_object(&self, id: &str, offset: u64, length: u64) -> Result<Vec<u8>> {
        if length > BLOCK_BYTES {
            return Err(Error::InvalidInput);
        }
        for attempt in 0..2 {
            match self.read_current(id, offset, length) {
                Err(Error::Conflict) if attempt == 0 => {
                    self.shared
                        .state
                        .lock()
                        .map_err(|_| Error::Internal)?
                        .clear();
                }
                result => return result,
            }
        }
        Err(Error::Conflict)
    }

    fn read_current(&self, id: &str, offset: u64, length: u64) -> Result<Vec<u8>> {
        let object = self.stat(id)?;
        let KindAttributes::File {
            content_version,
            size_bytes,
        } = object.kind
        else {
            return Err(Error::IsDirectory);
        };
        let length = length.min(size_bytes.saturating_sub(offset));
        let end = offset + length;
        let mut output = Vec::with_capacity(length as usize);
        let mut position = offset;
        while position < end {
            let start = position / BLOCK_BYTES * BLOCK_BYTES;
            let key = Key::Block(id.into(), content_version.clone(), start);
            let block = match self.cached(&key)? {
                Some(Value::Block(bytes)) => bytes,
                _ => {
                    let request = ReadObjectRequest {
                        object_id: id.into(),
                        content_version: Some(content_version.clone()),
                        offset: start,
                        length: BLOCK_BYTES.min(size_bytes - start),
                    };
                    let response = self
                        .client
                        .request(Method::POST, "objects/read")?
                        .json(&request)
                        .send()
                        .map_err(|_| Error::Transport)?;
                    let revision = response_revision(&response);
                    let response = check(Ok(response))?;
                    if response.content_length() != Some(request.length)
                        || response
                            .headers()
                            .get("dfs-content-version")
                            .and_then(|v| v.to_str().ok())
                            != Some(content_version.as_str())
                    {
                        return Err(Error::Protocol);
                    }
                    let mut bytes = Vec::with_capacity(request.length as usize);
                    response
                        .take(request.length)
                        .read_to_end(&mut bytes)
                        .map_err(|_| Error::Transport)?;
                    if bytes.len() as u64 != request.length {
                        return Err(Error::Transport);
                    }
                    let bytes: Arc<[u8]> = bytes.into();
                    self.admit(revision, [(key, Value::Block(bytes.clone()))])?;
                    bytes
                }
            };
            let begin = (position - start) as usize;
            let count = (end - position).min(block.len().saturating_sub(begin) as u64) as usize;
            if count == 0 {
                return Err(Error::Protocol);
            }
            output.extend_from_slice(&block[begin..begin + count]);
            position += count as u64;
        }
        Ok(output)
    }
}

fn response_revision(response: &Response) -> Option<u64> {
    response
        .headers()
        .get("dfs-cache-revision")?
        .to_str()
        .ok()?
        .parse()
        .ok()
}

fn poll(client: Client, shared: Arc<Shared>) {
    poll_with(shared, |request| {
        client
            .request(Method::POST, "sessions/cache")
            .and_then(|builder| check(builder.timeout(Duration::from_secs(2)).json(request).send()))
            .and_then(decode)
    });
}

/// @cc [owner:spolu,label:performance;security] bounded-cache-check-rate
/// Consecutive freshness checks MUST start at least 100 ms apart, including after revision changes.
/// Waiting MUST NOT hold the cache mutex or extend metadata's deadline. Measure freshness from
/// request start, and fail closed on rejected sessions even when checks are rate limited.
fn poll_with(
    shared: Arc<Shared>,
    mut check_revision: impl FnMut(&CacheCheckRequest) -> Result<CacheCheckResponse>,
) {
    let mut request = CacheCheckRequest::default();
    while !shared.stopped.load(Ordering::Acquire) {
        let generation = match shared.state.lock() {
            Ok(state) => state.generation,
            Err(_) => return,
        };
        let started = Instant::now();
        let response = check_revision(&request);
        let Ok(mut state) = shared.state.lock() else {
            return;
        };
        match response {
            Ok(response)
                if response.revision > 0
                    && response.fresh_for_ms <= 1000
                    && request
                        .revision
                        .is_none_or(|revision| revision <= response.revision) =>
            {
                if state.revision != Some(response.revision)
                    || state
                        .deadline
                        .is_none_or(|deadline| Instant::now() >= deadline)
                {
                    state.clear();
                }
                state.revision = Some(response.revision);
                if state.generation == generation && state.mutations == 0 {
                    state.deadline = Some(started + Duration::from_millis(response.fresh_for_ms));
                }
                request = CacheCheckRequest {
                    revision: Some(response.revision),
                };
            }
            response => {
                state.clear();
                if matches!(response, Err(Error::Unauthenticated | Error::Forbidden)) {
                    state.fatal = Some(Error::Unauthenticated);
                    return;
                }
                request = CacheCheckRequest::default();
            }
        }
        drop(state);
        let remaining = CHECK_INTERVAL.saturating_sub(started.elapsed());
        if !remaining.is_zero() {
            std::thread::sleep(remaining);
        }
    }
}

impl Drop for CachedClient {
    fn drop(&mut self) {
        self.shared.stopped.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        if let Ok(state) = self.shared.state.lock() {
            eprintln!(
                "dfs-fuse: cache hits={} misses={} retained_bytes={}",
                state.hits,
                state.misses,
                state.metadata.bytes + state.content.bytes
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rapidly_changing_revisions_are_paced_and_revocation_still_fails_closed() -> Result<()> {
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                revision: None,
                deadline: None,
                fatal: None,
                metadata: Store::new(4096)?,
                content: Store::new(4096)?,
                generation: 0,
                mutations: 0,
                hits: 0,
                misses: 0,
            }),
            stopped: AtomicBool::new(false),
        });
        let started = Instant::now();
        let mut calls = 0;
        poll_with(shared.clone(), |request| {
            assert_eq!(request.revision, (calls > 0).then_some(calls));
            calls += 1;
            // Simulate a server returning immediately on each new revision, then closing the session.
            if calls == 4 {
                assert!(started.elapsed() >= Duration::from_millis(300));
                return Err(Error::Unauthenticated);
            }
            Ok(CacheCheckResponse {
                revision: calls,
                fresh_for_ms: 1000,
            })
        });
        assert_eq!(calls, 4);
        let mut state = shared.state.lock().map_err(|_| Error::Internal)?;
        assert!(matches!(state.current(), Err(Error::Unauthenticated)));
        assert!(state.deadline.is_none() && state.metadata.entries.is_empty());
        Ok(())
    }

    #[test]
    fn expired_metadata_cannot_authorize_but_immutable_bytes_survive() -> Result<()> {
        let key = Key::Stat("file".into());
        let block = Key::Block("file".into(), "version".into(), 0);
        let mut state = State {
            revision: Some(1),
            deadline: Some(Instant::now()),
            fatal: None,
            metadata: Store::new(4096)?,
            content: Store::new(4096)?,
            generation: 0,
            mutations: 0,
            hits: 0,
            misses: 0,
        };
        state
            .metadata
            .insert(key.clone(), Value::Attributes(Err(Error::NotFound)));
        state
            .content
            .insert(block.clone(), Value::Block(Arc::from([42; 16])));
        assert_eq!(state.current()?, None);
        assert!(!state.metadata.entries.contains(&key));
        assert!(state.content.entries.contains(&block));
        state.fatal = Some(Error::Unauthenticated);
        assert!(matches!(state.current(), Err(Error::Unauthenticated)));
        Ok(())
    }

    #[test]
    fn content_pressure_evicts_the_least_recently_used_block() -> Result<()> {
        let key = |version: &str| Key::Block("file".into(), version.into(), 0);
        let value = Value::Block(Arc::from([42; 16]));
        let mut store = Store::new(2 * weight(&key("v1"), &value))?;
        store.insert(key("v1"), value.clone());
        store.insert(key("v2"), value.clone());
        store.entries.get(&key("v1"));
        store.insert(key("v3"), value);
        assert!(store.entries.contains(&key("v1")));
        assert!(!store.entries.contains(&key("v2")));
        assert!(store.entries.contains(&key("v3")));
        assert!(store.bytes <= store.limit);
        Ok(())
    }
}
