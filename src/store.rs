use crate::dataset::Dataset;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Arc;

#[async_trait]
pub trait Store {
    async fn register_dataset(&self, d: &Dataset) -> Result<()>;
    async fn latest_dataset_hash(&self, dataset_id: &str) -> Result<String>;
    async fn load_dataset(&self, dataset_id: &str, hash: &str) -> Result<Dataset>;

    async fn latest_specification_hash(&self) -> Result<String>;
    async fn specification_exists(&self, hash: &str) -> Result<bool>;
    async fn update_latest_specification(&self, hash: &str) -> Result<()>;
    async fn register_specification(&self, hash: &str, spec: &str) -> Result<()>;

    async fn latest_run(&self) -> Result<String>;
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
                "-- datasets: { $dataset_id : { $latest } }
                 -- specifications: { $latest }
                 -- runs: { $latest }
                 CREATE TABLE IF NOT EXISTS globals (
                    id   INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    json BLOB NOT NULL
                 );",
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
                    json BLOB NOT NULL
                 );",
                "-- datasets to data association (avoid duplication)
                 CREATE TABLE IF NOT EXISTS datasets_joins (
                    id                   INTEGER PRIMARY KEY,
                    dataset              INTEGER NOT NULL,
                    point                INTEGER NOT NULL,
                    FOREIGN KEY(dataset) REFERENCES datasets(id),
                    FOREIGN KEY(point)   REFERENCES datasets_points(id)
                 );",
                "-- runs
                 CREATE TABLE IF NOT EXISTS runs (
                    id          INTEGER PRIMARY KEY,
                    created     INTEGER NOT NULL,
                    run_id      TEXT NOT NULL,
                    config_json BLOB NOT NULL
                 );",
                "-- block executions
                 CREATE TABLE IF NOT EXISTS block_executions (
                    id    INTEGER PRIMARY KEY,
                    hash  TEXT NOT NULL,
                    error TEXT,
                    value BLOB
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
                    Err(e) => Err(anyhow!("SQLite error: {}", e))?,
                    Ok(_) => {}
                }
            }

            let indices = vec![
                "CREATE UNIQUE INDEX IF NOT EXISTS
                 idx_specifications_hash ON specifications (hash);",
                "CREATE UNIQUE INDEX IF NOT EXISTS
                 idx_datasets_hash ON datasets (hash);",
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
                    Err(e) => Err(anyhow!("SQLite error: {}", e))?,
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
