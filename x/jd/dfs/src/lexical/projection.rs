use crate::{
    memory::{Budget, Reservation},
    model::id,
    store::StoreMemory,
};
use anyhow::{Result, ensure};
use bincode::Options as _;
use parking_lot::Mutex;
use rocksdb::{
    DB, DBRecoveryMode, IteratorMode, Options, ReadOptions, Snapshot, WriteBatch, WriteOptions,
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, sync::Arc, time::Instant};

use super::membership::{MembershipChunk, split_slot};

const FORMAT: u32 = 1;
const STATE_KEY: &[u8] = b"!state";
pub const MAX_KEY_BYTES: usize = 16 << 10;
pub const MAX_VALUE_BYTES: usize = 64 << 10;
pub const MAX_BATCH_BYTES: usize = 16 << 20;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionVersion {
    pub format: u32,
    pub epoch: String,
    pub generation: u64,
    pub next_slot: u64,
}

struct WriterState {
    version: ProjectionVersion,
    failed: bool,
}

pub struct Projection {
    db: Arc<DB>,
    writer: Mutex<WriterState>,
}

self_cell::self_cell! {
    struct SnapshotCell {
        owner: Arc<DB>,
        #[covariant]
        dependent: Snapshot,
    }
}

pub struct ProjectionSnapshot {
    cell: SnapshotCell,
    version: ProjectionVersion,
}

pub struct ProjectionValue {
    bytes: Vec<u8>,
    _reservation: Reservation,
}

impl AsRef<[u8]> for ProjectionValue {
    fn as_ref(&self) -> &[u8] {
        &self.bytes
    }
}

pub struct ProjectionBatch {
    batch: WriteBatch,
    base: ProjectionVersion,
    owner: Arc<DB>,
    reservation: Reservation,
}

struct ChunkEdit {
    chunk: MembershipChunk,
    dirty: bool,
}

pub struct MembershipEditor<'a> {
    chunks: BTreeMap<Vec<u8>, ChunkEdit>,
    key_reservations: Vec<Reservation>,
    snapshot: &'a ProjectionSnapshot,
    budget: Arc<Budget>,
    deadline: Instant,
    max_chunks: usize,
}

impl<'a> MembershipEditor<'a> {
    pub fn new(
        snapshot: &'a ProjectionSnapshot,
        budget: Arc<Budget>,
        deadline: Instant,
        max_chunks: usize,
    ) -> Result<Self> {
        ensure!(
            (1..=65_536).contains(&max_chunks),
            "membership edit count bound"
        );
        Ok(Self {
            chunks: BTreeMap::new(),
            key_reservations: Vec::new(),
            snapshot,
            budget,
            deadline,
            max_chunks,
        })
    }

    pub fn set(&mut self, family: u8, text: &str, slot: u32, present: bool) -> Result<()> {
        ensure!(
            matches!(family, b'n' | b'g' | b's'),
            "membership key family"
        );
        ensure!(Instant::now() < self.deadline, "membership edit deadline");
        ensure!(
            text.len() <= MAX_KEY_BYTES / 2 - 4,
            "membership text length"
        );
        let key_reservation = self
            .budget
            .acquire(2 * text.len() + 8 + 384, Instant::now())?;
        let (block, offset) = split_slot(slot);
        let key = membership_key(family, text, block)?;
        if let Some(edit) = self.chunks.get_mut(&key) {
            edit.dirty |= edit.chunk.set(offset, present)?;
            return Ok(());
        }
        ensure!(
            self.chunks.len() < self.max_chunks,
            "membership edit count capacity"
        );
        let mut chunk = match self.snapshot.get(&key, &self.budget, Instant::now())? {
            Some(encoded) => {
                MembershipChunk::decode(encoded.as_ref(), &self.budget, Instant::now())?
            }
            None => MembershipChunk::empty(&self.budget, Instant::now())?,
        };
        let dirty = chunk.set(offset, present)?;
        self.chunks.insert(key, ChunkEdit { chunk, dirty });
        self.key_reservations.push(key_reservation);
        Ok(())
    }

