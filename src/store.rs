use crate::dataset::Dataset;
use crate::run::{Run, RunConfig};
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

#[async_trait]
pub trait Store {
    async fn latest_dataset_hash(&self, dataset_id: &str) -> Result<Option<String>>;
    async fn register_dataset(&self, d: &Dataset) -> Result<()>;
    async fn load_dataset(&self, dataset_id: &str, hash: &str) -> Result<Option<Dataset>>;

    async fn latest_specification_hash(&self) -> Result<Option<String>>;
    async fn register_specification(&self, hash: &str, spec: &str) -> Result<()>;

    async fn latest_run_id(&self) -> Result<Option<String>>;
    /// Returns (run_id, created, app_hash, run_config)
    async fn all_runs(&self) -> Result<Vec<(String, u64, String, RunConfig)>>;
    async fn store_run(&self, run: &Run) -> Result<()>;
    async fn load_run(&self, run_id: &str) -> Result<Run>;
}

pub struct SQLiteStore {
    conn: Arc<Mutex<Connection>>,
}

impl SQLiteStore {
    pub async fn init(&self) -> Result<()> {
        let c = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let c = c.lock();
            let tables = vec![
                "-- app specifications
                 CREATE TABLE IF NOT EXISTS specifications (
                    id            INTEGER PRIMARY KEY,
                    created       INTEGER NOT NULL,
                    hash          TEXT NOT NULL,
                    specification TEXT NOT NULL
                 );",
                "-- datasets
                 CREATE TABLE IF NOT EXISTS datasets (
                    id         INTEGER PRIMARY KEY,
                    created    INTEGER NOT NULL,
                    dataset_id TEXT NOT NULL,
                    hash       TEXT NOT NULL
                 );",
                "-- datasets raw hashed data points
                 CREATE TABLE IF NOT EXISTS datasets_points (
                    id   INTEGER PRIMARY KEY,
                    hash TEXT NOT NULL,
                    json TEXT NOT NULL
                 );",
                "-- datasets to data association (avoid duplication)
                 CREATE TABLE IF NOT EXISTS datasets_joins (
                    id                   INTEGER PRIMARY KEY,
                    dataset              INTEGER NOT NULL,
                    point                INTEGER NOT NULL,
                    index                INTEGER NOT NULL,
                    FOREIGN KEY(dataset) REFERENCES datasets(id),
                    FOREIGN KEY(point)   REFERENCES datasets_points(id)
                 );",
                "-- runs
                 CREATE TABLE IF NOT EXISTS runs (
                    id          INTEGER PRIMARY KEY,
                    created     INTEGER NOT NULL,
                    run_id      TEXT NOT NULL,
                    app_hash    TEXT NOT NULL,
                    config_json TEXT NOT NULL
                 );",
                "-- block executions
                 CREATE TABLE IF NOT EXISTS block_executions (
                    id        INTEGER PRIMARY KEY,
                    hash      TEXT NOT NULL,
                    execution TEXT NOT NULL,
                 );",
                "-- runs to block_executions association (avoid duplicaiton)
                 CREATE TABLE IF NOT EXISTS runs_joins (
                    id                           INTEGER PRIMARY KEY,
                    run                          INTEGER NOT NULL,
                    block                        TEXT NOT NULL,
                    input_idx                    INTEGER NOT NULL,
                    map_idx                      INTEGER NOT NULL,
                    block_execution              INTEGER NOT NULL,
                    FOREIGN KEY(run)             REFERENCES runs(id),
                    FOREIGN KEY(block_execution) REFERENCES block_executions(id)
                 );",
            ];
            for t in tables {
                match c.execute(t, ()) {
                    Err(e) => Err(e)?,
                    Ok(_) => {}
                }
            }

            let indices = vec![
                "CREATE INDEX IF NOT EXISTS
                 idx_specifications_created ON specifications (created);",
                "CREATE INDEX IF NOT EXISTS
                 idx_datasets_dataset_id_created ON datasets (dataset_id, created);",
                "CREATE INDEX IF NOT EXISTS
                 idx_runs_created ON runs (created);",
                "CREATE UNIQUE INDEX IF NOT EXISTS
                 idx_runs_id ON runs (run_id);",
                "CREATE UNIQUE INDEX IF NOT EXISTS
                 idx_block_executions_hash ON block_executions (hash);",
                "CREATE UNIQUE INDEX IF NOT EXISTS
                 idx_datasets_points_hash ON datasets_points (hash);",
                "CREATE INDEX IF NOT EXISTS
                 idx_datasets_joins ON datasets_joins (dataset, point);",
                "CREATE INDEX IF NOT EXISTS
                 idx_runs_joins ON runs_joins (run, block_execution);",
            ];
            for i in indices {
                match c.execute(i, ()) {
                    Err(e) => Err(e)?,
                    Ok(_) => {}
                }
            }

            Ok(())
        })
        .await?
    }

    pub fn new_in_memory() -> Result<Self> {
        Ok(SQLiteStore {
            conn: Arc::new(Mutex::new(Connection::open_in_memory()?)),
        })
    }

    pub fn new<P: AsRef<Path>>(sqlite_path: P) -> Result<Self> {
        Ok(SQLiteStore {
            conn: Arc::new(Mutex::new(Connection::open(sqlite_path)?)),
        })
    }
}

