use std::{
    cmp::Reverse,
    collections::{BTreeSet, BinaryHeap, VecDeque},
    ops::Bound,
    sync::Arc,
};

use anyhow::{Context, Result, ensure};
use futures::{StreamExt, TryStreamExt, stream};
use slatedb::{
    DbSnapshot,
    config::{DurabilityLevel, ScanOptions},
};

use super::{codec, keys::Keyspace};
use crate::model::{DirectoryEntry, EntryName, ObjectId, ObjectMetadata};

mod memo;
pub(crate) use memo::ReadMemo;

struct Row {
    key: slatedb::bytes::Bytes,
    value: slatedb::bytes::Bytes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChangeEvent {
    pub sequence: u64,
    pub object_ids: Vec<ObjectId>,
}

/**
 * @cc [owner:spolu,label:security] workspace-read-view
 * Every lookup and scan MUST use its fixed workspace and one consistent SlateDB/overlay snapshot.
 * Overlay tombstones MUST suppress base rows; page limits MUST apply after the ordered merge.
 * Views MUST pin their visible staged versions, including versions later coalesced out of remote
 * persistence. Content callers MUST retain the view until acquiring a version-pinned read stream.
 * Scans MUST be bounded and cursors MUST be relative to their typed prefix; callers cannot supply
 * arbitrary database keys. Corrupt records MUST return errors, never masquerade as absent data.
 */
#[derive(Clone)]
pub struct ReadView {
    pub(super) keys: Keyspace,
    pub(super) overlay: super::cache::Overlay,
    pub(super) _content_pins: super::cache::ContentPins,
    pub(super) snapshot: Arc<DbSnapshot>,
    pub(super) memo: Option<Arc<ReadMemo>>,
    pub(super) sequence: tokio::sync::OnceCell<u64>,
}

impl ReadView {
    pub(super) async fn get(&self, key: Vec<u8>) -> Result<Option<slatedb::bytes::Bytes>> {
        if let Some(memo) = &self.memo {
            let sequence = self.sequence().await?;
            if let Some(value) = memo.row(sequence, &key)? {
                return Ok(value);
            }
            let value = self.get_uncached(&key).await?;
            memo.insert_row(sequence, key, value.clone())?;
            return Ok(value);
        }
        self.get_uncached(&key).await
    }

    async fn get_uncached(&self, key: &[u8]) -> Result<Option<slatedb::bytes::Bytes>> {
        if let Some((_, value)) = self.overlay.get(key) {
            return Ok(value.clone());
        }
        Ok(self.snapshot.get(key).await?)
    }

    /// Resolve the workspace root from the same snapshot as its namespace and grants.
    pub(crate) async fn root_id(&self) -> Result<ObjectId> {
        let bytes = self
            .get(self.keys.workspace_record())
            .await?
            .context("missing workspace record")?;
        let record: super::workspace::WorkspaceRecord = codec::decode(&bytes)?;
        Ok(ObjectId::from_bytes(record.root_id))
    }

    /// Memory-visible mutation sequence from the same snapshot as metadata and authorization.
    pub(crate) async fn sequence(&self) -> Result<u64> {
        self.sequence
            .get_or_try_init(|| async {
                self.get_uncached(&self.keys.change_sequence())
                    .await?
                    .map(|bytes| codec::decode(&bytes))
                    .transpose()
                    .map(|value| value.unwrap_or(0))
            })
            .await
            .copied()
    }

    pub(crate) async fn was_authorized(&self, id: ObjectId, grants: [u8; 32]) -> Result<bool> {
        match &self.memo {
            Some(memo) => memo.authorized(self.sequence().await?, self.keys.object(id), grants),
            None => Ok(false),
        }
    }

    pub(crate) async fn remember_authorized(&self, id: ObjectId, grants: [u8; 32]) -> Result<()> {
        if let Some(memo) = &self.memo {
            memo.authorize(self.sequence().await?, self.keys.object(id), grants)?;
        }
        Ok(())
    }

    /// SlateDB has point reads; keep page fetches bounded and preserve the requested order.
    pub async fn objects(&self, ids: &[ObjectId]) -> Result<Vec<Option<ObjectMetadata>>> {
        ensure!(ids.len() <= 1000, "object batch exceeds 1000 entries");
        stream::iter(ids.iter().copied().map(|id| self.object(id)))
            .buffered(16)
            .try_collect()
            .await
    }

