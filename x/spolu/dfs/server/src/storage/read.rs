use std::{collections::BTreeSet, ops::Bound, sync::Arc};

use anyhow::{Context, Result, ensure};
use futures::{StreamExt, TryStreamExt, stream};
use slatedb::{
    DbSnapshot, KeyValue,
    config::{DurabilityLevel, ScanOptions},
};

use super::{codec, keys::Keyspace};
use crate::model::{DirectoryEntry, EntryName, ObjectId, ObjectMetadata};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChangeEvent {
    pub sequence: u64,
    pub object_ids: Vec<ObjectId>,
}

/**
 * @cc [owner:spolu,label:security] workspace-read-view
 * Every lookup and scan in a view MUST use its fixed workspace and one SlateDB snapshot.
 * Scans MUST be bounded and cursors MUST be relative to their typed prefix; callers cannot supply
 * arbitrary database keys. Corrupt records MUST return errors, never masquerade as absent data.
 */
#[derive(Clone)]
pub struct ReadView {
    pub(super) keys: Keyspace,
    pub(super) snapshot: Arc<DbSnapshot>,
}

impl ReadView {
    /// Memory-visible mutation sequence from the same snapshot as metadata and authorization.
    pub(crate) async fn sequence(&self) -> Result<u64> {
        self.snapshot
            .get(self.keys.change_sequence())
            .await?
            .map(|bytes| codec::decode(&bytes))
            .transpose()
            .map(|value| value.unwrap_or(0))
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
     * Grant checks MUST use this view's workspace and snapshot, comparing exact opaque grant values.
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
                let value = self.snapshot.get(key).await?;
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
        self.snapshot
            .get(self.keys.object(id))
            .await?
            .map(|bytes| codec::decode_object(&bytes, &self.keys.workspace, id))
            .transpose()
    }

    pub async fn child(&self, parent: ObjectId, name: &EntryName) -> Result<Option<ObjectId>> {
        self.snapshot
            .get(self.keys.child(parent, name))
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
    ) -> Result<Vec<KeyValue>> {
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
        let mut rows = Vec::new();
        while rows.len() < limit {
            let Some(row) = iterator.next().await? else {
                break;
            };
            ensure!(row.key.starts_with(prefix), "scan escaped its prefix");
            rows.push(row);
        }
        Ok(rows)
    }
}