    pub fn touched_chunks(&self) -> usize {
        self.chunks.len()
    }

    pub fn finish(self, mut batch: ProjectionBatch) -> Result<ProjectionBatch> {
        ensure!(
            self.snapshot.version == batch.base
                && Arc::ptr_eq(self.snapshot.cell.borrow_owner(), &batch.owner),
            "membership edits and batch use different snapshots"
        );
        for (key, edit) in self.chunks {
            ensure!(Instant::now() < self.deadline, "membership edit deadline");
            if !edit.dirty {
                continue;
            }
            match edit.chunk.encode(&self.budget)? {
                Some(encoded) => batch.put(&key, encoded.as_ref())?,
                None => batch.delete(&key)?,
            }
        }
        Ok(batch)
    }
}

impl ProjectionBatch {
    pub fn new(
        snapshot: &ProjectionSnapshot,
        budget: &Arc<Budget>,
        deadline: Instant,
    ) -> Result<Self> {
        Ok(Self {
            reservation: budget.acquire(
                size_of::<Self>() + snapshot.version.epoch.len() + 128,
                deadline,
            )?,
            batch: WriteBatch::default(),
            base: snapshot.version.clone(),
            owner: snapshot.cell.borrow_owner().clone(),
        })
    }

    pub fn put(&mut self, key: &[u8], value: &[u8]) -> Result<()> {
        validate_key(key)?;
        ensure!(value.len() <= MAX_VALUE_BYTES, "projection value size");
        self.reserve_operation(key.len() + value.len())?;
        self.batch.put(key, value);
        Ok(())
    }

    pub fn delete(&mut self, key: &[u8]) -> Result<()> {
        validate_key(key)?;
        self.reserve_operation(key.len())?;
        self.batch.delete(key);
        Ok(())
    }

    pub fn encoded_bytes(&self) -> usize {
        self.batch.size_in_bytes()
    }

    fn reserve_operation(&mut self, bytes: usize) -> Result<()> {
        let encoded = bytes + 32;
        ensure!(
            self.batch.size_in_bytes() + encoded <= MAX_BATCH_BYTES - 1024,
            "projection batch capacity"
        );
        self.reservation.try_grow(2 * encoded)
    }
}

impl Projection {
    pub fn open(path: impl AsRef<Path>, memory: &StoreMemory) -> Result<Self> {
        let mut options = Options::default();
        memory.configure(&mut options);
        options.create_if_missing(true);
        options.set_wal_recovery_mode(DBRecoveryMode::AbsoluteConsistency);
        options.set_compression_type(rocksdb::DBCompressionType::Lz4);
        options.set_max_total_wal_size(128 << 20);
        options.set_max_background_jobs(2);
        let db = Arc::new(DB::open(&options, path)?);
        let version = match db.get_pinned(STATE_KEY)? {
            Some(bytes) => decode_version(&bytes)?,
            None => {
                ensure!(
                    db.iterator(IteratorMode::Start)
                        .next()
                        .transpose()?
                        .is_none(),
                    "unrecognized projection database"
                );
                let version = ProjectionVersion {
                    format: FORMAT,
                    epoch: id(),
                    generation: 0,
                    next_slot: 0,
                };
                let mut batch = WriteBatch::default();
                batch.put(STATE_KEY, encode_version(&version)?);
                write_synced(&db, batch)?;
                version
            }
        };
        Ok(Self {
            db,
            writer: Mutex::new(WriterState {
                version,
                failed: false,
            }),
        })
    }

    pub fn snapshot(&self) -> Result<ProjectionSnapshot> {
        let writer = self.writer.lock();
        ensure!(!writer.failed, "projection writer requires recovery");
        self.capture(&writer.version)
    }

