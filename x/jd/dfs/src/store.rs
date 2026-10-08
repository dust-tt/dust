use crate::model::*;
pub use crate::store_common::{decode_key, key};
pub use rocksdb::WriteBatch;
use rocksdb::{
    BlockBasedOptions, Cache, ColumnFamilyDescriptor, DB, DBRecoveryMode, Options, Snapshot,
    WriteBufferManager, WriteOptions,
};
use serde::{Serialize, de::DeserializeOwned};
use std::path::Path;

pub struct Store {
    pub db: DB,
    pub memory: StoreMemory,
}

#[derive(Clone)]
pub struct StoreMemory {
    cache: Cache,
    write_buffers: WriteBufferManager,
    capacity: usize,
}

#[derive(Clone, Copy, Serialize)]
pub struct StoreMemoryUsage {
    pub capacity_bytes: usize,
    pub cache_bytes: usize,
    pub pinned_bytes: usize,
    pub memtable_bytes: usize,
    pub memtable_capacity_bytes: usize,
}

impl StoreMemory {
    pub fn from_env() -> Result<Self> {
        let bytes = |name: &str, default| match std::env::var(name) {
            Ok(value) => value
                .parse::<usize>()
                .map_err(|_| err(libc::EINVAL, format!("invalid {name}"))),
            Err(std::env::VarError::NotPresent) => Ok(default),
            Err(_) => Err(err(libc::EINVAL, format!("invalid {name}"))),
        };
        Self::new(
            bytes("DFS_ROCKSDB_MEMORY_BYTES", 128 << 20)?,
            bytes("DFS_ROCKSDB_WRITE_BUFFER_BYTES", 64 << 20)?,
        )
    }

    pub fn new(capacity: usize, write_buffer_bytes: usize) -> Result<Self> {
        if capacity == 0 || write_buffer_bytes < (1 << 20) || write_buffer_bytes > capacity {
            return Err(err(libc::EINVAL, "invalid RocksDB memory capacity"));
        }
        let cache = Cache::new_lru_cache(capacity);
        let write_buffers = WriteBufferManager::new_write_buffer_manager_with_cache(
            write_buffer_bytes,
            true,
            cache.clone(),
        );
        Ok(Self {
            cache,
            write_buffers,
            capacity,
        })
    }

    pub fn usage(&self) -> StoreMemoryUsage {
        StoreMemoryUsage {
            capacity_bytes: self.capacity,
            cache_bytes: self.cache.get_usage(),
            pinned_bytes: self.cache.get_pinned_usage(),
            memtable_bytes: self.write_buffers.get_usage(),
            memtable_capacity_bytes: self.write_buffers.get_buffer_size(),
        }
    }