    /**
     * @cc [owner:spolu,label:security] bounded-grant-intersection
     * Grant checks MUST use this view's workspace and snapshot, comparing exact opaque grant
     * values.
     * Check at most 512 session grants without enumerating an object's unbounded attachment set.
     */
    pub async fn has_any_grant(&self, object: ObjectId, grants: &BTreeSet<String>) -> Result<bool> {
        ensure!(grants.len() <= 512, "too many session grants");
        let keys: Vec<_> = grants
            .iter()
            .map(|grant| self.keys.grant(object, grant))
            .collect();
        stream::iter(keys)
            .map(|key| async move {
                let value = self.get(key).await?;
                if let Some(value) = value {
                    codec::decode::<()>(&value)?;
                    Ok::<_, anyhow::Error>(true)
                } else {
                    Ok(false)
                }
            })
            .buffer_unordered(16)
            .try_any(|present| async move { present })
            .await
    }

    pub async fn object(&self, id: ObjectId) -> Result<Option<ObjectMetadata>> {
        self.get(self.keys.object(id))
            .await?
            .map(|bytes| codec::decode_object(&bytes, &self.keys.workspace, id))
            .transpose()
    }

    pub async fn child(&self, parent: ObjectId, name: &EntryName) -> Result<Option<ObjectId>> {
        self.get(self.keys.child(parent, name))
            .await?
            .map(|bytes| codec::decode(&bytes).map(ObjectId::from_bytes))
            .transpose()
    }

    pub async fn children(
        &self,
        parent: ObjectId,
        after: Option<&EntryName>,
        limit: usize,
    ) -> Result<Vec<DirectoryEntry>> {
        let prefix = self.keys.children(parent);
        self.scan(
            &prefix,
            after.map(|name| name.as_str().as_bytes()),
            limit,
            DurabilityLevel::Memory,
        )
        .await?
        .into_iter()
        .map(|row| {
            Ok(DirectoryEntry {
                workspace_id: self.keys.workspace.clone(),
                parent_id: parent,
                name: std::str::from_utf8(&row.key[prefix.len()..])?.parse()?,
                object_id: ObjectId::from_bytes(codec::decode(&row.value)?),
            })
        })
        .collect()
    }

    pub async fn grants(
        &self,
        object: ObjectId,
        after: Option<&str>,
        limit: usize,
    ) -> Result<Vec<String>> {
        let prefix = self.keys.grants(object);
        self.scan(
            &prefix,
            after.map(str::as_bytes),
            limit,
            DurabilityLevel::Memory,
        )
        .await?
        .into_iter()
        .map(|row| {
            codec::decode::<()>(&row.value)?;
            Ok(std::str::from_utf8(&row.key[prefix.len()..])?.to_owned())
        })
        .collect()
    }

    pub async fn granted_objects(
        &self,
        grant: &str,
        after: Option<ObjectId>,
        limit: usize,
    ) -> Result<Vec<ObjectId>> {
        let prefix = self.keys.granted_objects(grant)?;
        self.scan(
            &prefix,
            after.as_ref().map(|id| id.as_bytes().as_slice()),
            limit,
            DurabilityLevel::Memory,
        )
        .await?
        .into_iter()
        .map(|row| {
            codec::decode::<()>(&row.value)?;
            Ok(ObjectId::from_bytes(
                row.key[prefix.len()..]
                    .try_into()
                    .context("invalid object ID in grant index")?,
            ))
        })
        .collect()
    }

