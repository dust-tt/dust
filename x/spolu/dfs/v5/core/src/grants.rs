use crate::{
    keys::Keys,
    storage::{Snapshot, WriteBatch, failed},
    tree::GrantId,
};
use dfs_protocol::{MAX_GRANTS, error::status, rpc::ErrorCode, validate};
use futures::{StreamExt, TryStreamExt, stream};
use std::collections::{BTreeMap, BTreeSet};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
#[cfg(test)]
mod tests;

pub fn decode_id(bytes: &[u8]) -> Result<GrantId> {
    let id = u32::from_be_bytes(bytes.try_into().map_err(failed)?);
    if id == 0 {
        return Err(status(ErrorCode::Unavailable));
    }
    Ok(GrantId(id))
}

async fn lookup(
    snapshot: &Snapshot,
    keys: &Keys,
    names: &BTreeSet<String>,
) -> Result<BTreeMap<String, Option<GrantId>>> {
    if names.len() > MAX_GRANTS {
        return Err(status(ErrorCode::InvalidInput));
    }
    for name in names {
        validate::grant(name)?;
    }
    stream::iter(names.iter().cloned().collect::<Vec<_>>())
        .map(|name| async move {
            let id = snapshot
                .get(keys.grant_name(&name))
                .await?
                .map(|bytes| decode_id(&bytes))
                .transpose()?;
            Ok((name, id))
        })
        .buffered(16)
        .try_collect()
        .await
}

/// @cc [owner:spolu,label:backend;security] durable-grant-identity
/// Interning MUST allocate tenant-scoped nonzero u32 IDs with conflict-tracked dictionary and
/// allocator reads. Both directions and the allocator MUST commit atomically with the caller's
/// transaction. Existing IDs MUST remain stable forever; exhaustion MUST fail without wrapping.
/// Session creation MUST intern unknown names so subsequent attachments match existing sessions.
pub async fn intern(
    snapshot: &Snapshot,
    keys: &Keys,
    names: &BTreeSet<String>,
) -> Result<BTreeMap<String, GrantId>> {
    let found = lookup(snapshot, keys, names).await?;
    let mut batch = WriteBatch::new();
    let mut result = BTreeMap::new();
    let mut last = if found.values().any(Option::is_none) {
        snapshot
            .get(keys.grant_next())
            .await?
            .map(|bytes| decode_id(&bytes).map(|id| id.0))
            .transpose()?
            .unwrap_or(0)
    } else {
        0
    };
    for (name, id) in found {
        let id = match id {
            Some(id) => id,
            None => {
                last = last
                    .checked_add(1)
                    .ok_or_else(|| status(ErrorCode::Capacity))?;
                let id = GrantId(last);
                batch.put(keys.grant_name(&name), last.to_be_bytes());
                batch.put(keys.grant_id(id), name.as_bytes());
                id
            }
        };
        result.insert(name, id);
    }
    if !batch.0.is_empty() {
        batch.put(keys.grant_next(), last.to_be_bytes());
        batch.apply(snapshot)?;
    }
    Ok(result)
}

/// Name resolution is read-only; unknown names have no attachments and match nothing.
pub async fn resolve(
    snapshot: &Snapshot,
    keys: &Keys,
    names: &BTreeSet<String>,
) -> Result<Vec<GrantId>> {
    let mut ids: Vec<_> = lookup(snapshot, keys, names)
        .await?
        .into_values()
        .flatten()
        .collect();
    ids.sort_unstable();
    ids.dedup();
    Ok(ids)
}

pub async fn name(snapshot: &Snapshot, keys: &Keys, id: GrantId) -> Result<String> {
    let value = snapshot
        .get(keys.grant_id(id))
        .await?
        .ok_or_else(|| status(ErrorCode::Unavailable))?;
    String::from_utf8(value.to_vec()).map_err(failed)
}
