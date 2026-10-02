use super::queue::Pending;
use crate::{State, model::Record, read::View, storage::decode};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use dfs_protocol::{BLOCK_SIZE, MAX_IO, error::status, rpc::ErrorCode};
use futures::{StreamExt, TryStreamExt, stream};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use tonic::Status;

pub(super) fn routing(workspace: &str) -> String {
    URL_SAFE_NO_PAD.encode(workspace)
}
pub(super) fn document_id(workspace: &str, id: &str) -> String {
    format!("{}.{}", routing(workspace), id)
}
pub(super) fn label(key: &str, value: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update((key.len() as u64).to_be_bytes());
    hash.update(key.as_bytes());
    hash.update((value.len() as u64).to_be_bytes());
    hash.update(value);
    hex::encode(hash.finalize())
}
pub(super) fn schema() -> Value {
    let keyword = json!({"type": "keyword"});
    json!({
        "settings": {"number_of_shards": 1, "number_of_replicas": 0,
            "analysis": {"analyzer": {"dfs_text": {"type": "custom",
                "tokenizer": "standard", "filter": ["lowercase"]}}}},
        "mappings": {"dynamic": "strict", "_routing": {"required": true},
            "_meta": {"dfs_format": "dfs-v2-es-1"},
            "properties": {
                "workspace": keyword, "object_id": keyword,
                "object_version": {"type": "unsigned_long"},
                "deleted": {"type": "boolean"}, "skipped": {"type": "boolean"},
                "name": keyword, "mime_type": keyword,
                "size": {"type": "long"}, "mode": {"type": "integer"},
                "mtime_seconds": {"type": "long"}, "mtime_nanos": {"type": "integer"},
                "xattr_keys": keyword, "xattr_values": keyword,
                "text": {"type": "text", "analyzer": "dfs_text"},
                "excerpt": {"type": "text", "index": false}
            }}
    })
}

pub(super) struct Document {
    pub body: Value,
    pub version: u64,
    pub skipped: bool,
}

async fn source(
    state: &State,
    workspace: &str,
    id: &str,
    pending: &Pending,
) -> Result<(View, Option<Record>), Status> {
    let view = View::new(&state.storage, workspace, BTreeSet::new()).await?;
    let current: Pending = decode(
        &view
            .get(&view.keys.pending_file(id)?)
            .await?
            .ok_or_else(|| status(ErrorCode::Unavailable))?,
    )?;
    if current.token != pending.token {
        return Err(status(ErrorCode::Unavailable));
    }
    let record = match pending.version {
        Some(version) => {
            let record = view.object(id).await?;
            if record.object.directory || record.object.version != version {
                return Err(status(ErrorCode::Unavailable));
            }
            Some(record)
        }
        None => {
            if view.get(&view.keys.object(id)?).await?.is_some() {
                return Err(status(ErrorCode::Unavailable));
            }
            None
        }
    };
    Ok((view, record))
}

/// @cc [owner:spolu,label:backend;concurrency] coherent-chunk-extraction
/// Each bounded chunk MUST check the same pending token and object version in its read transaction.
/// An ES publication condition MUST be obtained before calling this function. No FDB view survives
/// extraction or an ES request. A changed source MUST discard all partially extracted content.
pub(super) async fn extract(
    state: &State,
    workspace: &str,
    id: &str,
    pending: &Pending,
) -> Result<Document, Status> {
    let (view, record) = source(state, workspace, id, pending).await?;
    drop(view);
    let Some(record) = record else {
        return Ok(Document {
            body: json!({"workspace": workspace, "object_id": id,
            "deleted": true}),
            version: 0,
            skipped: false,
        });
    };
    let object = &record.object;
    let mime = object.mime_type.split(';').next().unwrap_or("").trim();
    let supported = mime.starts_with("text/")
        || matches!(
            mime,
            "application/json"
                | "application/javascript"
                | "application/xml"
                | "application/x-sh"
                | "application/octet-stream"
        );
    let mut skipped = !supported || object.size > 8 * 1024 * 1024;
    let mut bytes = Vec::new();
    if !skipped {
        bytes.resize(object.size as usize, 0);
        for start in (0..bytes.len()).step_by(MAX_IO) {
            let (view, _) = source(state, workspace, id, pending).await?;
            let end = (start + MAX_IO).min(bytes.len());
            let blocks: Vec<_> = stream::iter(start / BLOCK_SIZE..end.div_ceil(BLOCK_SIZE))
                .map(|index| {
                    let view = &view;
                    async move {
                        Ok::<_, Status>((
                            index,
                            view.get(&view.keys.block(id, index as u64)?).await?,
                        ))
                    }
                })
                .buffered(16)
                .try_collect()
                .await?;
            for (index, block) in blocks {
                if let Some(block) = block {
                    if block.len() > BLOCK_SIZE {
                        return Err(status(ErrorCode::Unavailable));
                    }
                    let offset = index * BLOCK_SIZE;
                    let length = block.len().min(end - offset);
                    bytes[offset..offset + length].copy_from_slice(&block[..length]);
                }
            }
        }
    }
    let text = match String::from_utf8(bytes) {
        Ok(text) if !text.contains('\0') => text,
        _ => {
            skipped = true;
            String::new()
        }
    };
    let excerpt: String = text.chars().take(512).collect();
    let name = record
        .parent
        .as_ref()
        .ok_or_else(|| status(ErrorCode::Unavailable))?
        .name
        .clone();
    let body = json!({"workspace": workspace, "object_id": id, "object_version": object.version,
        "deleted": false, "skipped": skipped, "name": name, "mime_type": object.mime_type,
        "size": object.size, "mode": object.mode,
        "mtime_seconds": object.mtime.as_ref().map_or(0, |t| t.seconds),
        "mtime_nanos": object.mtime.as_ref().map_or(0, |t| t.nanos),
        "xattr_keys": object.xattrs.keys().collect::<Vec<_>>(),
        "xattr_values": object.xattrs.iter().map(|(k,v)| label(k,v)).collect::<Vec<_>>(),
        "text": text, "excerpt": excerpt});
    Ok(Document {
        body,
        version: object.version,
        skipped,
    })
}