    pub fn apply(
        &self,
        next_slot: u64,
        mut changes: ProjectionBatch,
    ) -> Result<ProjectionSnapshot> {
        let mut writer = self.writer.lock();
        ensure!(!writer.failed, "projection writer requires recovery");
        ensure!(
            Arc::ptr_eq(&self.db, &changes.owner),
            "foreign projection batch"
        );
        let expected = &changes.base;
        ensure!(&writer.version == expected, "stale projection generation");
        ensure!(
            next_slot >= expected.next_slot && next_slot <= u64::from(u32::MAX) + 1,
            "projection slot allocation range"
        );
        let version = ProjectionVersion {
            generation: expected
                .generation
                .checked_add(1)
                .ok_or_else(|| anyhow::anyhow!("projection generation exhausted"))?,
            next_slot,
            ..expected.clone()
        };
        let encoded = encode_version(&version)?;
        changes.reserve_operation(STATE_KEY.len() + encoded.len())?;
        changes.batch.put(STATE_KEY, encoded);
        writer.failed = true;
        write_synced(&self.db, changes.batch)?;
        let snapshot = self.capture(&version)?;
        writer.version = version;
        writer.failed = false;
        Ok(snapshot)
    }

    fn capture(&self, expected: &ProjectionVersion) -> Result<ProjectionSnapshot> {
        let cell = SnapshotCell::new(self.db.clone(), |db| db.snapshot());
        let version = decode_version(
            &cell
                .borrow_dependent()
                .get_pinned(STATE_KEY)?
                .ok_or_else(|| anyhow::anyhow!("missing projection state"))?,
        )?;
        ensure!(
            &version == expected,
            "projection snapshot generation mismatch"
        );
        Ok(ProjectionSnapshot { cell, version })
    }
}

impl ProjectionSnapshot {
    pub fn version(&self) -> &ProjectionVersion {
        &self.version
    }

    pub fn get(
        &self,
        key: &[u8],
        budget: &Arc<Budget>,
        deadline: Instant,
    ) -> Result<Option<ProjectionValue>> {
        validate_key(key)?;
        let Some(bytes) = self.cell.borrow_dependent().get_pinned(key)? else {
            return Ok(None);
        };
        ensure!(bytes.len() <= MAX_VALUE_BYTES, "projection value size");
        let reservation = budget.acquire(bytes.len() + size_of::<ProjectionValue>(), deadline)?;
        Ok(Some(ProjectionValue {
            bytes: bytes.to_vec(),
            _reservation: reservation,
        }))
    }

    pub fn scan(
        &self,
        prefix: &[u8],
        after: Option<&[u8]>,
        budget: &Arc<Budget>,
        deadline: Instant,
        mut visit: impl FnMut(&[u8], &[u8]) -> Result<bool>,
    ) -> Result<()> {
        validate_key(prefix)?;
        if let Some(after) = after {
            validate_key(after)?;
            ensure!(after.starts_with(prefix), "projection scan cursor prefix");
        }
        let _reservation = budget.acquire(MAX_KEY_BYTES + MAX_VALUE_BYTES, deadline)?;
        let mut options = ReadOptions::default();
        options.fill_cache(false);
        let mut iterator = self.cell.borrow_dependent().raw_iterator_opt(options);
        iterator.seek(after.unwrap_or(prefix));
        if let Some(after) = after
            && iterator.key() == Some(after)
        {
            iterator.next();
        }
        while iterator.valid() {
            ensure!(Instant::now() < deadline, "projection scan deadline");
            let key = iterator
                .key()
                .ok_or_else(|| anyhow::anyhow!("missing iterator key"))?;
            if !key.starts_with(prefix) {
                break;
            }
            let value = iterator
                .value()
                .ok_or_else(|| anyhow::anyhow!("missing iterator value"))?;
            ensure!(
                key.len() <= MAX_KEY_BYTES && value.len() <= MAX_VALUE_BYTES,
                "projection row size"
            );
            if !visit(key, value)? {
                break;
            }
            iterator.next();
        }
        iterator.status()?;
        Ok(())
    }
}

fn validate_key(key: &[u8]) -> Result<()> {
    ensure!(
        !key.is_empty() && key.len() <= MAX_KEY_BYTES,
        "projection key size"
    );
    ensure!(key[0] != b'!', "reserved projection key");
    Ok(())
}

