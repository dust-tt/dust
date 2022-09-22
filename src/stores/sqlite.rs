use crate::blocks::block::BlockType;
use crate::dataset::Dataset;
use crate::project::Project;
use crate::providers::llm::{LLMGeneration, LLMRequest};
use crate::run::{BlockExecution, Run, RunConfig};
use crate::stores::store::Store;
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;

#[derive(Clone)]
pub struct SQLiteStore {
    pool: Pool<SqliteConnectionManager>,
}

impl SQLiteStore {
    pub fn new_in_memory() -> Result<Self> {
        let manager = SqliteConnectionManager::memory();
        let pool = r2d2::Pool::new(manager)?;
        Ok(SQLiteStore { pool })
    }

    pub fn new<P: AsRef<Path>>(sqlite_path: P) -> Result<Self> {
        let manager = SqliteConnectionManager::file(sqlite_path);
        let pool = r2d2::Pool::new(manager)?;
        Ok(SQLiteStore { pool })
    }

    pub async fn init(&self) -> Result<()> {
        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || {
            let c = pool.get()?;
            let tables = vec![
                "-- projects
                 CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY
                );",
                "-- app specifications
                 CREATE TABLE IF NOT EXISTS specifications (
                    id                   INTEGER PRIMARY KEY,
                    project              INTEGER NOT NULL,
                    created              INTEGER NOT NULL,
                    hash                 TEXT NOT NULL,
                    specification        TEXT NOT NULL,
                    FOREIGN KEY(project) REFERENCES projects(id)
                 );",
                "-- datasets
                 CREATE TABLE IF NOT EXISTS datasets (
                    id                   INTEGER PRIMARY KEY,
                    project              INTEGER NOT NULL,
                    created              INTEGER NOT NULL,
                    dataset_id           TEXT NOT NULL,
                    hash                 TEXT NOT NULL,
                    FOREIGN KEY(project) REFERENCES projects(id)
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
                    point_idx            INTEGER NOT NULL,
                    FOREIGN KEY(dataset) REFERENCES datasets(id),
                    FOREIGN KEY(point)   REFERENCES datasets_points(id)
                 );",
                "-- runs
                 CREATE TABLE IF NOT EXISTS runs (
                    id                   INTEGER PRIMARY KEY,
                    project              INTEGER NOT NULL,
                    created              INTEGER NOT NULL,
                    run_id               TEXT NOT NULL,
                    app_hash             TEXT NOT NULL,
                    config_json          TEXT NOT NULL,
                    FOREIGN KEY(project) REFERENCES projects(id)
                 );",
                "-- block executions
                 CREATE TABLE IF NOT EXISTS block_executions (
                    id        INTEGER PRIMARY KEY,
                    hash      TEXT NOT NULL,
                    execution TEXT NOT NULL
                 );",
                "-- runs to block_executions association (avoid duplication)
                 CREATE TABLE IF NOT EXISTS runs_joins (
                    id                           INTEGER PRIMARY KEY,
                    run                          INTEGER NOT NULL,
                    block_idx                    INTEGER NOT NULL,
                    block_type                   TEXT NOT NULL,
                    block_name                   TEXT NOT NULL,
                    input_idx                    INTEGER NOT NULL,
                    map_idx                      INTEGER NOT NULL,
                    block_execution              INTEGER NOT NULL,
                    FOREIGN KEY(run)             REFERENCES runs(id),
                    FOREIGN KEY(block_execution) REFERENCES block_executions(id)
                 );",
                "-- LLM Cache (non unique hash index)
                 CREATE TABLE IF NOT EXISTS llm_cache (
                    id                   INTEGER PRIMARY KEY,
                    project              INTEGER NOT NULL,
                    created              INTEGER NOT NULL,
                    hash                 TEXT NOT NULL,
                    request              TEXT NOT NULL,
                    generation           TEXT NOT NULL,
                    FOREIGN KEY(project) REFERENCES projects(id)
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
                   idx_specifications_project_created ON specifications (project, created);",
                "CREATE INDEX IF NOT EXISTS
                   idx_datasets_project_dataset_id_created
                   ON datasets (project, dataset_id, created);",
                "CREATE INDEX IF NOT EXISTS
                   idx_runs_project_created ON runs (project, created);",
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
                "CREATE UNIQUE INDEX IF NOT EXISTS
                   idx_llm_cache_hash ON llm_cache (hash);",
                "CREATE INDEX IF NOT EXISTS
                   idx_llm_cache_project_hash ON llm_cache (project, hash);",
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
}

#[async_trait]
impl Store for SQLiteStore {
    async fn create_project(&self) -> Result<Project> {
        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Project> {
            let c = pool.get()?;
            // Create dataset.
            let mut stmt = c.prepare_cached("INSERT INTO projects DEFAULT VALUES")?;
            let row_id = stmt.insert(params![])?;
            Ok(Project::new_from_id(row_id))
        })
        .await?
    }

    async fn latest_dataset_hash(
        &self,
        project: &Project,
        dataset_id: &str,
    ) -> Result<Option<String>> {
        let project_id = project.project_id();
        let dataset_id = dataset_id.to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let c = pool.get()?;
            match c.query_row(
                "SELECT hash FROM datasets
                   WHERE project = ?1 AND dataset_id = ?2 ORDER BY created DESC LIMIT 1",
                params![project_id, dataset_id],
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

    async fn register_dataset(&self, project: &Project, d: &Dataset) -> Result<()> {
        let project_id = project.project_id();
        let dataset_created = d.created();
        let dataset_id = d.dataset_id().to_string();
        let dataset_hash = d.hash().to_string();
        // TODO(spolu): kind of ugly but we have to clone here.
        let data = d.iter().map(|v| v.clone()).collect::<Vec<_>>();

        let pool = self.pool.clone();
        let pt_row_ids = tokio::task::spawn_blocking(move || -> Result<Vec<i64>> {
            let mut c = pool.get()?;
            let tx = c.transaction()?;
            // Start by inserting values if we don't already have them.
            let pt_row_ids = {
                let mut stmt =
                    tx.prepare_cached("INSERT INTO datasets_points (hash, json) VALUES (?, ?)")?;
                data.iter()
                    .map(|v| {
                        let mut hasher = blake3::Hasher::new();
                        hasher.update(serde_json::to_string(&v)?.as_bytes());
                        let hash = format!("{}", hasher.finalize().to_hex());
                        let row_id: Option<i64> = match tx.query_row(
                            "SELECT id FROM datasets_points WHERE hash = ?1",
                            params![hash],
                            |row| Ok(row.get(0).unwrap()),
                        ) {
                            Err(e) => match e {
                                rusqlite::Error::QueryReturnedNoRows => None,
                                _ => Err(e)?,
                            },
                            Ok(row_id) => Some(row_id),
                        };
                        match row_id {
                            Some(row_id) => Ok(row_id),
                            None => {
                                let value_json = serde_json::to_string(v)?;
                                let row_id = stmt.insert(params![hash, value_json])?;
                                Ok(row_id)
                            }
                        }
                    })
                    .collect::<Result<Vec<_>>>()?
            };
            tx.commit()?;
            Ok(pt_row_ids)
        })
        .await??;

        let pool = self.pool.clone();
        let row_id = tokio::task::spawn_blocking(move || -> Result<i64> {
            let c = pool.get()?;
            // Create dataset.
            let mut stmt = c.prepare_cached(
                "INSERT INTO datasets (project, created, dataset_id, hash) VALUES (?, ?, ?, ?)",
            )?;
            let row_id = stmt.insert(params![
                project_id,
                dataset_created,
                dataset_id,
                dataset_hash
            ])?;
            Ok(row_id)
        })
        .await??;

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut c = pool.get()?;
            // Finally fill in the join values.
            let tx = c.transaction()?;
            {
                let mut stmt = tx.prepare_cached(
                    "INSERT INTO datasets_joins (dataset, point, point_idx) VALUES (?, ?, ?)",
                )?;
                pt_row_ids
                    .iter()
                    .enumerate()
                    .map(|(idx, pt_row_id)| {
                        stmt.execute(params![row_id, pt_row_id, idx])?;
                        Ok(())
                    })
                    .collect::<Result<_>>()?;
            }
            tx.commit()?;
            Ok(())
        })
        .await?
    }

    async fn load_dataset(
        &self,
        project: &Project,
        dataset_id: &str,
        hash: &str,
    ) -> Result<Option<Dataset>> {
        let project_id = project.project_id();
        let dataset_id = dataset_id.to_string();
        let hash = hash.to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<Dataset>> {
            let c = pool.get()?;
            // Check that the dataset_id and hash exist
            let d: Option<(u64, u64)> = match c.query_row(
                "SELECT id, created FROM datasets
                   WHERE project = ?1 AND dataset_id = ?2 AND hash = ?3",
                params![project_id, dataset_id, hash],
                |row| Ok((row.get(0).unwrap(), row.get(1).unwrap())),
            ) {
                Err(e) => match e {
                    rusqlite::Error::QueryReturnedNoRows => None,
                    _ => Err(e)?,
                },
                Ok((row_id, created)) => Some((row_id, created)),
            };
            if d.is_none() {
                return Ok(None);
            }
            let (row_id, created) = d.unwrap();

            // Retrieve data points through datasets_joins
            let mut stmt = c.prepare_cached(
                "SELECT datasets_joins.point_idx, datasets_points.json \
                   FROM datasets_points \
                   INNER JOIN datasets_joins \
                   ON datasets_points.id = datasets_joins.point \
                   WHERE datasets_joins.dataset = ?",
            )?;
            let mut rows = stmt.query([row_id])?;
            let mut data: Vec<(usize, Value)> = vec![];
            while let Some(row) = rows.next()? {
                let index: usize = row.get(0)?;
                let value_data: String = row.get(1)?;
                let value: Value = serde_json::from_str(&value_data)?;
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

    async fn list_datasets(
        &self,
        project: &Project,
    ) -> Result<HashMap<String, Vec<(String, u64)>>> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<HashMap<String, Vec<(String, u64)>>> {
            let c = pool.get()?;
            let mut stmt = c.prepare_cached(
                "SELECT dataset_id, hash, created FROM datasets WHERE project = ?1
                   ORDER BY created DESC",
            )?;
            let mut rows = stmt.query(params![project_id])?;
            let mut datasets: HashMap<String, Vec<(String, u64)>> = HashMap::new();
            while let Some(row) = rows.next()? {
                let dataset_id: String = row.get(0)?;
                let hash: String = row.get(1)?;
                let created: u64 = row.get(2)?;
                datasets
                    .entry(dataset_id)
                    .or_default()
                    .push((hash, created));
            }
            Ok(datasets)
        })
        .await?
    }

    async fn latest_specification_hash(&self, project: &Project) -> Result<Option<String>> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let c = pool.get()?;
            match c.query_row(
                "SELECT hash FROM specifications WHERE project = ?1 ORDER BY created DESC LIMIT 1",
                params![project_id],
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

    async fn register_specification(
        &self,
        project: &Project,
        hash: &str,
        spec: &str,
    ) -> Result<()> {
        let latest = self.latest_specification_hash(project).await?;
        if latest.is_some() && latest.unwrap() == hash {
            return Ok(());
        }

        let project_id = project.project_id();
        let hash = hash.to_string();
        let spec = spec.to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = pool.get()?;
            let created = utils::now();
            // Insert new specification.
            let mut stmt = c.prepare_cached(
                "INSERT INTO specifications (project, created, hash, specification)
                   VALUES (?, ?, ?, ?)",
            )?;
            stmt.insert(params![project_id, created, hash, spec])?;
            Ok(())
        })
        .await?
    }

    async fn latest_run_id(&self, project: &Project) -> Result<Option<String>> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let c = pool.get()?;
            match c.query_row(
                "SELECT run_id FROM runs WHERE project = ?1 ORDER BY created DESC LIMIT 1",
                params![project_id],
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

    async fn all_runs(&self, project: &Project) -> Result<Vec<(String, u64, String, RunConfig)>> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<(String, u64, String, RunConfig)>> {
            let c = pool.get()?;
            // Retrieve runs.
            let mut stmt = c.prepare_cached(
                "SELECT run_id, created, app_hash, config_json FROM runs WHERE project = ?1",
            )?;
            let mut rows = stmt.query(params![project_id])?;
            let mut runs: Vec<(String, u64, String, RunConfig)> = vec![];
            while let Some(row) = rows.next()? {
                let run_id: String = row.get(0)?;
                let created: u64 = row.get(1)?;
                let app_hash: String = row.get(2)?;
                let config_data: String = row.get(3)?;
                let config: RunConfig = serde_json::from_str(&config_data)?;

                runs.push((run_id, created, app_hash, config));
            }
            runs.sort_by(|a, b| b.1.cmp(&a.1));

            Ok(runs)
        })
        .await?
    }

    async fn store_run(&self, project: &Project, run: &Run) -> Result<()> {
        // TODO(spolu): kind of ugly but we have to clone here.
        let traces = run.traces.clone();

        let pool = self.pool.clone();
        let ex_row_ids = tokio::task::spawn_blocking(
            move || -> Result<Vec<(usize, BlockType, String, usize, usize, i64)>> {
                let mut c = pool.get()?;
                let tx = c.transaction()?;
                // Start by inserting block executions if we don't already have them.
                let ex_row_ids = {
                    let mut stmt = tx.prepare_cached(
                        "INSERT INTO block_executions (hash, execution) VALUES (?, ?)",
                    )?;
                    traces
                        .iter()
                        .enumerate()
                        .map(
                            |(block_idx, ((block_type, block_name), input_executions))| {
                                Ok(input_executions
                                    .iter()
                                    .enumerate()
                                    .map(|(input_idx, map_executions)| {
                                        map_executions
                                            .iter()
                                            .enumerate()
                                            .map(|(map_idx, execution)| {
                                                let execution_json =
                                                    serde_json::to_string(&execution)?;
                                                let mut hasher = blake3::Hasher::new();
                                                hasher.update(execution_json.as_bytes());
                                                let hash =
                                                    format!("{}", hasher.finalize().to_hex());
                                                let row_id: Option<i64> = match tx.query_row(
                                                "SELECT id FROM block_executions WHERE hash = ?1",
                                                params![hash],
                                                |row| Ok(row.get(0).unwrap()),
                                            ) {
                                                Err(e) => match e {
                                                    rusqlite::Error::QueryReturnedNoRows => None,
                                                    _ => Err(e)?,
                                                },
                                                Ok(row_id) => Some(row_id),
                                            };
                                                let row_id = match row_id {
                                                    Some(row_id) => row_id,
                                                    None => {
                                                        stmt.insert(params![hash, execution_json])?
                                                    }
                                                };
                                                Ok((
                                                    block_idx,
                                                    block_type.clone(),
                                                    block_name.clone(),
                                                    input_idx,
                                                    map_idx,
                                                    row_id,
                                                ))
                                            })
                                            .collect::<Result<Vec<_>>>()
                                    })
                                    .collect::<Result<Vec<_>>>()?
                                    .into_iter()
                                    .flatten()
                                    .collect::<Vec<_>>())
                            },
                        )
                        .collect::<Result<Vec<_>>>()?
                        .into_iter()
                        .flatten()
                        .collect::<Vec<_>>()
                };
                tx.commit()?;
                Ok(ex_row_ids)
            },
        )
        .await??;

        let project_id = project.project_id();
        let run_id = run.run_id().to_string();
        let created = run.created();
        let app_hash = run.app_hash().to_string();
        let run_config = run.config().clone();

        let pool = self.pool.clone();
        let row_id = tokio::task::spawn_blocking(move || -> Result<i64> {
            let c = pool.get()?;
            // Create run.
            let config_data = serde_json::to_string(&run_config)?;
            let mut stmt = c.prepare_cached(
                "INSERT INTO runs (project, created, run_id, app_hash, config_json)
                   VALUES (?, ?, ?, ?, ?)",
            )?;
            let row_id =
                stmt.insert(params![project_id, created, run_id, app_hash, config_data])?;
            Ok(row_id)
        })
        .await??;

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut c = pool.get()?;
            // Finally fill in the join values.
            let tx = c.transaction()?;
            {
                let mut stmt = tx.prepare_cached(
                    "INSERT INTO runs_joins \
                       (run, \
                        block_idx, block_type, block_name, \
                        input_idx, map_idx, block_execution) \
                       VALUES (?, ?, ?, ?, ?, ?, ?)",
                )?;
                ex_row_ids
                    .iter()
                    .map(
                        |(block_idx, block_type, block_name, input_idx, map_idx, ex_row_id)| {
                            stmt.execute(params![
                                row_id,
                                block_idx,
                                block_type.to_string(),
                                block_name,
                                input_idx,
                                map_idx,
                                ex_row_id
                            ])?;
                            Ok(())
                        },
                    )
                    .collect::<Result<_>>()?;
            }
            tx.commit()?;
            Ok(())
        })
        .await?
    }

    async fn load_run(&self, project: &Project, run_id: &str) -> Result<Option<Run>> {
        let project_id = project.project_id();
        let run_id = run_id.to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<Run>> {
            let c = pool.get()?;
            // Check that the run_id exists
            let d: Option<(u64, u64, String, String)> = match c.query_row(
                "SELECT id, created, app_hash, config_json FROM runs
                   WHERE project = ?1 AND run_id = ?2",
                params![project_id, run_id],
                |row| {
                    Ok((
                        row.get(0).unwrap(),
                        row.get(1).unwrap(),
                        row.get(2).unwrap(),
                        row.get(3).unwrap(),
                    ))
                },
            ) {
                Err(e) => match e {
                    rusqlite::Error::QueryReturnedNoRows => None,
                    _ => Err(e)?,
                },
                Ok((row_id, created, app_hash, config_data)) => {
                    Some((row_id, created, app_hash, config_data))
                }
            };
            if d.is_none() {
                return Ok(None);
            }
            let (row_id, created, app_hash, config_data) = d.unwrap();
            let run_config: RunConfig = serde_json::from_str(&config_data)?;

            // Retrieve data points through datasets_joins
            let mut stmt = c.prepare_cached(
                "SELECT \
                   runs_joins.block_idx, runs_joins.block_type, runs_joins.block_name, \
                   runs_joins.input_idx, runs_joins.map_idx, block_executions.execution \
                   FROM block_executions \
                   INNER JOIN runs_joins \
                   ON block_executions.id = runs_joins.block_execution \
                   WHERE runs_joins.run = ?",
            )?;
            let mut rows = stmt.query([row_id])?;
            let mut data: Vec<(usize, BlockType, String, usize, usize, BlockExecution)> = vec![];
            let mut block_count = 0;
            while let Some(row) = rows.next()? {
                let block_idx: usize = row.get(0)?;
                let b: String = row.get(1)?;
                let block_type: BlockType = BlockType::from_str(&b)?;
                let block_name: String = row.get(2)?;
                let input_idx = row.get(3)?;
                let map_idx = row.get(4)?;
                let execution_data: String = row.get(5)?;
                let execution: BlockExecution = serde_json::from_str(&execution_data)?;
                data.push((
                    block_idx, block_type, block_name, input_idx, map_idx, execution,
                ));
                if (block_idx + 1) > block_count {
                    block_count = block_idx + 1;
                }
            }

            let mut input_counts: Vec<usize> = vec![0; block_count];
            data.iter().for_each(|(block_idx, _, _, input_idx, _, _)| {
                if (input_idx + 1) > input_counts[*block_idx] {
                    input_counts[*block_idx] = input_idx + 1;
                }
            });

            let mut map_counts: Vec<Vec<usize>> =
                input_counts.iter().map(|i| vec![0; *i]).collect::<Vec<_>>();
            data.iter()
                .for_each(|(block_idx, _, _, input_idx, map_idx, _)| {
                    if (map_idx + 1) > map_counts[*block_idx][*input_idx] {
                        map_counts[*block_idx][*input_idx] = map_idx + 1;
                    }
                });

            // println!("INPUT_COUNTS: {:?}", input_counts);
            // println!("MAP_COUNTS: {:?}", map_counts);

            //traces: Vec<((BlockType, String), Vec<Vec<BlockExecution>>)>,
            let mut traces: Vec<
                Option<(BlockType, String, Vec<Option<Vec<Option<BlockExecution>>>>)>,
            > = vec![None; block_count];
            data.into_iter().for_each(
                |(block_idx, block_type, block_name, input_idx, map_idx, execution)| {
                    // println!(
                    //     "ADDING block_name={} input_idx={} map_idx={}",
                    //     block_name, input_idx, map_idx
                    // );
                    // If the block executions vectors are not set yet, build them empty (None).
                    match traces[block_idx] {
                        None => {
                            traces[block_idx] =
                                Some((block_type, block_name, vec![None; input_counts[block_idx]]));
                            map_counts[block_idx].iter().enumerate().for_each(
                                |(input_idx, map_count)| {
                                    traces[block_idx].as_mut().unwrap().2[input_idx] =
                                        Some(vec![None; *map_count]);
                                },
                            );
                        }
                        _ => (),
                    }
                    traces[block_idx].as_mut().unwrap().2[input_idx]
                        .as_mut()
                        .unwrap()[map_idx] = Some(execution);
                },
            );

            let traces = traces
                .into_iter()
                .map(|o| {
                    let (block_type, block_name, executions) = o.unwrap();
                    (
                        (block_type, block_name),
                        executions
                            .into_iter()
                            .map(|i| {
                                i.unwrap()
                                    .into_iter()
                                    .map(|m| m.unwrap())
                                    .collect::<Vec<_>>()
                            })
                            .collect::<Vec<_>>(),
                    )
                })
                .collect::<Vec<_>>();

            Ok(Some(Run::new_from_store(
                &run_id,
                created,
                &app_hash,
                &run_config,
                traces,
            )))
        })
        .await?
    }

    async fn llm_cache_get(
        &self,
        project: &Project,
        request: &LLMRequest,
    ) -> Result<Vec<LLMGeneration>> {
        let project_id = project.project_id();
        let hash = request.hash().to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<LLMGeneration>> {
            let c = pool.get()?;
            // Retrieve generations.
            let mut stmt = c.prepare_cached(
                "SELECT created, generation FROM llm_cache WHERE project = ?1 AND hash = ?2",
            )?;
            let mut rows = stmt.query(params![project_id, hash])?;
            let mut generations: Vec<(u64, LLMGeneration)> = vec![];
            while let Some(row) = rows.next()? {
                let created: u64 = row.get(0)?;
                let generation_data: String = row.get(1)?;
                let generation: LLMGeneration = serde_json::from_str(&generation_data)?;
                generations.push((created, generation));
            }
            // Latest first.
            generations.sort_by(|a, b| b.0.cmp(&a.0));

            Ok(generations.into_iter().map(|(_, g)| g).collect::<Vec<_>>())
        })
        .await?
    }

    async fn llm_cache_store(
        &self,
        project: &Project,
        request: &LLMRequest,
        generation: &LLMGeneration,
    ) -> Result<()> {
        let project_id = project.project_id();
        let request = request.clone();
        let generation = generation.clone();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = pool.get()?;
            let mut stmt = c.prepare_cached(
                "INSERT INTO llm_cache (project, created, hash, request, generation)
                   VALUES (?, ?, ?, ?, ?)",
            )?;
            let created = generation.created;
            let request_data = serde_json::to_string(&request)?;
            let generation_data = serde_json::to_string(&generation)?;
            let _ = stmt.insert(params![
                project_id,
                created,
                request.hash().to_string(),
                request_data,
                generation_data
            ])?;

            Ok(())
        })
        .await?
    }

    fn clone_box(&self) -> Box<dyn Store + Sync + Send> {
        Box::new(self.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn sqlite_datasets() -> Result<()> {
        let store = SQLiteStore::new_in_memory()?;
        store.init().await?;
        let project = store.create_project().await?;

        let r = store.latest_dataset_hash(&project, "test").await?;
        assert!(r.is_none());

        let d = Dataset::new_from_jsonl(
            "test",
            vec![
                json!({"foo": "1", "bar": "1"}),
                json!({"foo": "2", "bar": "2"}),
            ],
        )
        .await?;

        store.register_dataset(&project, &d).await?;

        let r = store.latest_dataset_hash(&project, "test").await?.unwrap();
        assert!(r == "e3807c2c15d5b562dbeb2d92f5758d8793368cb19c373e5f25c1ec873771e330");

        let d = store.load_dataset(&project, "test", &r).await?.unwrap();
        assert!(d.len() == 2);
        assert!(d.hash() == r);
        assert!(d.keys() == vec!["foo", "bar"]);

        let d = Dataset::new_from_jsonl(
            "test",
            vec![
                json!({"foo": "1", "bar": "1"}),
                json!({"foo": "2", "bar": "2"}),
                json!({"foo": "3", "bar": "3"}),
            ],
        )
        .await?;

        store.register_dataset(&project, &d).await?;
        let l = store.list_datasets(&project).await?;

        assert!(l.len() == 1);
        assert!(l["test"].len() == 2);
        assert!(l["test"][1].0 == r);

        Ok(())
    }

    #[tokio::test]
    async fn sqlite_store_latest_specification_hash() -> Result<()> {
        let store = SQLiteStore::new_in_memory()?;
        store.init().await?;
        let project = store.create_project().await?;

        let r = store.latest_specification_hash(&project).await?;
        assert!(r.is_none());
        Ok(())
    }

    #[tokio::test]
    async fn sqlite_store_latest_run_id() -> Result<()> {
        let store = SQLiteStore::new_in_memory()?;
        store.init().await?;
        let project = store.create_project().await?;

        let r = store.latest_run_id(&project).await?;
        assert!(r.is_none());
        Ok(())
    }
}