#[async_trait]
impl Store for SQLiteStore {
    async fn latest_dataset_hash(&self, dataset_id: &str) -> Result<Option<String>> {
        let dataset_id = dataset_id.to_string();

        let c = self.conn.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let c = c.lock();
            match c.query_row(
                "SELECT hash FROM datasets WHERE dataset_id = ?1 ORDER BY created DESC LIMIT 1",
                params![dataset_id],
                |row| row.get(0),
            ) {
                Err(e) => match e {
                    rusqlite::Error::QueryReturnedNoRows => Ok(None),
                    _ => Err(e)?,
                },
                Ok(hash) => Ok(Some(hash)),
            }
        })
        .await?
    }

    async fn register_dataset(&self, d: &Dataset) -> Result<()> {
        let dataset_created = d.created();
        let dataset_id = d.dataset_id().to_string();
        let dataset_hash = d.hash().to_string();
        // TODO(spolu): kind of ugly but we have to clone here.
        let data = d.iter().map(|v| v.clone()).collect::<Vec<_>>();

        let c = self.conn.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = c.lock();
            // Start by inserting values if we don't already have them.
            let mut stmt = c.prepare_cached(
                "INSERT OR REPLACE INTO datasets_points (hash, json) VALUES (?, ?)",
            )?;
            let points_row_ids = data
                .iter()
                .map(|v| {
                    let mut hasher = blake3::Hasher::new();
                    hasher.update(serde_json::to_string(&v)?.as_bytes());
                    let hash = format!("{}", hasher.finalize().to_hex());
                    let row_id = stmt.insert(params![hash, v])?;
                    Ok(row_id)
                })
                .collect::<Result<Vec<_>>>()?;

            // Create dataset.
            let mut stmt = c.prepare_cached(
                "INSERT INTO datasets (created, dataset_id, hash) VALUES (?, ?, ?)",
            )?;
            let row_id = stmt.insert(params![dataset_created, dataset_id, dataset_hash])?;

            // Finally fill in the join values.
            let mut stmt = c.prepare_cached(
                "INSERT INTO datasets_joins (dataset, point, index) VALUES (?, ?, ?)",
            )?;
            points_row_ids
                .iter()
                .enumerate()
                .map(|(idx, pt_row_id)| {
                    stmt.execute(params![row_id, pt_row_id, idx])?;
                    Ok(())
                })
                .collect::<Result<_>>()?;

            Ok(())
        })
        .await?
    }

    async fn load_dataset(&self, dataset_id: &str, hash: &str) -> Result<Option<Dataset>> {
        let dataset_id = dataset_id.to_string();
        let hash = hash.to_string();

        let c = self.conn.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<Dataset>> {
            let c = c.lock();
            // Check that the dataset_id and hash exist
            let d: Option<(u64, u64)> = match c.query_row(
                "SELECT id, created FROM datasets WHERE dataset_id = ?1 AND hash = ?2",
                params![dataset_id, hash],
                |row| Ok((row.get(0).unwrap(), row.get(1).unwrap())),
            ) {
                Err(e) => match e {
                    rusqlite::Error::QueryReturnedNoRows => None,
                    _ => Err(e)?,
                },
                Ok((created, row_id)) => Some((created, row_id)),
            };
            if d.is_none() {
                return Ok(None);
            }
            let (created, row_id) = d.unwrap();

            // Retrieve data points through datasets_joins
            let mut stmt = c.prepare_cached(
                "SELECT datasets_joins.index, datasets_points.json \
                   FROM datasets_points \
                   INNER JOIN datasets_joins \
                   ON datasets_points.id = datasets_joins.point \
                   WHERE datasets_joins.dataset = ?",
            )?;
            let mut rows = stmt.query([row_id])?;
            let mut data: Vec<(usize, Value)> = vec![];
            while let Some(row) = rows.next()? {
                let index: usize = row.get(0)?;
                let value: Value = row.get(1)?;
                data.push((index, value));
            }
            data.sort_by(|a, b| a.0.cmp(&b.0));

            Ok(Some(Dataset::new_from_store(
                created,
                &dataset_id,
                &hash,
                data.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
            )?))
        })
        .await?
    }

    async fn latest_specification_hash(&self) -> Result<Option<String>> {
        let c = self.conn.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let c = c.lock();
            match c.query_row(
                "SELECT hash FROM specifications ORDER BY created DESC LIMIT 1",
                [],
                |row| row.get(0),
            ) {
                Err(e) => match e {
                    rusqlite::Error::QueryReturnedNoRows => Ok(None),
                    _ => Err(e)?,
                },
                Ok(hash) => Ok(Some(hash)),
            }
        })
        .await?
    }

    async fn register_specification(&self, hash: &str, spec: &str) -> Result<()> {
        let latest = self.latest_specification_hash().await?;
        if latest.is_some() && latest.unwrap() == hash {
            return Ok(());
        }

        let hash = hash.to_string();
        let spec = spec.to_string();

        let c = self.conn.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = c.lock();
            let created = utils::now();
            // Insert new specification.
            let mut stmt = c.prepare_cached(
                "INSERT INTO specifications (created, hash, specification) VALUES (?, ?, ?)",
            )?;
            let row_id = stmt.insert(params![created, hash, spec])?;
            Ok(())
        })
        .await?
    }

    async fn latest_run_id(&self) -> Result<Option<String>> {
        let c = self.conn.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let c = c.lock();
            match c.query_row(
                "SELECT run_id FROM runs ORDER BY created DESC LIMIT 1",
                [],
                |row| row.get(0),
            ) {
                Err(e) => match e {
                    rusqlite::Error::QueryReturnedNoRows => Ok(None),
                    _ => Err(e)?,
                },
                Ok(run_id) => Ok(Some(run_id)),
            }
        })
        .await?
    }

    async fn all_runs(&self) -> Result<Vec<(String, u64, String, RunConfig)>> {
        // Returns (run_id, created, app_hash, run_config)
        unimplemented!()
    }
    async fn store_run(&self, run: &Run) -> Result<()> {
        unimplemented!()
    }
    async fn load_run(&self, run_id: &str) -> Result<Run> {
        unimplemented!()
    }
}

mod tests {
    use super::*;

    #[tokio::test]
    async fn sqlite_store_latest_dataset_hash() -> Result<()> {
        let store = SQLiteStore::new_in_memory()?;
        let r = store.latest_dataset_hash("foo").await?;
        assert!(r.is_none());
        Ok(())
    }

    #[tokio::test]
    async fn sqlite_store_latest_specification_hash() -> Result<()> {
        let store = SQLiteStore::new_in_memory()?;
        let r = store.latest_specification_hash().await?;
        assert!(r.is_none());
        Ok(())
    }

    #[tokio::test]
    async fn sqlite_store_latest_run_id() -> Result<()> {
        let store = SQLiteStore::new_in_memory()?;
        let r = store.latest_run_id().await?;
        assert!(r.is_none());
        Ok(())
    }
}
