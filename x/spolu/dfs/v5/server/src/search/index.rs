use crate::{State, model::Record, read::View, storage::decode};
use dfs_core::search::Pending;
use dfs_protocol::{BLOCK_SIZE, MAX_IO, error::status, rpc::ErrorCode};
use futures::{StreamExt, TryStreamExt, stream};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use tonic::Status;

pub(super) fn routing(workspace: &str) -> String {
    hex::encode(Sha256::digest(workspace.as_bytes()))
}
pub(super) fn document_id(workspace: &str, id: &dfs_protocol::ObjectRef) -> String {
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
/// @cc [owner:spolu,label:api] v1-keyword-tokens
/// Index and query text MUST use v1's Unicode alphanumeric boundaries, discard tokens of 40 UTF-8
/// bytes or more, and lowercase them. ES MUST only whitespace-tokenize and ASCII-fold this output.
pub(super) fn tokens(text: &str) -> String {
    let mut normalized = String::with_capacity(text.len());
    for token in text.split(|c: char| !c.is_alphanumeric()) {
        if !token.is_empty() && token.len() < 40 {
            if !normalized.is_empty() {
                normalized.push(' ');
            }
            normalized.push_str(&token.to_lowercase());
        }
    }
    normalized
}

pub(super) fn schema(write_alias: &str) -> Value {
    let keyword = json!({"type": "keyword"});
    json!({
        "aliases": {write_alias: {}},
        "settings": {"number_of_shards": 1, "number_of_replicas": 0,
            "analysis": {"analyzer": {"dfs_text": {"type": "custom",
                "tokenizer": "whitespace", "filter": ["asciifolding"]}}}},
        "mappings": {"dynamic": "strict", "_routing": {"required": true},
            "_meta": {"dfs_format": "dfs-v5-es-2", "write_alias": write_alias},
            "properties": {
                "workspace": keyword, "object_id": keyword,
                "object_revision": keyword, "directory": {"type": "boolean"},
                "deleted": {"type": "boolean"}, "skipped": {"type": "boolean"},
                "name": keyword, "name_text": {"type": "text", "analyzer": "dfs_text"}, "mime_type": keyword,
                "size": {"type": "unsigned_long"}, "mode": {"type": "integer"},
                "mtime_seconds": {"type": "long"}, "mtime_nanos": {"type": "integer"},
                "xattr_keys": keyword, "xattr_values": keyword,
                "text": {"type": "text", "analyzer": "dfs_text"},
                "excerpt": {"type": "text", "index": false}
            }}
    })
}

async fn source(
    state: &State,
    tenant: &str,
    id: &dfs_protocol::ObjectRef,
    pending: &Pending,
) -> Result<(View, Option<Record>), Status> {
    let view =
        View::from_snapshot(state.storage.snapshot().await?, tenant, BTreeSet::new()).await?;
    let current: Pending = decode(
        &view
            .get(&view.keys.pending_object(id)?)
            .await?
            .ok_or_else(|| status(ErrorCode::Unavailable))?,
    )?;
    if current.token != pending.token {
        return Err(status(ErrorCode::Unavailable));
    }
    let record = match view.object(id).await {
        Ok(record) => Some(record),
        Err(error) if dfs_protocol::error::code(&error) == ErrorCode::NotFound => None,
        Err(error) => return Err(error),
    };
    Ok((view, record))
}

/// @cc [owner:spolu,label:backend;concurrency] coherent-chunk-extraction
/// Capture an ES publication condition before extraction. Every chunk MUST verify the same job
/// token and object revision. No FDB transaction MAY survive an ES request. Changed sources MUST
/// discard their partial extraction; directories MUST index only their own name and metadata.
pub(super) async fn extract(
    state: &State,
    tenant: &str,
    id: &dfs_protocol::ObjectRef,
    pending: &Pending,
) -> Result<Value, Status> {
    let (view, record) = source(state, tenant, id, pending).await?;
    let Some(record) = record.filter(|record| record.parent.is_some()) else {
        return Ok(
            json!({"workspace": tenant, "object_id": id.real().map_err(|_| status(ErrorCode::Internal))?.to_string(), "deleted": true}),
        );
    };
    let metadata = view.extended(&record).await?;
    drop(view);
    let object = &record.object;
    let mime = metadata.mime_type.split(';').next().unwrap_or("").trim();
    let supported = mime.starts_with("text/")
        || matches!(
            mime,
            "application/json"
                | "application/javascript"
                | "application/xml"
                | "application/x-sh"
                | "application/octet-stream"
        );
    let mut skipped = !object.directory && (!supported || object.size > 8 * 1024 * 1024);
    let mut bytes = Vec::new();
    if !object.directory && !skipped {
        bytes.resize(object.size as usize, 0);
        for start in (0..bytes.len()).step_by(MAX_IO) {
            let (view, current) = source(state, tenant, id, pending).await?;
            if current.is_none_or(|r| r.object.revision != object.revision) {
                return Err(status(ErrorCode::Unavailable));
            }
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
    let text = tokens(&text);
    let name = record
        .parent
        .as_ref()
        .ok_or_else(|| status(ErrorCode::Internal))?
        .name
        .clone();
    Ok(
        json!({"workspace": tenant, "object_id": id.real().map_err(|_| status(ErrorCode::Internal))?.to_string(),
        "object_revision": hex::encode(object.revision.as_slice()), "directory": object.directory,
        "deleted": false, "skipped": skipped, "name": name, "name_text": tokens(&name),
        "mime_type": metadata.mime_type, "size": object.size, "mode": object.mode,
        "mtime_seconds": object.mtime.as_ref().map_or(0, |t| t.seconds),
        "mtime_nanos": object.mtime.as_ref().map_or(0, |t| t.nanos),
        "xattr_keys": metadata.xattrs.keys().collect::<Vec<_>>(),
        "xattr_values": metadata.xattrs.iter().map(|(k,v)| label(k,v)).collect::<Vec<_>>(),
        "text": text, "excerpt": excerpt}),
    )
}
