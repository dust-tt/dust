use anyhow::Result;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::{NoTls, Row, ToStatement};

pub async fn test() -> Result<()> {
    println!("FOO");
    Ok(())
}

#[derive(Clone)]
pub struct PostgresStore {
    pool: Pool<PostgresConnectionManager<NoTls>>,
}

impl PostgresStore {
    pub async fn new() -> Result<Self> {
        let manager = PostgresConnectionManager::new_from_stringlike(
            "postgres://dev:dev@localhost:5432/dust_api",
            NoTls,
        )?;
        let pool = Pool::builder().max_size(16).build(manager).await?;
        Ok(PostgresStore { pool })
    }

    pub async fn init(&self) -> Result<()> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let tables = vec![
            "-- projects
                 CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY
                );",
            // "-- app specifications
            //  CREATE TABLE IF NOT EXISTS specifications (
            //     id                   INTEGER PRIMARY KEY,
            //     project              INTEGER NOT NULL,
            //     created              INTEGER NOT NULL,
            //     hash                 TEXT NOT NULL,
            //     specification        TEXT NOT NULL,
            //     FOREIGN KEY(project) REFERENCES projects(id)
            //  );",
            // "-- datasets
            //  CREATE TABLE IF NOT EXISTS datasets (
            //     id                   INTEGER PRIMARY KEY,
            //     project              INTEGER NOT NULL,
            //     created              INTEGER NOT NULL,
            //     dataset_id           TEXT NOT NULL,
            //     hash                 TEXT NOT NULL,
            //     FOREIGN KEY(project) REFERENCES projects(id)
            //  );",
            // "-- datasets raw hashed data points
            //  CREATE TABLE IF NOT EXISTS datasets_points (
            //     id   INTEGER PRIMARY KEY,
            //     hash TEXT NOT NULL,
            //     json TEXT NOT NULL
            //  );",
            // "-- datasets to data association (avoid duplication)
            //  CREATE TABLE IF NOT EXISTS datasets_joins (
            //     id                   INTEGER PRIMARY KEY,
            //     dataset              INTEGER NOT NULL,
            //     point                INTEGER NOT NULL,
            //     point_idx            INTEGER NOT NULL,
            //     FOREIGN KEY(dataset) REFERENCES datasets(id),
            //     FOREIGN KEY(point)   REFERENCES datasets_points(id)
            //  );",
            // "-- runs
            //  CREATE TABLE IF NOT EXISTS runs (
            //     id                   INTEGER PRIMARY KEY,
            //     project              INTEGER NOT NULL,
            //     created              INTEGER NOT NULL,
            //     run_id               TEXT NOT NULL,
            //     app_hash             TEXT NOT NULL,
            //     config_json          TEXT NOT NULL,
            //     status_json          TEXT NOT NULL,
            //     FOREIGN KEY(project) REFERENCES projects(id)
            //  );",
            // "-- block executions
            //  CREATE TABLE IF NOT EXISTS block_executions (
            //     id        INTEGER PRIMARY KEY,
            //     hash      TEXT NOT NULL,
            //     execution TEXT NOT NULL
            //  );",
            // "-- runs to block_executions association (avoid duplication)
            //  CREATE TABLE IF NOT EXISTS runs_joins (
            //     id                           INTEGER PRIMARY KEY,
            //     run                          INTEGER NOT NULL,
            //     block_idx                    INTEGER NOT NULL,
            //     block_type                   TEXT NOT NULL,
            //     block_name                   TEXT NOT NULL,
            //     input_idx                    INTEGER NOT NULL,
            //     map_idx                      INTEGER NOT NULL,
            //     block_execution              INTEGER NOT NULL,
            //     FOREIGN KEY(run)             REFERENCES runs(id),
            //     FOREIGN KEY(block_execution) REFERENCES block_executions(id)
            //  );",
            // "-- LLM Cache (non unique hash index)
            //  CREATE TABLE IF NOT EXISTS llm_cache (
            //     id                   INTEGER PRIMARY KEY,
            //     project              INTEGER NOT NULL,
            //     created              INTEGER NOT NULL,
            //     hash                 TEXT NOT NULL,
            //     request              TEXT NOT NULL,
            //     generation           TEXT NOT NULL,
            //     FOREIGN KEY(project) REFERENCES projects(id)
            //  );",
        ];
        for t in tables {
            match c.execute(t, &[]).await {
                Err(e) => Err(e)?,
                Ok(_) => {}
            }
        }

        // let indices = vec![
        //     "CREATE INDEX IF NOT EXISTS
        //        idx_specifications_project_created ON specifications (project, created);",
        //     "CREATE INDEX IF NOT EXISTS
        //        idx_datasets_project_dataset_id_created
        //        ON datasets (project, dataset_id, created);",
        //     "CREATE INDEX IF NOT EXISTS
        //        idx_runs_project_created ON runs (project, created);",
        //     "CREATE UNIQUE INDEX IF NOT EXISTS
        //        idx_runs_id ON runs (run_id);",
        //     "CREATE UNIQUE INDEX IF NOT EXISTS
        //        idx_block_executions_hash ON block_executions (hash);",
        //     "CREATE UNIQUE INDEX IF NOT EXISTS
        //        idx_datasets_points_hash ON datasets_points (hash);",
        //     "CREATE INDEX IF NOT EXISTS
        //        idx_datasets_joins ON datasets_joins (dataset, point);",
        //     "CREATE INDEX IF NOT EXISTS
        //        idx_runs_joins ON runs_joins (run, block_execution);",
        //     "CREATE UNIQUE INDEX IF NOT EXISTS
        //        idx_llm_cache_hash ON llm_cache (hash);",
        //     "CREATE INDEX IF NOT EXISTS
        //        idx_llm_cache_project_hash ON llm_cache (project, hash);",
        // ];
        // for i in indices {
        //     match c.execute(i, ()).await {
        //         Err(e) => Err(e)?,
        //         Ok(_) => {}
        //     }
        // }

        Ok(())
    }
}