    pub fn configure(&self, options: &mut Options) {
        options.set_write_buffer_manager(&self.write_buffers);
        let budget = self.write_buffers.get_buffer_size();
        options.set_write_buffer_size((budget / 4).clamp(64 << 10, 64 << 20));
        options.set_arena_block_size((budget / 32).clamp(4096, 2 << 20));
        let mut table = BlockBasedOptions::default();
        table.set_block_cache(&self.cache);
        table.set_cache_index_and_filter_blocks(true);
        options.set_block_based_table_factory(&table);
    }
}
impl Store {
    pub fn persist(&self) -> Result<()> {
        self.db.flush_wal(true)?;
        Ok(())
    }
    pub fn property(&self, name: &str) -> u64 {
        ["metadata", "content", "changes"]
            .iter()
            .filter_map(|family| self.db.cf_handle(family))
            .map(|family| {
                self.db
                    .property_int_value_cf(family, name)
                    .ok()
                    .flatten()
                    .unwrap_or(0)
            })
            .sum()
    }

    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::open_with_memory(path, StoreMemory::from_env()?)
    }

    pub fn open_with_memory(path: impl AsRef<Path>, memory: StoreMemory) -> Result<Self> {
        let usage = memory.usage();
        tracing::info!(
            event = "rocksdb_memory_config",
            capacity_bytes = usage.capacity_bytes,
            memtable_capacity_bytes = usage.memtable_capacity_bytes,
        );
        let mut options = Options::default();
        memory.configure(&mut options);
        options.create_if_missing(true);
        options.create_missing_column_families(true);
        options.set_wal_recovery_mode(DBRecoveryMode::PointInTime);
        options.set_max_total_wal_size(128 * 1024 * 1024);
        options.set_max_background_jobs(4);
        let families = ["metadata", "content", "changes"].into_iter().map(|name| {
            let mut opts = Options::default();
            memory.configure(&mut opts);
            opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
            ColumnFamilyDescriptor::new(name, opts)
        });
        Ok(Self {
            db: DB::open_cf_descriptors(&options, path, families)?,
            memory,
        })
    }
    pub fn reader(&self) -> Reader<'_> {
        Reader {
            store: self,
            snapshot: self.db.snapshot(),
        }
    }
    pub fn put<T: Serialize>(
        &self,
        batch: &mut WriteBatch,
        cf: &str,
        key: Vec<u8>,
        value: &T,
    ) -> Result<()> {
        batch.put_cf(
            self.db
                .cf_handle(cf)
                .ok_or_else(|| err(libc::EIO, "missing column family"))?,
            key,
            bincode::serialize(value)?,
        );
        Ok(())
    }
    pub fn delete(&self, batch: &mut WriteBatch, cf: &str, key: Vec<u8>) -> Result<()> {
        batch.delete_cf(
            self.db
                .cf_handle(cf)
                .ok_or_else(|| err(libc::EIO, "missing column family"))?,
            key,
        );
        Ok(())
    }
    pub fn publish(&self, batch: WriteBatch) -> Result<()> {
        let mut options = WriteOptions::default();
        options.disable_wal(false);
        options.set_sync(false);
        self.db.write_opt(batch, &options)?;
        Ok(())
    }
}
pub struct Reader<'a> {
    pub store: &'a Store,
    pub snapshot: Snapshot<'a>,
}
impl Reader<'_> {
    pub fn get<T: DeserializeOwned>(&self, cf: &str, key: Vec<u8>) -> Result<Option<T>> {
        let cf = self
            .store
            .db
            .cf_handle(cf)
            .ok_or_else(|| err(libc::EIO, "missing column family"))?;
        self.snapshot
            .get_cf(cf, key)?
            .map(|bytes| bincode::deserialize(&bytes).map_err(Error::from))
            .transpose()
    }
    pub fn scan<T: DeserializeOwned>(
        &self,
        cf: &str,
        prefix: Vec<u8>,
    ) -> Result<Vec<(Vec<u8>, T)>> {
        let mut values = Vec::new();
        self.scan_each(cf, prefix, |key, value| {
            values.push((key, value));
            Ok(())
        })?;
        Ok(values)
    }
    pub fn scan_each<T: DeserializeOwned>(
        &self,
        cf: &str,
        prefix: Vec<u8>,
        mut visit: impl FnMut(Vec<u8>, T) -> Result<()>,
    ) -> Result<()> {
        let cf = self
            .store
            .db
            .cf_handle(cf)
            .ok_or_else(|| err(libc::EIO, "missing column family"))?;
        for entry in self.snapshot.iterator_cf(
            cf,
            rocksdb::IteratorMode::From(&prefix, rocksdb::Direction::Forward),
        ) {
            let (key, bytes) = entry?;
            if !key.starts_with(&prefix) {
                break;
            }
            visit(key.to_vec(), bincode::deserialize(&bytes)?)?;
        }
        Ok(())
    }
}

impl From<rocksdb::Error> for Error {
    fn from(value: rocksdb::Error) -> Self {
        err(libc::EIO, value.to_string())
    }
}
