use std::{ops::Bound, sync::Arc};

use anyhow::{Context, Result, ensure};
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
pub struct ReadView {
    pub(super) keys: Keyspace,
    pub(super) snapshot: Arc<DbSnapshot>,
}

impl ReadView {
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