fn write_synced(db: &DB, batch: WriteBatch) -> Result<()> {
    let mut options = WriteOptions::default();
    options.disable_wal(false);
    options.set_sync(true);
    db.write_opt(batch, &options)?;
    Ok(())
}

fn encode_version(version: &ProjectionVersion) -> Result<Vec<u8>> {
    Ok(bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .serialize(version)?)
}

fn decode_version(bytes: &[u8]) -> Result<ProjectionVersion> {
    ensure!(bytes.len() <= 1024, "projection state size");
    let version: ProjectionVersion = bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_limit(1024)
        .reject_trailing_bytes()
        .deserialize(bytes)?;
    ensure!(version.format == FORMAT, "unsupported projection format");
    ensure!(
        version.epoch.len() == 32 && version.epoch.bytes().all(|byte| byte.is_ascii_hexdigit()),
        "invalid projection epoch"
    );
    ensure!(
        version.next_slot <= u64::from(u32::MAX) + 1,
        "projection slot range"
    );
    Ok(version)
}

pub fn slot_key(family: u8, slot: u32) -> [u8; 5] {
    let bytes = slot.to_be_bytes();
    [family, bytes[0], bytes[1], bytes[2], bytes[3]]
}

pub fn text_prefix(family: u8, text: &str) -> Result<Vec<u8>> {
    let bytes = 1 + text.len() + text.bytes().filter(|byte| *byte == 0).count();
    ensure!(bytes + 6 <= MAX_KEY_BYTES, "projection text key size");
    let mut key = Vec::with_capacity(bytes + 6);
    key.push(family);
    for byte in text.bytes() {
        key.push(byte);
        if byte == 0 {
            key.push(255);
        }
    }
    Ok(key)
}

pub fn text_key(family: u8, text: &str) -> Result<Vec<u8>> {
    let mut key = text_prefix(family, text)?;
    key.extend_from_slice(&[0, 0]);
    Ok(key)
}

