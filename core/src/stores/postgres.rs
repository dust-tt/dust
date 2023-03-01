use crate::blocks::block::BlockType;
use crate::dataset::Dataset;
use crate::datasources::datasource::{DataSource, Document};
use crate::http::request::{HttpRequest, HttpResponse};
use crate::project::Project;
use crate::providers::embedder::{EmbedderRequest, EmbedderVector};
use crate::providers::llm::{LLMChatGeneration, LLMChatRequest, LLMGeneration, LLMRequest};
use crate::run::{BlockExecution, Run, RunConfig, RunStatus, RunType};
use crate::stores::store::{Store, POSTGRES_TABLES, SQL_INDEXES};
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use serde_json::Value;
use std::collections::HashMap;
use std::str::FromStr;
use tokio_postgres::NoTls;

#[derive(Clone)]
pub struct PostgresStore {
    pool: Pool<PostgresConnectionManager<NoTls>>,
}

impl PostgresStore {
    pub async fn new(db_uri: &str) -> Result<Self> {
        let manager = PostgresConnectionManager::new_from_stringlike(db_uri, NoTls)?;
        let pool = Pool::builder().max_size(16).build(manager).await?;
        Ok(PostgresStore { pool })
    }

    pub async fn init(&self) -> Result<()> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        for t in POSTGRES_TABLES {
            match c.execute(t, &[]).await {
                Err(e) => Err(e)?,
                Ok(_) => {}
            }
        }

        for i in SQL_INDEXES {
            match c.execute(i, &[]).await {
                Err(e) => Err(e)?,
                Ok(_) => {}
            }
        }

        Ok(())
    }
}

#[async_trait]
impl Store for PostgresStore {
    async fn create_project(&self) -> Result<Project> {
        let pool = self.pool.clone();
        let c = pool.get().await?;
        // Create dataset.
        let stmt = c
            .prepare("INSERT INTO projects (id) VALUES (DEFAULT) RETURNING id")
            .await?;
        let row_id: i64 = c.query_one(&stmt, &[]).await?.get(0);

        Ok(Project::new_from_id(row_id))
    }

    async fn latest_dataset_hash(
        &self,
        project: &Project,
        dataset_id: &str,
    ) -> Result<Option<String>> {
        let project_id = project.project_id();
        let dataset_id = dataset_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;
        let r = c
            .query(
                "SELECT hash FROM datasets
                   WHERE project = $1 AND dataset_id = $2 ORDER BY created DESC LIMIT 1",
                &[&project_id, &dataset_id],
            )
            .await?;
        match r.len() {
            0 => Ok(None),
            1 => Ok(Some(r[0].get(0))),
            _ => unreachable!(),
        }
    }

