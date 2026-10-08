use super::content_cache::{Cache, CacheStats};
use crate::{client::Client, model::*};
use sha2::{Digest as _, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, OnceLock},
};
use tokio::sync::{mpsc, oneshot};

struct Request {
    range: BlockRead,
    reply: oneshot::Sender<Result<BlockPage>>,
}

pub struct BlockCache {
    client: Client,
    content: Cache,
    manifests: Cache,
    hints: Cache,
    queue: OnceLock<mpsc::Sender<Request>>,
    admission: usize,
}

struct Reference {
    key: [u8; 32],
    hint: [u8; 32],
    bytes: Arc<[u8]>,
}

pub struct Pending {
    references: Vec<Reference>,
    chunks: Vec<([u8; 32], Arc<[u8]>)>,
}

fn key(node: &Node, index: u64, revision: bool) -> Result<[u8; 32]> {
    Ok(Sha256::digest(bincode::serialize(&(
        &node.id,
        revision.then_some(&node.version),
        index,
    ))?)
    .into())
}

fn digest(id: &str) -> Result<[u8; 32]> {
    if id.len() != 64 {
        return Err(err(libc::EIO, "invalid chunk digest"));
    }
    let mut result = [0; 32];
    for (index, pair) in id.as_bytes().as_chunks::<2>().0.iter().enumerate() {
        let nibble = |b| match b {
            b'0'..=b'9' => Ok(b - b'0'),
            b'a'..=b'f' => Ok(b - b'a' + 10),
            _ => Err(err(libc::EIO, "invalid chunk digest")),
        };
        result[index] = nibble(pair[0])? * 16 + nibble(pair[1])?;
    }
    Ok(result)
}

impl BlockCache {
    pub fn new(client: Client, capacity: usize, admission: usize) -> Self {
        let metadata = (capacity / 8).min(8 << 20);
        Self {
            client,
            content: Cache::new(capacity - metadata),
            manifests: Cache::new(metadata / 2),
            hints: Cache::new(metadata - metadata / 2),
            queue: OnceLock::new(),
            admission,
        }
    }

    pub fn stats(&self) -> CacheStats {
        let mut result = self.content.stats();
        for extra in [self.manifests.stats(), self.hints.stats()] {
            result.capacity_bytes += extra.capacity_bytes;
            result.resident_bytes += extra.resident_bytes;
            result.entries += extra.entries;
            result.hits += extra.hits;
            result.misses += extra.misses;
            result.evictions += extra.evictions;
        }
        result
    }

    pub fn resident(&self, node: &Node, offset: u64, size: u32) -> Result<Option<Vec<u8>>> {
        let end = offset.saturating_add(u64::from(size)).min(node.size);
        if end <= offset {
            return Ok(Some(Vec::new()));
        }
        let first = offset / CHUNK_BYTES as u64;
        let mut bytes = vec![0; (end - offset) as usize];
        for index in first..=(end - 1) / CHUNK_BYTES as u64 {
            let Some(reference) = self.manifests.get(&key(node, index, true)?) else {
                return Ok(None);
            };
            let hash: Option<Id> = bincode::deserialize(&reference)?;
            if let Some(hash) = hash {
                let Some(chunk) = self.content.get(&digest(&hash)?) else {
                    return Ok(None);
                };
                copy_chunk(&mut bytes, offset, end, index, &chunk)?;
            }
        }
        Ok(Some(bytes))
    }

    async fn fetch(&self, range: BlockRead) -> Result<BlockPage> {
        let queue = self.queue.get_or_init(|| {
            let (tx, rx) = mpsc::channel(self.admission);
            tokio::spawn(batch(self.client.clone(), rx, self.admission));
            tx
        });
        let (reply, result) = oneshot::channel();
        queue
            .try_send(Request { range, reply })
            .map_err(|_| err(libc::EAGAIN, "block queue capacity"))?;
        result
            .await
            .map_err(|_| err(libc::EIO, "block worker stopped"))?
    }

