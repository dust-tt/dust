use crate::blocks::block::BlockType;
use crate::dataset::Dataset;
use crate::datasources::datasource::{DataSource, Document};
use crate::http::request::{HttpRequest, HttpResponse};
use crate::project::Project;
use crate::providers::embedder::{EmbedderRequest, EmbedderVector};
use crate::providers::llm::{LLMChatGeneration, LLMChatRequest, LLMGeneration, LLMRequest};
use crate::run::{BlockExecution, Run, RunConfig, RunStatus, RunType};
use crate::stores::store::{Store, SQLITE_TABLES, SQL_INDEXES};
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
        let pool = Pool::builder().max_size(1).build(manager).unwrap();
        Ok(SQLiteStore { pool })
    }

    pub fn new<P: AsRef<Path>>(sqlite_path: P) -> Result<Self> {
        let manager = SqliteConnectionManager::file(sqlite_path);
        let pool = Pool::new(manager)?;
        Ok(SQLiteStore { pool })
    }

    pub async fn init(&self) -> Result<()> {
        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || {
            let c = pool.get()?;
            for t in SQLITE_TABLES {
                match c.execute(t, ()) {
                    Err(e) => Err(e)?,
                    Ok(_) => {}
                }
            }

            for i in SQL_INDEXES {
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
                   WHERE project = ?1 AND dataset_id = ?2 AND hash = ?3
                   ORDER BY created DESC LIMIT 1",
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

    async fn load_specification(
        &self,
        project: &Project,
        hash: &str,
    ) -> Result<Option<(u64, String)>> {
        let project_id = project.project_id();
        let hash = hash.to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<(u64, String)>> {
            let c = pool.get()?;
            // Check that the dataset_id and hash exist
            let d: Option<(u64, String)> = match c.query_row(
                "SELECT created, specification FROM specifications
                   WHERE project = ?1 AND hash = ?2
                   ORDER BY created DESC LIMIT 1",
                params![project_id, hash],
                |row| Ok((row.get(0).unwrap(), row.get(1).unwrap())),
            ) {
                Err(e) => match e {
                    rusqlite::Error::QueryReturnedNoRows => None,
                    _ => Err(e)?,
                },
                Ok((created, spec)) => Some((created, spec)),
            };
            Ok(d)
        })
        .await?
    }

    async fn latest_run_id(&self, project: &Project, run_type: RunType) -> Result<Option<String>> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<String>> {
            let c = pool.get()?;
            match c.query_row(
                "SELECT run_id FROM runs WHERE project = ?1 AND run_type = ?2
                   ORDER BY created DESC LIMIT 1",
                params![project_id, run_type.to_string()],
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

    async fn list_runs(
        &self,
        project: &Project,
        run_type: RunType,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Run>, usize)> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<(Vec<Run>, usize)> {
            let c = pool.get()?;
            // Retrieve runs.
            let mut stmt = c.prepare_cached(
                "SELECT run_id, created, app_hash, config_json, status_json FROM runs
                    WHERE project = ?1 AND run_type = ?2
                    ORDER BY created DESC",
            )?;
            let mut stmt_limit_offset = c.prepare_cached(
                "SELECT run_id, created, app_hash, config_json, status_json FROM runs
                    WHERE project = ?1 AND run_type = ?2
                    ORDER BY created DESC LIMIT ?3 OFFSET ?4",
            )?;
            let mut rows = match limit_offset {
                None => stmt.query(params![project_id, run_type.to_string()])?,
                Some((limit, offset)) => stmt_limit_offset.query(params![
                    project_id,
                    run_type.to_string(),
                    limit,
                    offset
                ])?,
            };

            let mut runs: Vec<Run> = vec![];
            while let Some(row) = rows.next()? {
                let run_id: String = row.get(0)?;
                let created: u64 = row.get(1)?;
                let app_hash: String = row.get(2)?;
                let config_data: String = row.get(3)?;
                let status_data: String = row.get(4)?;
                let run_config: RunConfig = serde_json::from_str(&config_data)?;
                let run_status: RunStatus = serde_json::from_str(&status_data)?;

                runs.push(Run::new_from_store(
                    &run_id,
                    created as u64,
                    run_type.clone(),
                    &app_hash,
                    &run_config,
                    &run_status,
                    vec![],
                ));
            }

            let total = match limit_offset {
                None => runs.len(),
                Some(_) => {
                    let mut stmt = c.prepare_cached(
                        "SELECT COUNT(*) FROM runs
                                WHERE project = ?1 AND run_type = ?2",
                    )?;
                    stmt.query_row(params![project_id, run_type.to_string()], |row| row.get(0))?
                }
            };

            Ok((runs, total))
        })
        .await?
    }

    async fn create_run_empty(&self, project: &Project, run: &Run) -> Result<()> {
        let project_id = project.project_id();
        let run_id = run.run_id().to_string();
        let created = run.created();
        let run_type = run.run_type();
        let app_hash = run.app_hash().to_string();
        let run_config = run.config().clone();
        let run_status = run.status().clone();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = pool.get()?;
            // Create run.
            let config_data = serde_json::to_string(&run_config)?;
            let status_data = serde_json::to_string(&run_status)?;
            let mut stmt = c.prepare_cached(
                "INSERT INTO runs
                   (project, created, run_id, run_type, app_hash, config_json, status_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?)",
            )?;
            let _ = stmt.insert(params![
                project_id,
                created,
                run_id,
                run_type.to_string(),
                app_hash,
                config_data,
                status_data
            ])?;
            Ok(())
        })
        .await??;

        Ok(())
    }

    async fn update_run_status(
        &self,
        project: &Project,
        run_id: &str,
        run_status: &RunStatus,
    ) -> Result<()> {
        let project_id = project.project_id();
        let run_id = run_id.to_string();
        let run_status = run_status.clone();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = pool.get()?;
            // Create run.
            let status_data = serde_json::to_string(&run_status)?;
            let mut stmt = c.prepare_cached(
                "UPDATE runs SET status_json = ? WHERE project = ? AND run_id = ?",
            )?;
            let _ = stmt.insert(params![status_data, project_id, run_id,])?;
            Ok(())
        })
        .await??;

        Ok(())
    }

    async fn append_run_block(
        &self,
        project: &Project,
        run: &Run,
        block_idx: usize,
        block_type: &BlockType,
        block_name: &String,
    ) -> Result<()> {
        let traces = run
            .traces
            .iter()
            .filter(|t| t.0 .0 == *block_type && &t.0 .1 == block_name)
            .map(|t| t.clone())
            .collect::<Vec<_>>();

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
                        .map(|((block_type, block_name), input_executions)| {
                            Ok(input_executions
                                .iter()
                                .enumerate()
                                .map(|(input_idx, map_executions)| {
                                    map_executions
                                        .iter()
                                        .enumerate()
                                        .map(|(map_idx, execution)| {
                                            let execution_json = serde_json::to_string(&execution)?;
                                            let mut hasher = blake3::Hasher::new();
                                            hasher.update(execution_json.as_bytes());
                                            let hash = format!("{}", hasher.finalize().to_hex());
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
                        })
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

        let pool = self.pool.clone();
        let row_id = tokio::task::spawn_blocking(move || -> Result<i64> {
            let c = pool.get()?;
            let row_id = c.query_row(
                "SELECT id FROM runs WHERE project = ?1 AND run_id = ?2",
                params![project_id, run_id],
                |row| row.get(0),
            )?;
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

    async fn load_run(
        &self,
        project: &Project,
        run_id: &str,
        block: Option<Option<(BlockType, String)>>,
    ) -> Result<Option<Run>> {
        let project_id = project.project_id();
        let run_id = run_id.to_string();
        let block = block.clone();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<Run>> {
            let c = pool.get()?;
            // Check that the run_id exists
            let d: Option<(u64, u64, String, String, String, String)> = match c.query_row(
                "SELECT id, created, run_type, app_hash, config_json, status_json FROM runs
                   WHERE project = ?1 AND run_id = ?2",
                params![project_id, run_id],
                |row| {
                    Ok((
                        row.get(0).unwrap(),
                        row.get(1).unwrap(),
                        row.get(2).unwrap(),
                        row.get(3).unwrap(),
                        row.get(4).unwrap(),
                        row.get(5).unwrap(),
                    ))
                },
            ) {
                Err(e) => match e {
                    rusqlite::Error::QueryReturnedNoRows => None,
                    _ => Err(e)?,
                },
                Ok((row_id, created, run_type, app_hash, config_data, status_data)) => Some((
                    row_id,
                    created,
                    run_type,
                    app_hash,
                    config_data,
                    status_data,
                )),
            };
            if d.is_none() {
                return Ok(None);
            }
            let (row_id, created, run_type_str, app_hash, config_data, status_data) = d.unwrap();
            let run_type = RunType::from_str(&run_type_str)?;
            let run_config: RunConfig = serde_json::from_str(&config_data)?;
            let run_status: RunStatus = serde_json::from_str(&status_data)?;

            let mut data: Vec<(usize, BlockType, String, usize, usize, BlockExecution)> = vec![];
            let mut block_count = 0;

            match block {
                None => {
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
                    while let Some(row) = rows.next()? {
                        let block_idx: usize = row.get(0)?;
                        let b: String = row.get(1)?;
                        let block_type: BlockType = BlockType::from_str(&b)?;
                        let block_name: String = row.get(2)?;
                        let input_idx = row.get(3)?;
                        let map_idx = row.get(4)?;
                        let execution_data: String = row.get(5)?;
                        let execution: BlockExecution = serde_json::from_str(&execution_data)?;
                        // println!(
                        //     "{} {} {} {} {}",
                        //     block_idx,
                        //     block_type.to_string(),
                        //     block_name,
                        //     input_idx,
                        //     map_idx
                        // );
                        data.push((
                            block_idx, block_type, block_name, input_idx, map_idx, execution,
                        ));
                        if (block_idx + 1) > block_count {
                            block_count = block_idx + 1;
                        }
                    }
                }
                Some(block) => {
                    match block {
                        None => (),
                        Some((block_type, block_name)) => {
                            // Retrieve data points through datasets_joins for one block
                            let mut stmt = c.prepare_cached(
                                "SELECT \
                            runs_joins.block_idx, runs_joins.block_type, runs_joins.block_name, \
                            runs_joins.input_idx, runs_joins.map_idx, block_executions.execution \
                            FROM block_executions \
                            INNER JOIN runs_joins \
                            ON block_executions.id = runs_joins.block_execution \
                            WHERE runs_joins.run = ? AND block_type = ? AND block_name = ?",
                            )?;
                            let mut rows =
                                stmt.query(params![row_id, block_type.to_string(), block_name])?;
                            while let Some(row) = rows.next()? {
                                let block_idx: usize = row.get(0)?;
                                let b: String = row.get(1)?;
                                let block_type: BlockType = BlockType::from_str(&b)?;
                                let block_name: String = row.get(2)?;
                                let input_idx = row.get(3)?;
                                let map_idx = row.get(4)?;
                                let execution_data: String = row.get(5)?;
                                let execution: BlockExecution =
                                    serde_json::from_str(&execution_data)?;
                                data.push((
                                    block_idx, block_type, block_name, input_idx, map_idx,
                                    execution,
                                ));
                                if (block_idx + 1) > block_count {
                                    block_count = block_idx + 1;
                                }
                            }
                        }
                    }
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
                .filter(|o| o.is_some())
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
                run_type,
                &app_hash,
                &run_config,
                &run_status,
                traces,
            )))
        })
        .await?
    }

    async fn register_data_source(&self, project: &Project, ds: &DataSource) -> Result<()> {
        unimplemented!()
    }

    async fn load_data_source(
        &self,
        project: &Project,
        data_source_id: &str,
    ) -> Result<Option<DataSource>> {
        unimplemented!()
    }

    async fn upsert_data_source_document(
        &self,
        project: &Project,
        data_source_id: &str,
        document: &Document,
    ) -> Result<()> {
        unimplemented!()
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
                "SELECT created, response FROM cache WHERE project = ?1 AND hash = ?2",
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
                "INSERT INTO cache (project, created, hash, request, response)
                   VALUES (?, ?, ?, ?, ?)",
            )?;
            let created = generation.created;
            let request_data = serde_json::to_string(&request)?;
            let generation_data = serde_json::to_string(&generation)?;
            stmt.insert(params![
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

    async fn llm_chat_cache_get(
        &self,
        project: &Project,
        request: &LLMChatRequest,
    ) -> Result<Vec<LLMChatGeneration>> {
        let project_id = project.project_id();
        let hash = request.hash().to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<LLMChatGeneration>> {
            let c = pool.get()?;
            // Retrieve generations.
            let mut stmt = c.prepare_cached(
                "SELECT created, response FROM cache WHERE project = ?1 AND hash = ?2",
            )?;
            let mut rows = stmt.query(params![project_id, hash])?;
            let mut generations: Vec<(u64, LLMChatGeneration)> = vec![];
            while let Some(row) = rows.next()? {
                let created: u64 = row.get(0)?;
                let generation_data: String = row.get(1)?;
                let generation: LLMChatGeneration = serde_json::from_str(&generation_data)?;
                generations.push((created, generation));
            }
            // Latest first.
            generations.sort_by(|a, b| b.0.cmp(&a.0));

            Ok(generations.into_iter().map(|(_, g)| g).collect::<Vec<_>>())
        })
        .await?
    }

    async fn llm_chat_cache_store(
        &self,
        project: &Project,
        request: &LLMChatRequest,
        generation: &LLMChatGeneration,
    ) -> Result<()> {
        let project_id = project.project_id();
        let request = request.clone();
        let generation = generation.clone();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = pool.get()?;
            let mut stmt = c.prepare_cached(
                "INSERT INTO cache (project, created, hash, request, response)
                   VALUES (?, ?, ?, ?, ?)",
            )?;
            let created = generation.created;
            let request_data = serde_json::to_string(&request)?;
            let generation_data = serde_json::to_string(&generation)?;
            stmt.insert(params![
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

    async fn embedder_cache_get(
        &self,
        project: &Project,
        request: &EmbedderRequest,
    ) -> Result<Vec<EmbedderVector>> {
        let project_id = project.project_id();
        let hash = request.hash().to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<EmbedderVector>> {
            let c = pool.get()?;
            // Retrieve generations.
            let mut stmt = c.prepare_cached(
                "SELECT created, response FROM cache WHERE project = ?1 AND hash = ?2",
            )?;
            let mut rows = stmt.query(params![project_id, hash])?;
            let mut embeddings: Vec<(u64, EmbedderVector)> = vec![];
            while let Some(row) = rows.next()? {
                let created: u64 = row.get(0)?;
                let embedding_data: String = row.get(1)?;
                let embedding: EmbedderVector = serde_json::from_str(&embedding_data)?;
                embeddings.push((created, embedding));
            }
            // Latest first.
            embeddings.sort_by(|a, b| b.0.cmp(&a.0));

            Ok(embeddings.into_iter().map(|(_, g)| g).collect::<Vec<_>>())
        })
        .await?
    }

    async fn embedder_cache_store(
        &self,
        project: &Project,
        request: &EmbedderRequest,
        embedding: &EmbedderVector,
    ) -> Result<()> {
        let project_id = project.project_id();
        let request = request.clone();
        let embedding = embedding.clone();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = pool.get()?;
            let mut stmt = c.prepare_cached(
                "INSERT INTO cache (project, created, hash, request, response)
                   VALUES (?, ?, ?, ?, ?)",
            )?;
            let created = embedding.created;
            let request_data = serde_json::to_string(&request)?;
            let embedding_data = serde_json::to_string(&embedding)?;
            stmt.insert(params![
                project_id,
                created,
                request.hash().to_string(),
                request_data,
                embedding_data
            ])?;
            Ok(())
        })
        .await?
    }

    async fn http_cache_get(
        &self,
        project: &Project,
        request: &HttpRequest,
    ) -> Result<Vec<HttpResponse>> {
        let project_id = project.project_id();
        let hash = request.hash().to_string();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<HttpResponse>> {
            let c = pool.get()?;
            // Retrieve generations.
            let mut stmt = c.prepare_cached(
                "SELECT created, response FROM cache WHERE project = ?1 AND hash = ?2",
            )?;
            let mut rows = stmt.query(params![project_id, hash])?;
            let mut responses: Vec<(u64, HttpResponse)> = vec![];
            while let Some(row) = rows.next()? {
                let created: u64 = row.get(0)?;
                let response_data: String = row.get(1)?;
                let response: HttpResponse = serde_json::from_str(&response_data)?;
                responses.push((created, response));
            }
            // Latest first.
            responses.sort_by(|a, b| b.0.cmp(&a.0));

            Ok(responses.into_iter().map(|(_, g)| g).collect::<Vec<_>>())
        })
        .await?
    }

    async fn http_cache_store(
        &self,
        project: &Project,
        request: &HttpRequest,
        response: &HttpResponse,
    ) -> Result<()> {
        let project_id = project.project_id();
        let request = request.clone();
        let response = response.clone();

        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let c = pool.get()?;
            let mut stmt = c.prepare_cached(
                "INSERT INTO cache (project, created, hash, request, response)
                   VALUES (?, ?, ?, ?, ?)",
            )?;
            let created = response.created;
            let request_data = serde_json::to_string(&request)?;
            let response_data = serde_json::to_string(&response)?;
            stmt.insert(params![
                project_id,
                created,
                request.hash().to_string(),
                request_data,
                response_data
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
    use crate::app::App;
    use crate::run::{Credentials, RunConfig, Status};
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

        // sleep 2 ms to make sure created is different for the new dataset.
        tokio::time::sleep(std::time::Duration::from_millis(2)).await;

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

        let r = store.latest_run_id(&project, RunType::Local).await?;
        assert!(r.is_none());
        Ok(())
    }

    #[tokio::test]
    async fn sqlite_end_to_end() -> Result<()> {
        let store = SQLiteStore::new_in_memory()?;
        store.init().await?;
        let project = store.create_project().await?;

        let d = Dataset::new_from_jsonl(
            "env",
            vec![
                json!({"foo": "1", "bar": "1"}),
                json!({"foo": "2", "bar": "2"}),
            ],
        )
        .await?;
        store.register_dataset(&project, &d).await?;

        let spec_data = "input INPUT {}
code CODE1 {
  code:
```
_fun = (env) => {
  return {\"res\": env['state']['INPUT']['foo']};
}
```
}
code CODE2 {
  code:
```
_fun = (env) => {
  return {\"res\": env['state']['CODE1']['res'] + env['state']['INPUT']['bar']};
}
```
}";

        let mut app = App::new(&spec_data).await?;

        store
            .register_specification(&project, &app.hash(), &spec_data)
            .await?;

        let r = store.latest_specification_hash(&project).await?;
        assert!(r.unwrap() == app.hash());

        app.prepare_run(
            RunType::Local,
            RunConfig {
                blocks: HashMap::new(),
            },
            project.clone(),
            Some(d),
            Box::new(store.clone()),
        )
        .await?;

        app.run(Credentials::new(), Box::new(store.clone()), None)
            .await?;

        let r = store
            .load_run(&project, app.run_ref().unwrap().run_id(), None)
            .await?
            .unwrap();

        assert!(r.run_id() == app.run_ref().unwrap().run_id());
        assert!(r.app_hash() == app.hash());
        assert!(r.status().run_status() == Status::Succeeded);
        assert!(r.traces.len() == 3);
        assert!(r.traces[1].1[0][0].value.as_ref().unwrap()["res"] == "1");

        let r = store
            .load_run(&project, app.run_ref().unwrap().run_id(), Some(None))
            .await?
            .unwrap();
        assert!(r.traces.len() == 0);

        let r = store
            .load_run(
                &project,
                app.run_ref().unwrap().run_id(),
                Some(Some((BlockType::Code, "CODE2".to_string()))),
            )
            .await?
            .unwrap();
        assert!(r.traces.len() == 1);
        assert!(r.traces[0].1.len() == 2);
        assert!(r.traces[0].1[0].len() == 1);
        assert!(r.traces[0].1[0][0].value.as_ref().unwrap()["res"] == "11");

        Ok(())
    }

    #[tokio::test]
    async fn sqlite_no_input() -> Result<()> {
        let store = SQLiteStore::new_in_memory()?;
        store.init().await?;
        let project = store.create_project().await?;

        let spec_data = "code CODE1 {
  code:
```
_fun = (env) => {
  return {\"res\": '1'};
}
```
}
code CODE2 {
  code:
```
_fun = (env) => {
  return {\"res\": env['state']['CODE1']['res'] + '1'};
}
```
}";

        let mut app = App::new(&spec_data).await?;

        store
            .register_specification(&project, &app.hash(), &spec_data)
            .await?;

        let r = store.latest_specification_hash(&project).await?;
        assert!(r.unwrap() == app.hash());

        app.prepare_run(
            RunType::Local,
            RunConfig {
                blocks: HashMap::new(),
            },
            project.clone(),
            None,
            Box::new(store.clone()),
        )
        .await?;

        app.run(Credentials::new(), Box::new(store.clone()), None)
            .await?;

        let r = store
            .load_run(&project, app.run_ref().unwrap().run_id(), None)
            .await?
            .unwrap();

        assert!(r.run_id() == app.run_ref().unwrap().run_id());
        assert!(r.app_hash() == app.hash());
        assert!(r.status().run_status() == Status::Succeeded);
        assert!(r.traces.len() == 2);
        assert!(r.traces[0].1[0][0].value.as_ref().unwrap()["res"] == "1");

        let r = store
            .load_run(&project, app.run_ref().unwrap().run_id(), Some(None))
            .await?
            .unwrap();
        assert!(r.traces.len() == 0);

        let r = store
            .load_run(
                &project,
                app.run_ref().unwrap().run_id(),
                Some(Some((BlockType::Code, "CODE2".to_string()))),
            )
            .await?
            .unwrap();
        assert!(r.traces.len() == 1);
        assert!(r.traces[0].1.len() == 1);
        assert!(r.traces[0].1[0].len() == 1);
        assert!(r.traces[0].1[0][0].value.as_ref().unwrap()["res"] == "11");

        Ok(())
    }
}
