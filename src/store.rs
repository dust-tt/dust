use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use rusqlite::Connection;
use std::sync::Arc;

pub struct SQLiteStore {
    conn: Arc<Mutex<Connection>>,
}

impl SQLiteStore {
    pub async fn init(&self) -> Result<()> {
        let c = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let c = c.lock();
            let tables = vec![
                "-- datasets: { latest }
                 -- versions: { latest }
                 -- runs: { latest }
                 CREATE TABLE IF NOT EXISTS globals (
                    id   INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    json BLOB NOT NULL
                 );",
                "-- app spec versions
                 CREATE TABLE IF NOT EXISTS versions (
                    id   INTEGER PRIMARY KEY,
                    hash TEXT NOT NULL,
                    spec TEXT NOT NULL
                 );",
                "-- raw datapoints per hash
                 CREATE TABLE IF NOT EXISTS datasets_data (
                    id   INTEGER PRIMARY KEY,
                    hash TEXT NOT NULL,
                    json BLOB NOT NULL
                 );",
                "-- datasets
                 CREATE TABLE IF NOT EXISTS datasets (
                    id   INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    hash TEXT NOT NULL
                 );",
                "-- datasets raw hashed data
                 CREATE TABLE IF NOT EXISTS datasets_data (
                    id   INTEGER PRIMARY KEY,
                    hash TEXT NOT NULL,
                    json BLOB NOT NULL
                 );",
                "-- datasets to data association (avoid duplication)
                 CREATE TABLE IF NOT EXISTS datasets_join (
                    id                   INTEGER PRIMARY KEY,
                    dataset              INTEGER NOT NULL,
                    data                 INTEGER NOT NULL,
                    FOREIGN KEY(dataset) REFERENCES datasets(id),
                    FOREIGN KEY(data)    REFERENCES datasets_data(id)
                 );",
                "-- runs
                 CREATE TABLE IF NOT EXISTS runs (
                    id          INTEGER PRIMARY KEY,
                    hash        TEXT NOT NULL,
                    config_json BLOB NOT NULL
                 );",
                "-- runs block executions
                 CREATE TABLE IF NOT EXISTS runs_block_executions (
                    id    INTEGER PRIMARY KEY,
                    hash  TEXT NOT NULL,
                    error TEXT,
                    value BLOB
                 );",
                "-- runs to block_executions association (avoid duplicaiton)
                 CREATE TABLE IF NOT EXISTS runs_join (
                    id                           INTEGER PRIMARY KEY,
                    block                        TEXT NOT NULL,
                    run                          INTEGER NOT NULL,
                    input_idx                    INTEGER NOT NULL,
                    map_idx                      INTEGER NOT NULL,
                    block_execution              INTEGER NOT NULL,
                    FOREIGN KEY(run)             REFERENCES runs(id),
                    FOREIGN KEY(block_execution) REFERENCES runs_block_executions(id)
                 );",
            ];
            for t in tables {
                match c.execute(t, ()) {
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
            // conn: Arc::new(Mutex::new(Connection::open("./foo.sqlite")?)),
            conn: Arc::new(Mutex::new(Connection::open_in_memory()?)),
        })
    }
}