    pub async fn read(
        &self,
        node: &Node,
        handle: Option<&str>,
        offset: u64,
        size: u32,
    ) -> Result<(Vec<u8>, Pending)> {
        let mut pending = Pending {
            references: Vec::new(),
            chunks: Vec::new(),
        };
        if let Some(bytes) = self.resident(node, offset, size)? {
            return Ok((bytes, pending));
        }
        let end = offset.saturating_add(u64::from(size)).min(node.size);
        let first = offset / CHUNK_BYTES as u64;
        let count = if end <= offset {
            0
        } else {
            ((end - 1) / CHUNK_BYTES as u64 - first + 1) as usize
        };
        let mut known = HashMap::new();
        for index in first..first + count as u64 {
            let entry = self
                .manifests
                .get(&key(node, index, true)?)
                .or_else(|| self.hints.get(&key(node, index, false).ok()?));
            if let Some(entry) = entry {
                let hash: Option<Id> = bincode::deserialize(&entry)?;
                if let Some(hash) = hash
                    && let Some(bytes) = self.content.get(&digest(&hash)?)
                {
                    known.insert(hash, bytes);
                }
            }
        }
        let page = self
            .fetch(BlockRead {
                node: node.id.clone(),
                version: node.version.clone(),
                offset,
                size,
                handle: handle.map(str::to_owned),
                known: known.keys().cloned().collect(),
            })
            .await?;
        if page.node != node.id
            || page.version != node.version
            || page.size != node.size
            || page.first != first
            || page.hashes.len() != count
            || page.chunks.len() > count
        {
            return Err(err(libc::ESTALE, "block manifest reply mismatch"));
        }
        let mut received = HashMap::new();
        for (id, bytes) in page.chunks {
            let hash = digest(&id)?;
            if bytes.len() > CHUNK_BYTES
                || <[u8; 32]>::from(Sha256::digest(&bytes)) != hash
                || !page.hashes.iter().any(|h| h.as_ref() == Some(&id))
                || received.contains_key(&id)
            {
                return Err(err(libc::EIO, "invalid block payload"));
            }
            let bytes: Arc<[u8]> = bytes.into();
            pending.chunks.push((hash, bytes.clone()));
            received.insert(id, bytes);
        }
        let mut bytes = vec![0; end.saturating_sub(offset) as usize];
        for (position, hash) in page.hashes.into_iter().enumerate() {
            let index = first + position as u64;
            if let Some(id) = &hash {
                digest(id)?;
                let chunk = received
                    .get(id)
                    .or_else(|| known.get(id))
                    .ok_or_else(|| err(libc::EIO, "missing block payload"))?;
                copy_chunk(&mut bytes, offset, end, index, chunk)?;
                if !received.contains_key(id) {
                    pending.chunks.push((digest(id)?, chunk.clone()));
                }
            }
            pending.references.push(Reference {
                key: key(node, index, true)?,
                hint: key(node, index, false)?,
                bytes: bincode::serialize(&hash)?.into(),
            });
        }
        Ok((bytes, pending))
    }

    pub fn install(&self, pending: Pending) {
        for (hash, bytes) in pending.chunks {
            self.content.insert(hash, [0; 32], bytes);
        }
        for Reference { key, hint, bytes } in pending.references {
            self.manifests.insert(key, [0; 32], bytes.clone());
            self.hints.replace(hint, [0; 32], bytes);
        }
    }
}

fn copy_chunk(output: &mut [u8], offset: u64, end: u64, index: u64, bytes: &[u8]) -> Result<()> {
    if bytes.len() > CHUNK_BYTES {
        return Err(err(libc::EIO, "oversized cached block"));
    }
    let begin = index * CHUNK_BYTES as u64;
    let start = offset.max(begin);
    let stop = end.min(begin + bytes.len() as u64);
    if start < stop {
        output[(start - offset) as usize..(stop - offset) as usize]
            .copy_from_slice(&bytes[(start - begin) as usize..(stop - begin) as usize]);
    }
    Ok(())
}

async fn batch(client: Client, mut queue: mpsc::Receiver<Request>, admission: usize) {
    let mut deferred = None;
    let mut active = tokio::task::JoinSet::new();
    loop {
        while active.len() >= admission {
            active.join_next().await;
        }
        let first = match deferred.take() {
            Some(request) => request,
            None => loop {
                tokio::select! {
                    request = queue.recv() => match request {
                        Some(request) => break request,
                        None => {
                            while active.join_next().await.is_some() {}
                            return;
                        }
                    },
                    _ = active.join_next(), if !active.is_empty() => {}
                }
            },
        };
        let mut requests = vec![first];
        let mut blocks = match requests[0].range.block_count() {
            Ok(count) => count,
            Err(error) => {
                let _ = requests.pop().unwrap().reply.send(Err(error));
                continue;
            }
        };
        tokio::task::yield_now().await;
        while requests.len() < MAX_BLOCK_REQUESTS {
            let Ok(request) = queue.try_recv() else {
                break;
            };
            let count = match request.range.block_count() {
                Ok(count) => count,
                Err(error) => {
                    let _ = request.reply.send(Err(error));
                    continue;
                }
            };
            if blocks + count > MAX_READ_BLOCKS {
                deferred = Some(request);
                break;
            }
            blocks += count;
            requests.push(request);
        }
        active.spawn(send_batch(client.clone(), requests));
    }
}

async fn send_batch(client: Client, requests: Vec<Request>) {
    let ranges = requests
        .iter()
        .map(|request| request.range.clone())
        .collect();
    let result = match client.call(Call::ReadBlocks { ranges }).await {
        Ok(Reply::Blocks(pages)) if pages.len() == requests.len() => Ok(pages),
        Ok(_) => Err(err(libc::EIO, "invalid block batch reply")),
        Err(error) => Err(error),
    };
    match result {
        Ok(pages) => {
            for (request, page) in requests.into_iter().zip(pages) {
                let _ = request.reply.send(page);
            }
        }
        Err(error) => {
            for request in requests {
                let _ = request.reply.send(Err(error.clone()));
            }
        }
    }
}