    async fn register_dataset(&self, project: &Project, d: &Dataset) -> Result<()> {
        let project_id = project.project_id();
        let dataset_created = d.created();
        let dataset_id = d.dataset_id().to_string();
        let dataset_hash = d.hash().to_string();

        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        // Start by inserting values if we don't already have them.
        let tx = c.transaction().await?;
        let stmt = tx
            .prepare(
                "INSERT INTO datasets_points (id, hash, json)
                   VALUES (DEFAULT, $1, $2) RETURNING id",
            )
            .await?;

        // We need to insert the points in order to properly catch duplicates.
        // TODO(spolu): optimize but since in a transaction it should be fine.
        let mut pt_row_ids: Vec<i64> = vec![];
        for v in d.iter() {
            let mut hasher = blake3::Hasher::new();
            let value_json = serde_json::to_string(v)?;
            hasher.update(value_json.as_bytes());
            let hash = format!("{}", hasher.finalize().to_hex());
            let r = tx
                .query("SELECT id FROM datasets_points WHERE hash = $1", &[&hash])
                .await?;
            let row_id: Option<i64> = match r.len() {
                0 => None,
                1 => Some(r[0].get(0)),
                _ => unreachable!(),
            };
            let row_id = match row_id {
                Some(row_id) => row_id,
                None => tx.query_one(&stmt, &[&hash, &value_json]).await?.get(0),
            };
            pt_row_ids.push(row_id);
        }
        tx.commit().await?;

        let stmt = c
            .prepare(
                "INSERT INTO datasets (id, project, created, dataset_id, hash)
                   VALUES (DEFAULT, $1, $2, $3, $4) RETURNING id",
            )
            .await?;
        let row_id: i64 = c
            .query_one(
                &stmt,
                &[
                    &project_id,
                    &(dataset_created as i64),
                    &dataset_id,
                    &dataset_hash,
                ],
            )
            .await?
            .get(0);

        let tx = c.transaction().await?;
        let stmt = tx
            .prepare(
                "INSERT INTO datasets_joins (id, dataset, point, point_idx)
                   VALUES (DEFAULT, $1, $2, $3) RETURNING id",
            )
            .await?;

        // Prepare the joins.
        let pt_row_ids = pt_row_ids.into_iter().enumerate().collect::<Vec<_>>();

        // TODO(spolu): this may be too big? We will want to use buffer_unordered.
        futures::future::join_all(pt_row_ids.iter().map(|(idx, pt_row_id)| async {
            tx.query_one(
                &stmt,
                &[&row_id.clone(), &pt_row_id.clone(), &(idx.clone() as i64)],
            )
            .await?;
            Ok(())
        }))
        .await
        .into_iter()
        .collect::<Result<Vec<_>>>()?;

        tx.commit().await?;

        Ok(())
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
        let c = pool.get().await?;

        // Check that the dataset_id and hash exist
        let r = c
            .query(
                "SELECT id, created FROM datasets
                   WHERE project = $1 AND dataset_id = $2 AND hash = $3
                   ORDER BY created DESC LIMIT 1",
                &[&project_id, &dataset_id, &hash],
            )
            .await?;

        let d: Option<(i64, i64)> = match r.len() {
            0 => None,
            1 => Some((r[0].get(0), r[0].get(1))),
            _ => unreachable!(),
        };

        if d.is_none() {
            return Ok(None);
        }
        let (row_id, created) = d.unwrap();

        // Retrieve data points through datasets_joins
        let stmt = c
            .prepare(
                "SELECT datasets_joins.point_idx, datasets_points.json \
                   FROM datasets_points \
                   INNER JOIN datasets_joins \
                   ON datasets_points.id = datasets_joins.point \
                   WHERE datasets_joins.dataset = $1",
            )
            .await?;

        let rows = c.query(&stmt, &[&row_id]).await?;

        let mut data: Vec<(usize, Value)> = rows
            .into_iter()
            .map(|r| {
                let index: i64 = r.get(0);
                let value_data: String = r.get(1);
                let value: Value = serde_json::from_str(&value_data)?;
                Ok((index as usize, value))
            })
            .collect::<Result<Vec<_>>>()?;
        data.sort_by(|a, b| a.0.cmp(&b.0));

        Ok(Some(Dataset::new_from_store(
            created as u64,
            &dataset_id,
            &hash,
            data.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
        )?))
    }

    async fn list_datasets(
        &self,
        project: &Project,
    ) -> Result<HashMap<String, Vec<(String, u64)>>> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        let c = pool.get().await?;
        let stmt = c
            .prepare(
                "SELECT dataset_id, hash, created FROM datasets WHERE project = $1
                   ORDER BY created DESC",
            )
            .await?;
        let rows = c.query(&stmt, &[&project_id]).await?;

