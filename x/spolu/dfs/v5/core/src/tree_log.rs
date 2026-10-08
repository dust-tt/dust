use crate::{
    keys::{Keys, prefix_end},
    model::Record,
    storage::{Snapshot, WriteBatch, decode, failed},
    tree::{GrantId, Image, Update},
};
use dfs_protocol::{ObjectId, ObjectRef, error::status, rpc::ErrorCode};
use std::{collections::BTreeSet, ops::Bound, sync::Arc};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
const DIRECTORY: u8 = 1;
const GRANTS: u8 = 2;
const DELETED: u8 = 4;

#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub max_count: u64,
    pub max_bytes: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            max_count: 1_000_000,
            max_bytes: 512 * 1024 * 1024,
        }
    }
}
impl Limits {
    pub fn capacity(self, keys: &Keys) -> u64 {
        // Include key/value bytes and conservative storage overhead for all three tombstone rows.
        let bytes = (keys.tree_nodes().len()
            + 16
            + 27
            + (keys.tree_updates().len() + 26) * 2
            + 17
            + 3 * 64) as u64;
        self.max_count.min(self.max_bytes / bytes)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Stamp(pub [u8; 10]);
impl Stamp {
    pub fn version(self) -> i64 {
        i64::from_be_bytes([
            self.0[0], self.0[1], self.0[2], self.0[3], self.0[4], self.0[5], self.0[6], self.0[7],
        ])
    }
    fn decode(bytes: &[u8]) -> Result<Self> {
        let stamp = Self(bytes.try_into().map_err(failed)?);
        if stamp.version() < 0 {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(stamp)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Node {
    pub parent: Option<ObjectId>,
    pub directory: bool,
    pub has_grants: bool,
    pub deleted: bool,
}
impl Node {
    pub fn encode(self) -> [u8; 17] {
        let mut bytes = [0; 17];
        bytes[0] = (u8::from(self.directory) * DIRECTORY)
            | (u8::from(self.has_grants) * GRANTS)
            | (u8::from(self.deleted) * DELETED);
        if let Some(parent) = self.parent {
            bytes[1..].copy_from_slice(parent.as_bytes());
        }
        bytes
    }
    pub fn decode(bytes: &[u8]) -> Result<Self> {
        if bytes.len() != 17 || bytes[0] & !7 != 0 {
            return Err(status(ErrorCode::Unavailable));
        }
        let parent = if bytes[1..] == [0; 16] {
            None
        } else {
            Some(ObjectId::try_from(&bytes[1..]).map_err(failed)?)
        };
        let node = Self {
            parent,
            directory: bytes[0] & DIRECTORY != 0,
            has_grants: bytes[0] & GRANTS != 0,
            deleted: bytes[0] & DELETED != 0,
        };
        if (node.deleted && (node.has_grants || node.parent.is_some() || node.directory))
            || (!node.deleted && !node.directory && node.parent.is_none())
        {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(node)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Head {
    pub stamp: Stamp,
    pub node: Node,
}
impl Head {
    pub fn decode(bytes: &[u8]) -> Result<Self> {
        if bytes.len() != 27 {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(Self {
            stamp: Stamp::decode(&bytes[..10])?,
            node: Node::decode(&bytes[10..])?,
        })
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Control {
    pub incarnation: ObjectId,
    pub resume_floor: i64,
}
pub async fn control(snapshot: &Snapshot, keys: &Keys) -> Result<Control> {
    let incarnation = snapshot
        .get(keys.tree_incarnation())
        .await?
        .ok_or_else(|| status(ErrorCode::Unavailable))?;
    let floor = snapshot.get(keys.tree_floor()).await?;
    let resume_floor = floor.map_or(Ok(0), |v| {
        v.as_ref()
            .try_into()
            .map(i64::from_be_bytes)
            .map_err(failed)
    })?;
    if resume_floor < 0 {
        return Err(status(ErrorCode::Unavailable));
    }
    Ok(Control {
        incarnation: ObjectId::try_from(incarnation.as_ref()).map_err(failed)?,
        resume_floor,
    })
}
pub fn index_key(mut prefix: Vec<u8>, stamp: Stamp, id: ObjectId) -> Vec<u8> {
    prefix.extend_from_slice(&stamp.0);
    prefix.extend_from_slice(id.as_bytes());
    prefix
}

/// @cc [owner:spolu,label:backend;concurrency] coalesced-tree-publication
/// The caller MUST finish all filesystem/grant edits before calling once per transaction. Each
/// affected object MUST replace its old head/log row with one final commit-stamped image, using a
/// tracked old-head read. Deletions MUST retain indexed tombstones. Filesystem and feed writes MUST
/// commit together; ordinary content/metadata edits MUST NOT emit unchanged authorization images.
pub async fn publish(
    snapshot: &Arc<Snapshot>,
    keys: &Keys,
    objects: &BTreeSet<ObjectRef>,
) -> Result<()> {
    publish_with_limits(snapshot, keys, objects, Limits::default()).await
}
/// @cc [owner:spolu,label:performance;concurrency] hard-tombstone-ceiling
/// A positive tombstone-count delta MUST read the count with conflicts and reject a transaction
/// exceeding either configured count or accounted-byte limit before publishing its log writes.
/// Concurrent deletions MUST NOT collectively bypass the bound; GC restores headroom for retries.
pub async fn publish_with_limits(
    snapshot: &Arc<Snapshot>,
    keys: &Keys,
    objects: &BTreeSet<ObjectRef>,
    limits: Limits,
) -> Result<()> {
    let mut batch = WriteBatch::new();
    let mut added_tombstones = 0i64;
    for object in objects {
        let id = object.real().map_err(failed)?;
        let key = keys.tree_node(id);
        let old = snapshot
            .get(&key)
            .await?
            .map(|v| Head::decode(&v))
            .transpose()?;
        let record = snapshot
            .get(keys.object(object)?)
            .await?
            .map(|v| decode::<Record>(&v))
            .transpose()?;
        let node = match record {
            Some(record) => {
                if record.object.id != *object {
                    return Err(status(ErrorCode::Unavailable));
                }
                let grants = keys.grants(object)?;
                let has_grants = !snapshot
                    .range(&grants, &prefix_end(&grants), 1)
                    .await?
                    .0
                    .is_empty();
                Node {
                    parent: record
                        .parent
                        .map(|p| p.id.real())
                        .transpose()
                        .map_err(failed)?,
                    directory: record.object.directory,
                    has_grants,
                    deleted: false,
                }
            }
            None if old.is_some() => Node {
                parent: None,
                directory: false,
                has_grants: false,
                deleted: true,
            },
            None => return Err(status(ErrorCode::Unavailable)),
        };
        if let Some(old) = old {
            batch.delete(index_key(keys.tree_updates(), old.stamp, id));
            if old.node.deleted {
                batch.delete(index_key(keys.tree_deleted(), old.stamp, id));
                batch.add(keys.tree_deleted_count(), -1);
                added_tombstones -= 1;
            }
        }
        let image = node.encode();
        let head = [[255; 10].as_slice(), image.as_slice()].concat();
        batch.stamped_value(key, head, 0);
        let prefix = keys.tree_updates();
        let offset = prefix.len();
        batch.stamped_key(index_key(prefix, Stamp([255; 10]), id), image, offset);
        if node.deleted {
            let prefix = keys.tree_deleted();
            let offset = prefix.len();
            batch.stamped_key(index_key(prefix, Stamp([255; 10]), id), [], offset);
            batch.add(keys.tree_deleted_count(), 1);
            added_tombstones += 1;
        }
    }
    if added_tombstones > 0
        && deleted_count(snapshot, keys)
            .await?
            .saturating_add(added_tombstones as u64)
            > limits.capacity(keys)
    {
        return Err(status(ErrorCode::Capacity));
    }
    batch.apply(snapshot)
}

pub async fn deleted_count(snapshot: &Snapshot, keys: &Keys) -> Result<u64> {
    let count = snapshot
        .get(keys.tree_deleted_count())
        .await?
        .map_or(Ok(0), |v| {
            v.as_ref()
                .try_into()
                .map(i64::from_le_bytes)
                .map_err(failed)
        })?;
    u64::try_from(count).map_err(failed)
}

/// @cc [owner:spolu,label:backend;security] tombstone-resume-floor
/// GC MUST verify every selected tombstone's current head, clear its three rows and advance the
/// resume floor through the removed commit version in the same transaction. Live rows MUST remain.
/// Age cutoffs MUST come from sampled read versions; ceilings MAY force earlier collection.
pub async fn collect(
    snapshot: &Arc<Snapshot>,
    keys: &Keys,
    age_cutoff: i64,
    max_count: u64,
    max_bytes: u64,
    batch_limit: usize,
) -> Result<WriteBatch> {
    if !(1..=1024).contains(&batch_limit) || age_cutoff < 0 {
        return Err(status(ErrorCode::InvalidInput));
    }
    let count = deleted_count(snapshot, keys).await?;
    let excess = count.saturating_sub(
        Limits {
            max_count,
            max_bytes,
        }
        .capacity(keys),
    );
    let prefix = keys.tree_deleted();
    let (rows, _) = snapshot
        .range(&prefix, &prefix_end(&prefix), batch_limit)
        .await?;
    let mut batch = WriteBatch::new();
    let mut removed = 0;
    for (key, _) in rows {
        let (stamp, id) = decode_index(&key, &prefix)?;
        if stamp.version() > age_cutoff && removed >= excess {
            break;
        }
        let head_key = keys.tree_node(id);
        let head = snapshot
            .get(&head_key)
            .await?
            .ok_or_else(|| status(ErrorCode::Unavailable))?;
        let head = Head::decode(&head)?;
        if head.stamp != stamp || !head.node.deleted {
            return Err(status(ErrorCode::Unavailable));
        }
        batch.delete(head_key);
        batch.delete(index_key(keys.tree_updates(), stamp, id));
        batch.delete(key);
        batch.byte_max(keys.tree_floor(), stamp.version().to_be_bytes());
        removed += 1;
    }
    if removed > 0 {
        batch.add(keys.tree_deleted_count(), -(removed as i64));
    }
    Ok(batch)
}
fn decode_index(key: &[u8], prefix: &[u8]) -> Result<(Stamp, ObjectId)> {
    if !key.starts_with(prefix) || key.len() != prefix.len() + 26 {
        return Err(status(ErrorCode::Unavailable));
    }
    Ok((
        Stamp::decode(&key[prefix.len()..prefix.len() + 10])?,
        ObjectId::try_from(&key[prefix.len() + 10..]).map_err(failed)?,
    ))
}

pub struct StampedUpdate {
    pub stamp: Stamp,
    pub update: Update,
}
pub struct Interval {
    pub control: Control,
    pub version: i64,
    pub updates: Vec<StampedUpdate>,
}
/// @cc [owner:spolu,label:security;concurrency] fixed-version-tree-interval
/// An interval MUST cover all current entries in (after_version, snapshot.version], including all
/// transaction suffixes at each boundary, with grants hydrated in that snapshot. A floor violation
/// or staging overflow MUST fail the whole interval. The caller MUST freshly fence control before
/// atomically publishing any returned updates; this function alone does not renew a tree's age.
pub async fn interval(
    snapshot: &Arc<Snapshot>,
    keys: &Keys,
    after_version: i64,
    max_bytes: usize,
) -> Result<Interval> {
    let control = control(snapshot, keys).await?;
    if after_version < control.resume_floor || after_version > snapshot.read_version {
        return Err(status(ErrorCode::StaleView));
    }
    let prefix = keys.tree_updates();
    let mut start = prefix.clone();
    start.extend_from_slice(
        &after_version
            .checked_add(1)
            .ok_or_else(|| status(ErrorCode::Unavailable))?
            .to_be_bytes(),
    );
    let mut end = prefix.clone();
    end.extend_from_slice(
        &snapshot
            .read_version
            .checked_add(1)
            .ok_or_else(|| status(ErrorCode::Unavailable))?
            .to_be_bytes(),
    );
    let mut scan = snapshot
        .scan((Bound::Included(start), Bound::Excluded(end)))
        .await?;
    let mut updates = Vec::new();
    let mut bytes = 0usize;
    while let Some(row) = scan.next().await? {
        let (stamp, id) = decode_index(&row.key, &prefix)?;
        let node = Node::decode(&row.value)?;
        bytes = bytes.saturating_add(192);
        if bytes > max_bytes {
            return Err(status(ErrorCode::Capacity));
        }
        let update = hydrate(snapshot, keys, id, node, max_bytes - bytes).await?;
        if let Update::Live(image) = &update {
            bytes = bytes.saturating_add(image.grants.capacity() * size_of::<GrantId>());
        }
        updates.push(StampedUpdate { stamp, update });
    }
    Ok(Interval {
        control,
        version: snapshot.read_version,
        updates,
    })
}
pub async fn hydrate(
    snapshot: &Arc<Snapshot>,
    keys: &Keys,
    id: ObjectId,
    node: Node,
    max_bytes: usize,
) -> Result<Update> {
    if node.deleted {
        return Ok(Update::Deleted(id));
    }
    let mut grants = Vec::new();
    if node.has_grants {
        let prefix = keys.grants(&ObjectRef::Object(id))?;
        let mut scan = snapshot
            .scan((
                Bound::Included(prefix.clone()),
                Bound::Excluded(prefix_end(&prefix)),
            ))
            .await?;
        while let Some(row) = scan.next().await? {
            if (grants.len() + 1) * size_of::<GrantId>() > max_bytes {
                return Err(status(ErrorCode::Capacity));
            }
            if grants.len() == grants.capacity() {
                let remaining = max_bytes / size_of::<GrantId>() - grants.len();
                grants
                    .try_reserve_exact(grants.capacity().max(16).min(remaining))
                    .map_err(failed)?;
            }
            grants.push(crate::grants::decode_id(&row.key[prefix.len()..])?);
        }
        if grants.is_empty() {
            return Err(status(ErrorCode::Unavailable));
        }
    }
    Ok(Update::Live(Image {
        id,
        parent: node.parent,
        directory: node.directory,
        grants,
    }))
}