pub fn membership_key(family: u8, text: &str, block: u32) -> Result<Vec<u8>> {
    ensure!(
        block <= u32::MAX / super::membership::CHUNK_SLOTS,
        "membership block range"
    );
    let mut key = text_key(family, text)?;
    key.extend_from_slice(&block.to_be_bytes());
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn batches_cannot_mix_snapshot_generations_or_database_owners() {
        let directory = tempfile::tempdir().unwrap();
        let memory = StoreMemory::new(8 << 20, 2 << 20).unwrap();
        let projection = Projection::open(directory.path().join("first"), &memory).unwrap();
        let other = Projection::open(directory.path().join("other"), &memory).unwrap();
        let budget = Budget::new(2 << 20, 0);
        let deadline = Instant::now() + Duration::from_secs(5);
        let old = projection.snapshot().unwrap();
        let mut batch = ProjectionBatch::new(&old, &budget, deadline).unwrap();
        batch.put(b"node/0", b"first").unwrap();
        let current = projection.apply(1, batch).unwrap();

        let mut edits = MembershipEditor::new(&old, budget.clone(), deadline, 1).unwrap();
        edits.set(b'n', "file", 0, true).unwrap();
        let current_batch = ProjectionBatch::new(&current, &budget, deadline).unwrap();
        assert!(edits.finish(current_batch).is_err());

        let mut stale = ProjectionBatch::new(&old, &budget, deadline).unwrap();
        stale.put(b"node/0", b"stale").unwrap();
        assert!(projection.apply(1, stale).is_err());
        let other_snapshot = other.snapshot().unwrap();
        let foreign = ProjectionBatch::new(&other_snapshot, &budget, deadline).unwrap();
        let error = projection
            .apply(1, foreign)
            .err()
            .expect("foreign batch accepted");
        assert!(error.to_string().contains("foreign projection batch"));
        assert_eq!(projection.snapshot().unwrap().version(), current.version());
        assert_eq!(
            current
                .get(b"node/0", &budget, deadline)
                .unwrap()
                .unwrap()
                .as_ref(),
            b"first",
        );
        assert_eq!(budget.usage().used_bytes, 0);
    }

    #[test]
    fn membership_edits_coalesce_by_chunk_and_preserve_old_snapshots() {
        let directory = tempfile::tempdir().unwrap();
        let memory = StoreMemory::new(8 << 20, 2 << 20).unwrap();
        let projection = Projection::open(directory.path(), &memory).unwrap();
        let budget = Budget::new(2 << 20, 0);
        let deadline = Instant::now() + Duration::from_secs(5);
        let empty = projection.snapshot().unwrap();
        let mut edits = MembershipEditor::new(&empty, budget.clone(), deadline, 8).unwrap();
        for slot in [3, 4096, u32::MAX] {
            edits.set(b'n', "same.txt", slot, true).unwrap();
        }
        assert_eq!(edits.touched_chunks(), 3);
        let batch = edits
            .finish(ProjectionBatch::new(&empty, &budget, deadline).unwrap())
            .unwrap();
        let first = projection.apply(u64::from(u32::MAX) + 1, batch).unwrap();
        let mut edits = MembershipEditor::new(&first, budget.clone(), deadline, 1).unwrap();
        for slot in [4, 5, 4, 5] {
            edits.set(b'n', "same.txt", slot, true).unwrap();
        }
        assert_eq!(edits.touched_chunks(), 1);
        let batch = edits
            .finish(ProjectionBatch::new(&first, &budget, deadline).unwrap())
            .unwrap();
        assert!(batch.encoded_bytes() < 256);
        let second = projection.apply(first.version().next_slot, batch).unwrap();
        let first_key = membership_key(b'n', "same.txt", 0).unwrap();
        for (snapshot, expected) in [(&first, vec![3]), (&second, vec![3, 4, 5])] {
            let bytes = snapshot
                .get(&first_key, &budget, deadline)
                .unwrap()
                .unwrap();
            let chunk = MembershipChunk::decode(bytes.as_ref(), &budget, deadline).unwrap();
            assert_eq!(chunk.iter().collect::<Vec<_>>(), expected);
        }
        let untouched_key = membership_key(b'n', "same.txt", 1).unwrap();
        assert_eq!(
            first
                .get(&untouched_key, &budget, deadline)
                .unwrap()
                .unwrap()
                .as_ref(),
            second
                .get(&untouched_key, &budget, deadline)
                .unwrap()
                .unwrap()
                .as_ref(),
        );
        let mut edits = MembershipEditor::new(&second, budget.clone(), deadline, 1).unwrap();
        for slot in [3, 4, 5] {
            edits.set(b'n', "same.txt", slot, false).unwrap();
        }
        let batch = edits
            .finish(ProjectionBatch::new(&second, &budget, deadline).unwrap())
            .unwrap();
        let third = projection.apply(second.version().next_slot, batch).unwrap();
        assert!(third.get(&first_key, &budget, deadline).unwrap().is_none());
        assert!(second.get(&first_key, &budget, deadline).unwrap().is_some());
        drop((empty, first, second, third, projection));
        let reopened = Projection::open(directory.path(), &memory).unwrap();
        assert!(
            reopened
                .snapshot()
                .unwrap()
                .get(&first_key, &budget, deadline)
                .unwrap()
                .is_none()
        );
        assert_eq!(budget.usage().used_bytes, 0);
    }

    #[test]
    fn unrecognized_projection_state_is_never_overwritten() {
        let directory = tempfile::tempdir().unwrap();
        let memory = StoreMemory::new(8 << 20, 2 << 20).unwrap();
        {
            let db = DB::open_default(directory.path()).unwrap();
            db.put(b"foreign", b"retained").unwrap();
        }
        assert!(Projection::open(directory.path(), &memory).is_err());
        {
            let db = DB::open_default(directory.path()).unwrap();
            assert_eq!(db.get(b"foreign").unwrap().unwrap(), b"retained");
            let version = ProjectionVersion {
                format: 99,
                epoch: id(),
                generation: 0,
                next_slot: 0,
            };
            db.put(STATE_KEY, encode_version(&version).unwrap())
                .unwrap();
        }
        assert!(Projection::open(directory.path(), &memory).is_err());
    }

    #[test]
    fn owned_snapshots_keep_the_database_and_their_generation_alive() {
        fn send_sync<T: Send + Sync>() {}
        send_sync::<ProjectionSnapshot>();
        let path = tempfile::tempdir().unwrap();
        let memory = StoreMemory::new(8 << 20, 2 << 20).unwrap();
        let budget = Budget::new(1 << 20, 0);
        let projection = Projection::open(path.path(), &memory).unwrap();
        let empty = projection.snapshot().unwrap();
        let mut batch = ProjectionBatch::new(&empty, &budget, Instant::now()).unwrap();
        batch.put(b"node/0", b"first").unwrap();
        let first = projection.apply(1, batch).unwrap();
        let mut batch = ProjectionBatch::new(&first, &budget, Instant::now()).unwrap();
        batch.put(b"node/0", b"second").unwrap();
        let second = projection.apply(1, batch).unwrap();
        assert!(
            empty
                .get(b"node/0", &budget, Instant::now())
                .unwrap()
                .is_none()
        );
        assert_eq!(
            first
                .get(b"node/0", &budget, Instant::now())
                .unwrap()
                .unwrap()
                .as_ref(),
            b"first"
        );
        assert_eq!(
            second
                .get(b"node/0", &budget, Instant::now())
                .unwrap()
                .unwrap()
                .as_ref(),
            b"second"
        );
        let stale = ProjectionBatch::new(&first, &budget, Instant::now()).unwrap();
        assert!(projection.apply(1, stale).is_err());
        drop(projection);
        assert_eq!(
            first
                .get(b"node/0", &budget, Instant::now())
                .unwrap()
                .unwrap()
                .as_ref(),
            b"first"
        );
        let expected = second.version().clone();
        drop((empty, first, second));
        let reopened = Projection::open(path.path(), &memory).unwrap();
        assert_eq!(reopened.snapshot().unwrap().version(), &expected);
        assert_eq!(budget.usage().used_bytes, 0);
    }

    #[test]
    fn ordered_keys_and_seek_cursors_preserve_unicode_and_embedded_zeroes() {
        let names = ["", "a", "a\0", "a\0b", "aa", "é", "日本"];
        let keys: Vec<_> = names
            .iter()
            .map(|name| membership_key(b'n', name, 0).unwrap())
            .collect();
        assert!(keys.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(slot_key(b'r', 255) < slot_key(b'r', 256));
        let directory = tempfile::tempdir().unwrap();
        let projection = Projection::open(
            directory.path(),
            &StoreMemory::new(8 << 20, 2 << 20).unwrap(),
        )
        .unwrap();
        let budget = Budget::new(1 << 20, 0);
        let empty = projection.snapshot().unwrap();
        let mut batch = ProjectionBatch::new(&empty, &budget, Instant::now()).unwrap();
        for key in &keys {
            batch.put(key, b"member").unwrap();
        }
        let snapshot = projection.apply(0, batch).unwrap();
        let mut visited = Vec::new();
        snapshot
            .scan(
                b"n",
                Some(&keys[1]),
                &budget,
                Instant::now() + Duration::from_secs(1),
                |key, _| {
                    visited.push(key.to_vec());
                    Ok(true)
                },
            )
            .unwrap();
        assert_eq!(visited, keys[2..]);
        assert!(
            snapshot
                .scan(b"n", Some(b"other"), &budget, Instant::now(), |_, _| Ok(
                    true
                ))
                .is_err()
        );
        let mut batch = ProjectionBatch::new(&snapshot, &budget, Instant::now()).unwrap();
        assert!(batch.put(STATE_KEY, b"override").is_err());
        assert!(
            batch
                .put(b"oversize", &vec![0; MAX_VALUE_BYTES + 1])
                .is_err()
        );
    }
}