    /**
     * @cc [owner:spolu,label:security;performance] paginated-grant-union
     * Discovery MUST merge at most 512 exact grant prefixes in this workspace and snapshot, ordered
     * by object ID with duplicates removed before applying the page limit. Memory MUST be bounded
     * by grant count and page size, never the total number of matching objects. Cursors MUST only
     * advance the scan; they MUST NOT confer access.
     */
    pub(crate) async fn granted_union(
        &self,
        grants: &BTreeSet<String>,
        after: Option<ObjectId>,
        limit: usize,
    ) -> Result<Vec<ObjectId>> {
        ensure!(grants.len() <= 512, "too many session grants");
        ensure!((1..=1000).contains(&limit), "invalid discovery limit");
        let chunk_size = limit.min(32);
        let mut scans: Vec<_> = stream::iter(grants.iter().cloned())
            .map(|grant| async move {
                let ids = self.granted_objects(&grant, after, chunk_size).await?;
                let exhausted = ids.len() < chunk_size;
                Ok::<_, anyhow::Error>((grant, VecDeque::from(ids), exhausted))
            })
            .buffered(16)
            .try_collect()
            .await?;
        let mut heads = BinaryHeap::new();
        for (index, (_, ids, _)) in scans.iter_mut().enumerate() {
            if let Some(id) = ids.pop_front() {
                heads.push(Reverse((*id.as_bytes(), index)));
            }
        }
        let mut result = Vec::with_capacity(limit);
        while let Some(Reverse((bytes, index))) = heads.pop() {
            let id = ObjectId::from_bytes(bytes);
            if result.last() != Some(&id) {
                result.push(id);
                if result.len() == limit {
                    break;
                }
            }
            let (grant, ids, exhausted) = &mut scans[index];
            if ids.is_empty() && !*exhausted {
                let next = self.granted_objects(grant, Some(id), chunk_size).await?;
                *exhausted = next.len() < chunk_size;
                *ids = next.into();
            }
            if let Some(next) = ids.pop_front() {
                heads.push(Reverse((*next.as_bytes(), index)));
            }
        }
        Ok(result)
    }

    /**
     * @cc [owner:spolu,label:backend] durable-change-feed
     * Change scans MUST include only events whose SlateDB batch is durable. Published but
     * unflushed events MUST NOT become indexing input. Sequence cursors are workspace-scoped.
     */
    pub async fn changes(&self, after: u64, limit: usize) -> Result<Vec<ChangeEvent>> {
        let prefix = self.keys.changes();
        self.scan(
            &prefix,
            Some(&after.to_be_bytes()),
            limit,
            DurabilityLevel::Remote,
        )
        .await?
        .into_iter()
        .map(|row| {
            let ids: Vec<[u8; 16]> = codec::decode(&row.value)?;
            Ok(ChangeEvent {
                sequence: u64::from_be_bytes(
                    row.key[prefix.len()..]
                        .try_into()
                        .context("invalid change sequence")?,
                ),
                object_ids: ids.into_iter().map(ObjectId::from_bytes).collect(),
            })
        })
        .collect()
    }

    async fn scan(
        &self,
        prefix: &[u8],
        after: Option<&[u8]>,
        limit: usize,
        durability: DurabilityLevel,
    ) -> Result<Vec<Row>> {
        ensure!(
            (1..=1000).contains(&limit),
            "scan limit must be between 1 and 1000"
        );
        let start = after
            .map(|bytes| Bound::Excluded(bytes.to_vec()))
            .unwrap_or(Bound::Unbounded);
        let mut iterator = self
            .snapshot
            .scan_prefix_with_options(
                prefix,
                (start, Bound::<Vec<u8>>::Unbounded),
                &ScanOptions::default().with_durability_filter(durability),
            )
            .await?;
        let full_start = after.map(|suffix| [prefix, suffix].concat());
        let mut overlay = self
            .overlay
            .range((
                full_start
                    .map(Bound::Excluded)
                    .unwrap_or_else(|| Bound::Included(prefix.to_vec())),
                Bound::<Vec<u8>>::Unbounded,
            ))
            .peekable();
        let remote_only = matches!(durability, DurabilityLevel::Remote);
        let mut base = iterator.next().await?;
        let mut rows = Vec::new();
        while rows.len() < limit {
            let next_overlay = if remote_only {
                None
            } else {
                match overlay.peek() {
                    Some(row) if row.0.starts_with(prefix) => Some(row),
                    _ => None,
                }
            };
            if let Some((key, (_, value))) = next_overlay
                && base
                    .as_ref()
                    .is_none_or(|row| key.as_slice() <= row.key.as_ref())
            {
                let key = (*key).clone();
                let value = value.clone();
                overlay.next();
                if base
                    .as_ref()
                    .is_some_and(|row| row.key.as_ref() == key.as_slice())
                {
                    base = iterator.next().await?;
                }
                if let Some(value) = value {
                    rows.push(Row {
                        key: key.into(),
                        value,
                    });
                }
            } else if let Some(row) = base.take() {
                ensure!(row.key.starts_with(prefix), "scan escaped its prefix");
                rows.push(Row {
                    key: row.key,
                    value: row.value,
                });
                base = iterator.next().await?;
            } else {
                break;
            }
        }
        Ok(rows)
    }
}