        let mut datasets: HashMap<String, Vec<(String, u64)>> = HashMap::new();
        rows.into_iter().for_each(|r| {
            let dataset_id: String = r.get(0);
            let hash: String = r.get(1);
            let created: i64 = r.get(2);
            datasets
                .entry(dataset_id)
                .or_default()
                .push((hash, created as u64));
        });
        Ok(datasets)
    }

    async fn latest_specification_hash(&self, project: &Project) -> Result<Option<String>> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        let c = pool.get().await?;
        let r = c
            .query(
                "SELECT hash FROM specifications WHERE project = $1 ORDER BY created DESC LIMIT 1",
                &[&project_id],
            )
            .await?;
        match r.len() {
            0 => Ok(None),
            1 => Ok(Some(r[0].get(0))),
            _ => unreachable!(),
        }
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
        let c = pool.get().await?;
        let created = utils::now() as i64;

        // Insert new specification.
        let stmt = c
            .prepare(
                "INSERT INTO specifications (id, project, created, hash, specification)
                   VALUES (DEFAULT, $1, $2, $3, $4) RETURNING id",
            )
            .await?;
        c.query_one(&stmt, &[&project_id, &created, &hash, &spec])
            .await?;

        Ok(())
    }

    async fn load_specification(
        &self,
        project: &Project,
        hash: &str,
    ) -> Result<Option<(u64, String)>> {
        let project_id = project.project_id();
        let hash = hash.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // Check that the dataset_id and hash exist
        let r = c
            .query(
                "SELECT created, specification FROM specifications
                   WHERE project = $1 AND hash = $2
                   ORDER BY created DESC LIMIT 1",
                &[&project_id, &hash],
            )
            .await?;

        let d: Option<(i64, String)> = match r.len() {
            0 => None,
            1 => Some((r[0].get(0), r[0].get(1))),
            _ => unreachable!(),
        };

        match d {
            None => Ok(None),
            Some((created, spec)) => Ok(Some((created as u64, spec))),
        }
    }

    async fn latest_run_id(&self, project: &Project, run_type: RunType) -> Result<Option<String>> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        let c = pool.get().await?;
        let r = c
            .query(
                "SELECT run_id FROM runs WHERE project = $1 AND run_type = $2
                   ORDER BY created DESC LIMIT 1",
                &[&project_id, &run_type.to_string()],
            )
            .await?;

        match r.len() {
            0 => Ok(None),
            1 => Ok(Some(r[0].get(0))),
            _ => unreachable!(),
        }
    }

    async fn list_runs(
        &self,
        project: &Project,
        run_type: RunType,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Run>, usize)> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        let c = pool.get().await?;
        // Retrieve runs.
        let rows = match limit_offset {
            None => {
                let stmt = c
                    .prepare(
                        "SELECT run_id, created, app_hash, config_json, status_json FROM runs
                            WHERE project = $1 AND run_type = $2 ORDER BY created DESC",
                    )
                    .await?;
                c.query(&stmt, &[&project_id, &run_type.to_string()])
                    .await?
            }
            Some((limit, offset)) => {
                let stmt = c
                    .prepare(
                        "SELECT run_id, created, app_hash, config_json, status_json FROM runs
                            WHERE project = $1 AND run_type = $2
                            ORDER BY created DESC LIMIT $3 OFFSET $4",
                    )
                    .await?;
                c.query(
                    &stmt,
                    &[
                        &project_id,
                        &run_type.to_string(),
                        &(limit as i64),
                        &(offset as i64),
                    ],
                )
                .await?
            }
        };

        let runs: Vec<Run> = rows
            .iter()
            .map(|r| {
                let run_id: String = r.get(0);
                let created: i64 = r.get(1);
                let app_hash: String = r.get(2);
                let config_data: String = r.get(3);
                let status_data: String = r.get(4);
                let run_config: RunConfig = serde_json::from_str(&config_data)?;
                let run_status: RunStatus = serde_json::from_str(&status_data)?;

                Ok(Run::new_from_store(
                    &run_id,
                    created as u64,
                    run_type.clone(),
                    &app_hash,
                    &run_config,
                    &run_status,
                    vec![],
                ))
            })
            .collect::<Result<Vec<_>>>()?;

        let total = match limit_offset {
            None => runs.len(),
            Some(_) => {
                let stmt = c
                    .prepare(
                        "SELECT COUNT(*) FROM runs
                            WHERE project = $1 AND run_type = $2",
                    )
                    .await?;
                let t: i64 = c
                    .query_one(&stmt, &[&project_id, &run_type.to_string()])
                    .await?
                    .get(0);
                t as usize
            }
        };

        Ok((runs, total))
    }

    async fn create_run_empty(&self, project: &Project, run: &Run) -> Result<()> {
        let project_id = project.project_id();
        let run_id = run.run_id().to_string();
        let created = run.created() as i64;
        let run_type = run.run_type();
        let app_hash = run.app_hash().to_string();
        let run_config = run.config().clone();
        let run_status = run.status().clone();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // Create run.
        let config_data = serde_json::to_string(&run_config)?;
        let status_data = serde_json::to_string(&run_status)?;

        let stmt = c
            .prepare(
                "INSERT INTO runs
                   (id, project, created, run_id, run_type, app_hash, config_json, status_json)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7) RETURNING id",
            )
            .await?;
        let _ = c
            .query_one(
                &stmt,
                &[
                    &project_id,
                    &created,
                    &run_id,
                    &run_type.to_string(),
                    &app_hash,
                    &config_data,
                    &status_data,
                ],
            )
            .await?;

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
        let c = pool.get().await?;

        // Create run.
        let status_data = serde_json::to_string(&run_status)?;
        let stmt = c
            .prepare("UPDATE runs SET status_json = $1 WHERE project = $2 AND run_id = $3")
            .await?;
        let _ = c
            .query(&stmt, &[&status_data, &project_id, &run_id])
            .await?;

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

        // Flatten block executions from traces.
        let executions = traces
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
                                Ok((
                                    block_idx,
                                    block_type.clone(),
                                    block_name.clone(),
                                    input_idx,
                                    map_idx,
                                    execution_json,
                                    hash,
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
            .collect::<Vec<_>>();

        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        let tx = c.transaction().await?;
        let stmt = tx
            .prepare(
                "INSERT INTO block_executions (id, hash, execution) VALUES (DEFAULT, $1, $2)
                   ON CONFLICT(hash) DO UPDATE SET hash = EXCLUDED.hash
                   RETURNING id",
            )
            .await?;

        let mut ex_row_ids: Vec<(usize, BlockType, String, usize, usize, i64)> = vec![];
        for (block_idx, block_type, block_name, input_idx, map_idx, execution_json, hash) in
            executions
        {
            let r = tx
                .query(
                    "SELECT id FROM block_executions WHERE hash = $1",
                    &[&hash.clone()],
                )
                .await?;

            let row_id: Option<i64> = match r.len() {
                0 => None,
                1 => Some(r[0].get(0)),
                _ => unreachable!(),
            };

            let row_id = match row_id {
                Some(row_id) => row_id,
                None => tx
                    .query_one(&stmt, &[&hash.clone(), &execution_json.clone()])
                    .await?
                    .get(0),
            };

            ex_row_ids.push((
                block_idx.clone(),
                block_type.clone(),
                block_name.clone(),
                input_idx.clone(),
                map_idx.clone(),
                row_id,
            ));
        }

        tx.commit().await?;

        let project_id = project.project_id();
        let run_id = run.run_id().to_string();

        let row_id: i64 = c
            .query_one(
                "SELECT id FROM runs WHERE project = $1 AND run_id = $2 LIMIT 1",
                &[&project_id, &run_id],
            )
            .await?
            .get(0);

        let tx = c.transaction().await?;
        let stmt = tx
            .prepare(
                "INSERT INTO runs_joins \
                   (id, run, \
                    block_idx, block_type, block_name, \
                    input_idx, map_idx, block_execution) \
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7) RETURNING id",
            )
            .await?;

        futures::future::join_all(ex_row_ids.iter().map(
            |(block_idx, block_type, block_name, input_idx, map_idx, ex_row_id)| async {
                tx.query_one(
                    &stmt,
                    &[
                        &row_id,
                        &(block_idx.clone() as i64),
                        &block_type.to_string(),
                        block_name,
                        &(input_idx.clone() as i64),
                        &(map_idx.clone() as i64),
                        ex_row_id,
                    ],
                )
                .await?;
                Ok(())
            },
        ))
        .await
        .into_iter()
        .collect::<Result<Vec<_>>>()?;

        tx.commit().await?;

        Ok(())
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
        let c = pool.get().await?;

        // Check that the run_id exists
        let r = c
            .query(
                "SELECT id, created, run_type, app_hash, config_json, status_json FROM runs
                   WHERE project = $1 AND run_id = $2",
                &[&project_id, &run_id],
            )
            .await?;

        let d: Option<(i64, i64, String, String, String, String)> = match r.len() {
            0 => None,
            1 => Some((
                r[0].get(0),
                r[0].get(1),
                r[0].get(2),
                r[0].get(3),
                r[0].get(4),
                r[0].get(5),
            )),
            _ => unreachable!(),
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
                let stmt = c
                    .prepare(
                        "SELECT \
                           runs_joins.block_idx, runs_joins.block_type, runs_joins.block_name, \
                           runs_joins.input_idx, runs_joins.map_idx, block_executions.execution \
                           FROM block_executions \
                           INNER JOIN runs_joins \
                           ON block_executions.id = runs_joins.block_execution \
                           WHERE runs_joins.run = $1",
                    )
                    .await?;
                let rows = c.query(&stmt, &[&row_id]).await?;

                rows.iter()
                    .map(|row| {
                        let block_idx: i64 = row.get(0);
                        let b: String = row.get(1);
                        let block_type: BlockType = BlockType::from_str(&b)?;
                        let block_name: String = row.get(2);
                        let input_idx: i64 = row.get(3);
                        let map_idx: i64 = row.get(4);
                        let execution_data: String = row.get(5);
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
                            block_idx as usize,
                            block_type,
                            block_name,
                            input_idx as usize,
                            map_idx as usize,
                            execution,
                        ));
                        if (block_idx + 1) > block_count {
                            block_count = block_idx + 1;
                        }
                        Ok(())
                    })
                    .collect::<Result<Vec<_>>>()?;
            }
            Some(block) => {
                match block {
                    None => (),
                    Some((block_type, block_name)) => {
                        // Retrieve data points through datasets_joins for one block
                        let stmt = c
                            .prepare(
                                "SELECT \
                            runs_joins.block_idx, runs_joins.block_type, runs_joins.block_name, \
                            runs_joins.input_idx, runs_joins.map_idx, block_executions.execution \
                            FROM block_executions \
                            INNER JOIN runs_joins \
                            ON block_executions.id = runs_joins.block_execution \
                            WHERE runs_joins.run = $1 AND block_type = $2 AND block_name = $3",
                            )
                            .await?;
                        let rows = c
                            .query(&stmt, &[&row_id, &block_type.to_string(), &block_name])
                            .await?;
                        rows.iter()
                            .map(|row| {
                                let block_idx: i64 = row.get(0);
                                let b: String = row.get(1);
                                let block_type: BlockType = BlockType::from_str(&b)?;
                                let block_name: String = row.get(2);
                                let input_idx: i64 = row.get(3);
                                let map_idx: i64 = row.get(4);
                                let execution_data: String = row.get(5);
                                let execution: BlockExecution =
                                    serde_json::from_str(&execution_data)?;
                                data.push((
                                    block_idx as usize,
                                    block_type,
                                    block_name,
                                    input_idx as usize,
                                    map_idx as usize,
                                    execution,
                                ));
                                if (block_idx + 1) > block_count {
                                    block_count = block_idx + 1;
                                }
                                Ok(())
                            })
                            .collect::<Result<Vec<_>>>()?;
                    }
                }
            }
        }

        let mut input_counts: Vec<usize> = vec![0; block_count as usize];
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
        let mut traces: Vec<Option<(BlockType, String, Vec<Option<Vec<Option<BlockExecution>>>>)>> =
            vec![None; block_count as usize];
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
            created as u64,
            run_type,
            &app_hash,
            &run_config,
            &run_status,
            traces,
        )))
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
        let c = pool.get().await?;
        // Retrieve generations.
        let stmt = c
            .prepare("SELECT created, response FROM cache WHERE project = $1 AND hash = $2")
            .await?;
        let rows = c.query(&stmt, &[&project_id, &hash]).await?;
        let mut generations = rows
            .iter()
            .map(|row| {
                let created: i64 = row.get(0);
                let generation_data: String = row.get(1);
                let generation: LLMGeneration = serde_json::from_str(&generation_data)?;
                Ok((created as u64, generation))
            })
            .collect::<Result<Vec<_>>>()?;
        // Latest first.
        generations.sort_by(|a, b| b.0.cmp(&a.0));

        Ok(generations.into_iter().map(|(_, g)| g).collect::<Vec<_>>())
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
        let c = pool.get().await?;
        let stmt = c
            .prepare(
                "INSERT INTO cache (id, project, created, hash, request, response)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5) RETURNING id",
            )
            .await?;
        let created = generation.created as i64;
        let request_data = serde_json::to_string(&request)?;
        let generation_data = serde_json::to_string(&generation)?;
        c.query_one(
            &stmt,
            &[
                &project_id,
                &created,
                &request.hash().to_string(),
                &request_data,
                &generation_data,
            ],
        )
        .await?;
        Ok(())
    }

    async fn llm_chat_cache_get(
        &self,
        project: &Project,
        request: &LLMChatRequest,
    ) -> Result<Vec<LLMChatGeneration>> {
        let project_id = project.project_id();
        let hash = request.hash().to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;
        // Retrieve generations.
        let stmt = c
            .prepare("SELECT created, response FROM cache WHERE project = $1 AND hash = $2")
            .await?;
        let rows = c.query(&stmt, &[&project_id, &hash]).await?;
        let mut generations = rows
            .iter()
            .map(|row| {
                let created: i64 = row.get(0);
                let generation_data: String = row.get(1);
                let generation: LLMChatGeneration = serde_json::from_str(&generation_data)?;
                Ok((created as u64, generation))
            })
            .collect::<Result<Vec<_>>>()?;
        // Latest first.
        generations.sort_by(|a, b| b.0.cmp(&a.0));

        Ok(generations.into_iter().map(|(_, g)| g).collect::<Vec<_>>())
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
        let c = pool.get().await?;
        let stmt = c
            .prepare(
                "INSERT INTO cache (id, project, created, hash, request, response)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5) RETURNING id",
            )
            .await?;
        let created = generation.created as i64;
        let request_data = serde_json::to_string(&request)?;
        let generation_data = serde_json::to_string(&generation)?;
        c.query_one(
            &stmt,
            &[
                &project_id,
                &created,
                &request.hash().to_string(),
                &request_data,
                &generation_data,
            ],
        )
        .await?;
        Ok(())
    }

    async fn embedder_cache_get(
        &self,
        project: &Project,
        request: &EmbedderRequest,
    ) -> Result<Vec<EmbedderVector>> {
        let project_id = project.project_id();
        let hash = request.hash().to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;
        // Retrieve generations.
        let stmt = c
            .prepare("SELECT created, response FROM cache WHERE project = $1 AND hash = $2")
            .await?;
        let rows = c.query(&stmt, &[&project_id, &hash]).await?;
        let mut embeddings = rows
            .iter()
            .map(|row| {
                let created: i64 = row.get(0);
                let embedding_data: String = row.get(1);
                let embedding: EmbedderVector = serde_json::from_str(&embedding_data)?;
                Ok((created as u64, embedding))
            })
            .collect::<Result<Vec<_>>>()?;
        // Latest first.
        embeddings.sort_by(|a, b| b.0.cmp(&a.0));

        Ok(embeddings.into_iter().map(|(_, g)| g).collect::<Vec<_>>())
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
        let c = pool.get().await?;
        let stmt = c
            .prepare(
                "INSERT INTO cache (id, project, created, hash, request, response)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5) RETURNING id",
            )
            .await?;
        let created = embedding.created as i64;
        let request_data = serde_json::to_string(&request)?;
        let embedding_data = serde_json::to_string(&embedding)?;
        c.query_one(
            &stmt,
            &[
                &project_id,
                &created,
                &request.hash().to_string(),
                &request_data,
                &embedding_data,
            ],
        )
        .await?;
        Ok(())
    }

    async fn http_cache_get(
        &self,
        project: &Project,
        request: &HttpRequest,
    ) -> Result<Vec<HttpResponse>> {
        let project_id = project.project_id();
        let hash = request.hash().to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;
        // Retrieve responses.
        let stmt = c
            .prepare("SELECT created, response FROM cache WHERE project = $1 AND hash = $2")
            .await?;
        let rows = c.query(&stmt, &[&project_id, &hash]).await?;
        let mut responses = rows
            .iter()
            .map(|row| {
                let created: i64 = row.get(0);
                let response_data: String = row.get(1);
                let response: HttpResponse = serde_json::from_str(&response_data)?;
                Ok((created as u64, response))
            })
            .collect::<Result<Vec<_>>>()?;
        // Latest first.
        responses.sort_by(|a, b| b.0.cmp(&a.0));

        Ok(responses.into_iter().map(|(_, g)| g).collect::<Vec<_>>())
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
        let c = pool.get().await?;
        let stmt = c
            .prepare(
                "INSERT INTO cache (id, project, created, hash, request, response)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5) RETURNING id",
            )
            .await?;
        let created = response.created as i64;
        let request_data = serde_json::to_string(&request)?;
        let response_data = serde_json::to_string(&response)?;
        c.query_one(
            &stmt,
            &[
                &project_id,
                &created,
                &request.hash().to_string(),
                &request_data,
                &response_data,
            ],
        )
        .await?;
        Ok(())
    }

    fn clone_box(&self) -> Box<dyn Store + Sync + Send> {
        Box::new(self.clone())
    }
}
