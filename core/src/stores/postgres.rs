use anyhow::{anyhow, Result};
use async_trait::async_trait;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use futures::future::try_join_all;
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::hash::Hash;
use std::hash::Hasher;
use std::str::FromStr;
use tokio_postgres::types::ToSql;
use tokio_postgres::{NoTls, Transaction};
use tracing::info;

use crate::data_sources::data_source::DocumentStatus;
use crate::data_sources::node::{Node, NodeESDocument, NodeType, ProviderVisibility};
use crate::search_filter::Filterable;
use crate::{
    blocks::block::BlockType,
    cached_request::CachedRequest,
    consts::DATA_SOURCE_DOCUMENT_SYSTEM_TAG_PREFIX,
    data_sources::data_source::{DataSource, DataSourceConfig, Document, DocumentVersion},
    data_sources::folder::Folder,
    databases::{
        table::{get_table_unique_id, Table},
        table_schema::TableSchema,
        transient_database::TransientDatabase,
    },
    dataset::Dataset,
    http::request::{HttpRequest, HttpResponse},
    project::Project,
    providers::{
        embedder::{EmbedderRequest, EmbedderVector},
        llm::{LLMChatGeneration, LLMChatRequest, LLMGeneration, LLMRequest},
    },
    run::{BlockExecution, Run, RunConfig, RunStatus, RunType},
    search_filter::SearchFilter,
    sqlite_workers::client::SqliteWorker,
    stores::store::{Store, POSTGRES_TABLES, SQL_FUNCTIONS, SQL_INDEXES},
    utils,
};

use super::store::{DocumentCreateParams, FolderUpsertParams, TableUpsertParams};

#[derive(Clone)]
pub struct PostgresStore {
    pool: Pool<PostgresConnectionManager<NoTls>>,
}

pub struct UpsertNode<'a> {
    pub node_id: &'a str,
    pub node_type: &'a NodeType,
    pub timestamp: u64,
    pub title: &'a str,
    pub mime_type: &'a str,
    pub provider_visibility: &'a Option<ProviderVisibility>,
    pub parents: &'a Vec<String>,
    pub source_url: &'a Option<String>,
    pub tags: &'a Vec<String>,
    pub text_size: &'a Option<i64>,
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

        for f in SQL_FUNCTIONS {
            match c.execute(f, &[]).await {
                Err(e) => Err(e)?,
                Ok(_) => {}
            }
        }

        Ok(())
    }

    fn where_clauses_and_params_for_filter<'a>(
        filter: &'a Option<SearchFilter>,
        tags_column: &str,
        parents_column: &str,
        timestamp_column: &str,
        from_idx: usize,
    ) -> (Vec<String>, Vec<&'a (dyn ToSql + Sync)>, usize) {
        let mut where_clauses: Vec<String> = vec![];
        let mut params: Vec<&'a (dyn ToSql + Sync)> = vec![];
        let mut p_idx: usize = from_idx;

        if let Some(filter) = filter {
            if let Some(tags_filter) = &filter.tags {
                if let Some(tags) = &tags_filter.is_in {
                    where_clauses.push(format!("{} && ${}", tags_column, p_idx));
                    params.push(tags as &(dyn ToSql + Sync));
                    p_idx += 1;
                }
                if let Some(tags) = &tags_filter.is_not {
                    where_clauses.push(format!("NOT {} && ${}", tags_column, p_idx));
                    params.push(tags as &(dyn ToSql + Sync));
                    p_idx += 1;
                }
            }

            if let Some(parents_filter) = &filter.parents {
                if let Some(parents) = &parents_filter.is_in {
                    where_clauses.push(format!("{} && ${}", parents_column, p_idx));
                    params.push(parents as &(dyn ToSql + Sync));
                    p_idx += 1;
                }
                if let Some(parents) = &parents_filter.is_not {
                    where_clauses.push(format!("NOT {} && ${}", parents_column, p_idx));
                    params.push(parents as &(dyn ToSql + Sync));
                    p_idx += 1;
                }
            }

            if let Some(ts_filter) = &filter.timestamp {
                if let Some(ts) = ts_filter.gt.as_ref() {
                    where_clauses.push(format!("{} > ${}", timestamp_column, p_idx));
                    params.push(ts as &(dyn ToSql + Sync));
                    p_idx += 1;
                }
                if let Some(ts) = ts_filter.lt.as_ref() {
                    where_clauses.push(format!("{} < ${}", timestamp_column, p_idx));
                    params.push(ts as &(dyn ToSql + Sync));
                    p_idx += 1;
                }
            }
        }

        (where_clauses, params, p_idx)
    }

    async fn upsert_data_source_node(
        &self,
        upsert_params: UpsertNode<'_>,
        data_source_row_id: i64,
        row_id: i64,
        tx: &Transaction<'_>,
    ) -> Result<()> {
        let created = utils::now();

        let (document_row_id, table_row_id, folder_row_id) = match upsert_params.node_type {
            NodeType::Document => (Some(row_id), None, None),
            NodeType::Table => (None, Some(row_id), None),
            NodeType::Folder => (None, None, Some(row_id)),
        };

        let stmt = tx
            .prepare(
                "INSERT INTO data_sources_nodes \
                  (id, data_source, created, node_id, timestamp, title, mime_type, provider_visibility, parents, source_url, tags_array, \
                   document, \"table\", folder, text_size) \
                  VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) \
                  ON CONFLICT (data_source, node_id) DO UPDATE \
                  SET timestamp = EXCLUDED.timestamp, title = EXCLUDED.title, \
                    mime_type = EXCLUDED.mime_type, parents = EXCLUDED.parents, \
                    document = EXCLUDED.document, \"table\" = EXCLUDED.\"table\", \
                    folder = EXCLUDED.folder, source_url = EXCLUDED.source_url, \
                    tags_array = EXCLUDED.tags_array, provider_visibility = EXCLUDED.provider_visibility, \
                    text_size = EXCLUDED.text_size \
                  RETURNING id",
            )
            .await?;

        let _ = tx
            .query_one(
                &stmt,
                &[
                    &data_source_row_id,
                    &(created as i64),
                    &upsert_params.node_id,
                    &(upsert_params.timestamp as i64),
                    &upsert_params.title,
                    &upsert_params.mime_type,
                    &upsert_params.provider_visibility,
                    &upsert_params.parents,
                    &upsert_params.source_url,
                    &upsert_params.tags,
                    &document_row_id,
                    &table_row_id,
                    &folder_row_id,
                    &upsert_params.text_size,
                ],
            )
            .await?;
        Ok(())
    }
}

#[async_trait]
impl Store for PostgresStore {
    fn raw_pool(&self) -> &Pool<PostgresConnectionManager<NoTls>> {
        return &self.pool;
    }

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

    async fn delete_project(&self, project: &Project) -> Result<()> {
        let project_id = project.project_id();
        let pool = self.pool.clone();
        let mut c = pool.get().await?;
        let tx = c.transaction().await?;

        // Datasets joins & Datasets points & Datasets: we execute a SQL function
        tx.execute("SELECT delete_project_datasets($1)", &[&project_id])
            .await?;

        // Cache, Specifications & Project
        tx.execute("DELETE FROM cache WHERE project = $1", &[&project_id])
            .await?;
        tx.execute(
            "DELETE FROM specifications WHERE project = $1",
            &[&project_id],
        )
        .await?;
        tx.execute("DELETE FROM projects WHERE id = $1", &[&project_id])
            .await?;

        // Execute transaction.
        tx.commit().await?;
        Ok(())
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

        // Check that the dataset_id and hash exist.
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

        // Retrieve data points through datasets_joins.
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

    async fn list_specification_hashes(&self, project: &Project) -> Result<Vec<String>> {
        let project_id = project.project_id();

        let pool = &self.pool;
        let c = pool.get().await?;
        let r = c
            .query(
                "SELECT hash FROM specifications WHERE project = $1 ORDER BY created",
                &[&project_id],
            )
            .await?;

        Ok(r.into_iter().map(|r| r.get(0)).collect())
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

    async fn load_runs(
        &self,
        project: &Project,
        run_ids: Vec<String>,
    ) -> Result<HashMap<String, Run>> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare(
                "SELECT run_id, created, app_hash, config_json, status_json, run_type FROM runs
                WHERE project = $1 AND run_id = any($2)",
            )
            .await?;

        let rows = c.query(&stmt, &[&project.project_id(), &run_ids]).await?;

        let runs: Vec<Run> = rows
            .iter()
            .map(|row| {
                let run_id: String = row.get(0);
                let created: i64 = row.get(1);
                let app_hash: String = row.get(2);
                let config_data: String = row.get(3);
                let status_data: String = row.get(4);
                let run_type_str: String = row.get(5);
                let run_type = RunType::from_str(&run_type_str)?;
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

        let runs_map = runs
            .into_iter()
            .map(|r| (r.run_id().to_string(), r))
            .collect();

        Ok(runs_map)
    }

    async fn delete_run(&self, project: &Project, run_id: &str) -> Result<()> {
        let project_id = project.project_id();
        let run_id = run_id.to_string();
        let pool = self.pool.clone();
        let mut c = pool.get().await?;
        let tx = c.transaction().await?;

        tx.execute("SELECT delete_run($1, $2)", &[&project_id, &run_id])
            .await?;
        tx.commit().await?;
        Ok(())
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
        store_blocks_results: bool,
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
                                let execution_json = match store_blocks_results {
                                    true => serde_json::to_string(&execution)?,
                                    false => serde_json::to_string(
                                        &(BlockExecution {
                                            value: None,
                                            error: execution.error.clone(),
                                            meta: execution.meta.clone(),
                                        }),
                                    )?,
                                };
                                Ok((
                                    block_idx,
                                    block_type.clone(),
                                    block_name.clone(),
                                    input_idx,
                                    map_idx,
                                    execution_json,
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
                "INSERT INTO block_executions (id, execution, project, created) \
                   VALUES (DEFAULT, $1, $2, $3) RETURNING id",
            )
            .await?;

        let mut ex_row_ids: Vec<(usize, BlockType, String, usize, usize, i64)> = vec![];
        for (block_idx, block_type, block_name, input_idx, map_idx, execution_json) in executions {
            let created = utils::now() as i64;

            let row_id = tx
                .query_one(
                    &stmt,
                    &[
                        &execution_json.clone(),
                        &project.project_id().clone(),
                        &created,
                    ],
                )
                .await?
                .get(0);

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
                // Retrieve data points through datasets_joins.
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
                        // Retrieve data points through datasets_joins for one block.
                        let stmt = c
                            .prepare(
                                "SELECT \
                                   runs_joins.block_idx, runs_joins.block_type, \
                                   runs_joins.block_name, runs_joins.input_idx, \
                                   runs_joins.map_idx, block_executions.execution \
                                   FROM block_executions \
                                   INNER JOIN runs_joins \
                                   ON block_executions.id = runs_joins.block_execution \
                                   WHERE runs_joins.run = $1 AND block_type = $2 \
                                   AND block_name = $3",
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
        let project_id = project.project_id();
        let data_source_config = ds.config().clone();
        let data_source_created = ds.created();
        let data_source_id = ds.data_source_id().to_string();
        let data_source_internal_id = ds.internal_id().to_string();
        let data_source_name = ds.name().to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // Create DataSource.
        let config_data = serde_json::to_string(&data_source_config)?;
        let stmt = c
            .prepare(
                "INSERT INTO data_sources \
                   (id, project, created, data_source_id, internal_id, config_json, name) \
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6) RETURNING id",
            )
            .await?;
        c.query_one(
            &stmt,
            &[
                &project_id,
                &(data_source_created as i64),
                &data_source_id,
                &data_source_internal_id,
                &config_data,
                &data_source_name,
            ],
        )
        .await?;

        Ok(())
    }

    async fn has_data_sources(&self, project: &Project) -> Result<bool> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare("SELECT id FROM data_sources WHERE project = $1 LIMIT 1")
            .await?;
        let r = c.query(&stmt, &[&project_id]).await?;

        Ok(r.len() > 0)
    }

    async fn load_data_source(
        &self,
        project: &Project,
        data_source_id: &str,
    ) -> Result<Option<DataSource>> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query(
                "SELECT id, created, internal_id, config_json, name FROM data_sources
                   WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let d: Option<(i64, i64, String, String, Option<String>)> = match r.len() {
            0 => None,
            1 => Some((
                r[0].get(0),
                r[0].get(1),
                r[0].get(2),
                r[0].get(3),
                r[0].get(4),
            )),
            _ => unreachable!(),
        };

        match d {
            None => Ok(None),
            Some((_, created, internal_id, config_data, name)) => {
                let data_source_config: DataSourceConfig = serde_json::from_str(&config_data)?;
                Ok(Some(DataSource::new_from_store(
                    &Project::new_from_id(project_id),
                    created as u64,
                    &data_source_id,
                    &internal_id,
                    &data_source_config,
                    // TODO(keyword-search) Remove this once name has been backfilled.
                    &name.unwrap_or("".to_string()),
                )))
            }
        }
    }

    async fn load_data_sources(
        &self,
        project_data_sources: Vec<(i64, String)>,
    ) -> Result<Vec<DataSource>> {
        if project_data_sources.is_empty() {
            return Ok(vec![]);
        }

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // Build the query dynamically based on the number of project_data_sources
        let placeholders: Vec<String> = (0..project_data_sources.len())
            .map(|i| format!("(${}, ${})", i * 2 + 1, i * 2 + 2))
            .collect();
        let query = format!(
            "SELECT project, id, created, internal_id, config_json, name, data_source_id FROM data_sources 
             WHERE (project, data_source_id) IN ({})",
            placeholders.join(", ")
        );
        info!(query);

        // Prepare parameters: alternating project_id and data_source_id
        let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = vec![];
        for (project_id, data_source_id) in &project_data_sources {
            params.push(project_id);
            params.push(data_source_id);
        }

        let r = c.query(&query, &params[..]).await?;

        let mut data_sources = Vec::new();
        for row in r {
            let project_id: i64 = row.get(0);
            let created: i64 = row.get(2);
            let internal_id: String = row.get(3);
            let config_data: String = row.get(4);
            let name: Option<String> = row.get(5);
            let data_source_id: String = row.get(6);

            let data_source_config: DataSourceConfig = serde_json::from_str(&config_data)?;
            data_sources.push(DataSource::new_from_store(
                &Project::new_from_id(project_id),
                created as u64,
                &data_source_id,
                &internal_id,
                &data_source_config,
                // TODO(keyword-search) Remove this once name has been backfilled.
                &name.unwrap_or("".to_string()),
            ));
        }

        Ok(data_sources)
    }

    async fn load_data_source_by_internal_id(
        &self,
        data_source_internal_id: &str,
    ) -> Result<Option<DataSource>> {
        let data_source_internal_id = data_source_internal_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query(
                "SELECT id, created, project, data_source_id, config_json, name FROM data_sources
                   WHERE internal_id = $1 LIMIT 1",
                &[&data_source_internal_id],
            )
            .await?;

        let d: Option<(i64, i64, i64, String, String, Option<String>)> = match r.len() {
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

        match d {
            None => Ok(None),
            Some((_, created, project_id, data_source_id, config_data, name)) => {
                let data_source_config: DataSourceConfig = serde_json::from_str(&config_data)?;
                Ok(Some(DataSource::new_from_store(
                    &Project::new_from_id(project_id),
                    created as u64,
                    &data_source_id,
                    &data_source_internal_id,
                    &data_source_config,
                    // TODO(keyword-search) Remove this once name has been backfilled.
                    &name.unwrap_or("".to_string()),
                )))
            }
        }
    }

    async fn update_data_source_config(
        &self,
        project: &Project,
        data_source_id: &str,
        config: &DataSourceConfig,
    ) -> Result<()> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let data_source_config = config.clone();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let config_data = serde_json::to_string(&data_source_config)?;
        let stmt = c
            .prepare(
                "UPDATE data_sources SET config_json = $1 \
                   WHERE project = $2 AND data_source_id = $3",
            )
            .await?;
        c.execute(&stmt, &[&config_data, &project_id, &data_source_id])
            .await?;

        Ok(())
    }

    async fn update_data_source_name(
        &self,
        project: &Project,
        data_source_id: &str,
        name: &str,
    ) -> Result<()> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let name = name.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare(
                "UPDATE data_sources SET name = $1 \
                   WHERE project = $2 AND data_source_id = $3",
            )
            .await?;
        c.execute(&stmt, &[&name, &project_id, &data_source_id])
            .await?;

        Ok(())
    }

    async fn load_data_source_document(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        version_hash: &Option<String>,
    ) -> Result<Option<Document>> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let document_id = document_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };
        // TODO(Thomas-020425): Read tags from nodes table.
        let r = match version_hash {
            None => {
                c.query(
                    "SELECT dsd.id, dsd.created, dsd.timestamp, dsn.tags_array, dsn.parents, \
                       dsn.source_url, dsd.hash, dsd.text_size, dsd.chunk_count, dsn.title, \
                       dsn.mime_type, dsn.provider_visibility \
                       FROM data_sources_documents dsd \
                       INNER JOIN data_sources_nodes dsn ON dsn.document=dsd.id \
                       WHERE dsd.data_source = $1 AND dsd.document_id = $2 \
                       AND dsd.status='latest' LIMIT 1",
                    &[&data_source_row_id, &document_id],
                )
                .await?
            }
            Some(version_hash) => {
                c.query(
                    "SELECT dsd.id, dsd.created, dsd.timestamp, dsn.tags_array, dsn.parents, \
                       dsn.source_url, dsd.hash, dsd.text_size, dsd.chunk_count, dsn.title, \
                       dsn.mime_type, dsn.provider_visibility \
                       FROM data_sources_documents dsd \
                       INNER JOIN data_sources_nodes dsn ON dsn.document=dsd.id \
                       WHERE dsd.data_source = $1 AND dsd.document_id = $2 \
                       AND dsd.hash = $3 LIMIT 1",
                    &[&data_source_row_id, &document_id, &version_hash],
                )
                .await?
            }
        };

        let d: Option<(
            i64,
            i64,
            i64,
            Vec<String>,
            Vec<String>,
            Option<String>,
            String,
            i64,
            i64,
            Option<String>,
            Option<String>,
            Option<ProviderVisibility>,
        )> = match r.len() {
            0 => None,
            1 => Some((
                r[0].get(0),
                r[0].get(1),
                r[0].get(2),
                r[0].get(3),
                r[0].get(4),
                r[0].get(5),
                r[0].get(6),
                r[0].get(7),
                r[0].get(8),
                r[0].get(9),
                r[0].get(10),
                r[0].get(11),
            )),
            _ => unreachable!(),
        };

        match d {
            None => Ok(None),
            Some((
                _,
                created,
                timestamp,
                tags,
                parents,
                source_url,
                hash,
                text_size,
                chunk_count,
                node_title,
                node_mime_type,
                node_provider_visibility,
            )) => Ok(Some(Document {
                data_source_id: data_source_id.clone(),
                data_source_internal_id: data_source_internal_id.clone(),
                created: created as u64,
                timestamp: timestamp as u64,
                title: node_title.unwrap_or(document_id.clone()),
                document_id,
                tags,
                mime_type: node_mime_type.unwrap_or("application/octet-stream".to_string()),
                provider_visibility: node_provider_visibility,
                parent_id: parents.get(1).cloned(),
                parents,
                source_url,
                hash,
                text_size: text_size as u64,
                chunk_count: chunk_count as usize,
                chunks: vec![],
                text: None,
                token_count: None,
            })),
        }
    }

    async fn update_data_source_node_parents(
        &self,
        project: &Project,
        data_source_id: &str,
        node_id: &str,
        parents: &Vec<String>,
    ) -> Result<()> {
        let node_id = node_id.to_string();
        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();

        let r = c
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        let tx = c.transaction().await?;

        // Update parents on nodes table.
        tx.execute(
            "UPDATE data_sources_nodes SET parents = $1 \
            WHERE data_source = $2 AND node_id = $3",
            &[&parents, &data_source_row_id, &node_id],
        )
        .await?;

        tx.commit().await?;

        Ok(())
    }

    async fn update_data_source_document_chunk_count(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        chunk_count: u64,
    ) -> Result<()> {
        let document_id = document_id.to_string();
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();

        let r = c
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        c.execute(
            "UPDATE data_sources_documents SET chunk_count = $1 \
            WHERE data_source = $2 AND document_id = $3 AND status = 'latest'",
            &[&(chunk_count as i64), &data_source_row_id, &document_id],
        )
        .await?;

        Ok(())
    }

    async fn update_data_source_node_tags(
        &self,
        project: &Project,
        data_source_id: &str,
        node_id: &str,
        add_tags: &Vec<String>,
        remove_tags: &Vec<String>,
    ) -> Result<Vec<String>> {
        let node_id = node_id.to_string();
        let pool = self.pool.clone();
        let mut c = pool.get().await?;
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();

        let r = c
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        let tx = c.transaction().await?;

        // Get current tags and put them into a set.
        let current_tags_result = tx
            .query(
                "SELECT tags_array FROM data_sources_nodes WHERE data_source = $1 \
                   AND node_id = $2 FOR UPDATE",
                &[&data_source_row_id, &node_id],
            )
            .await?;
        let mut current_tags: HashSet<String> = match current_tags_result.len() {
            0 => Err(anyhow!("Unknown Node: {}", node_id))?,
            _ => {
                let tags_vec: Vec<String> = current_tags_result[0].get(0);
                tags_vec.into_iter().collect()
            }
        };

        // Update the set of tags based on the add and remove lists.
        for tag in add_tags {
            current_tags.insert(tag.clone());
        }
        for tag in remove_tags {
            current_tags.remove(tag);
        }

        let updated_tags_vec: Vec<String> = current_tags.into_iter().collect();
        tx.execute(
            "UPDATE data_sources_nodes SET tags_array = $1 \
                WHERE data_source = $2 AND node_id = $3",
            &[&updated_tags_vec, &data_source_row_id, &node_id],
        )
        .await?;

        tx.commit().await?;

        Ok(updated_tags_vec)
    }

    async fn list_data_source_document_versions(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        limit_offset: Option<(usize, usize)>,
        view_filter: &Option<SearchFilter>,
        latest_hash: &Option<String>,
        include_count: bool,
    ) -> Result<(Vec<DocumentVersion>, usize)> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let document_id = document_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        // The `created` timestamp of the version specified by `latest_hash`
        // (if `latest_hash` is `None`, then this is the latest version's `created` timestamp).
        let latest_hash_created: i64 = match latest_hash {
            Some(latest_hash) => {
                let stmt = c
                    .prepare(
                        "SELECT created FROM data_sources_documents \
                           WHERE data_source = $1 AND document_id = $2 AND hash = $3 LIMIT 1",
                    )
                    .await?;
                let r = c
                    .query(&stmt, &[&data_source_row_id, &document_id, &latest_hash])
                    .await?;
                match r.len() {
                    0 => Err(anyhow!("Unknown document hash"))?,
                    1 => r[0].get(0),
                    _ => unreachable!(),
                }
            }

            // Get the latest version's created timestamp (accepting deleted versions).
            None => {
                let stmt = c
                    .prepare(
                        "SELECT created FROM data_sources_documents \
                           WHERE data_source = $1 AND document_id = $2 \
                           ORDER BY created DESC LIMIT 1",
                    )
                    .await?;
                let r = c.query(&stmt, &[&data_source_row_id, &document_id]).await?;
                match r.len() {
                    // If no hash was specified and there are no versions, just return an empty
                    // array.
                    0 => return Ok((vec![], 0)),
                    1 => r[0].get(0),
                    _ => unreachable!(),
                }
            }
        };

        let mut where_clauses: Vec<String> = vec![];
        let mut params: Vec<&(dyn ToSql + Sync)> = vec![];

        where_clauses.push("dsd.data_source = $1".to_string());
        params.push(&data_source_row_id);
        where_clauses.push("dsd.document_id = $2".to_string());
        params.push(&document_id);
        where_clauses.push("dsd.created <= $3".to_string());
        params.push(&latest_hash_created);

        let (filter_clauses, filter_params, p_idx) = Self::where_clauses_and_params_for_filter(
            view_filter,
            "dsn.tags_array",
            "dsn.parents",
            "dsd.timestamp",
            params.len() + 1,
        );

        where_clauses.extend(filter_clauses);
        params.extend(filter_params);

        let sql = format!(
            "SELECT dsd.hash, dsd.created, dsd.status \
               FROM data_sources_documents dsd \
               INNER JOIN data_sources_nodes dsn ON dsn.document=dsd.id \
               WHERE {} ORDER BY created DESC",
            where_clauses.join(" AND ")
        );

        let rows = match limit_offset {
            None => {
                let stmt = c.prepare(&sql).await?;
                c.query(&stmt, &params).await?
            }
            Some((limit, offset)) => {
                let limit = limit as i64;
                let offset = offset as i64;

                let mut params = params.clone();
                params.push(&limit);
                params.push(&offset);

                let stmt = c
                    .prepare(&(sql + &format!(" LIMIT ${} OFFSET ${}", p_idx, p_idx + 1)))
                    .await?;
                c.query(&stmt, &params).await?
            }
        };

        let mut versions: Vec<DocumentVersion> = vec![];
        for row in rows {
            let hash: String = row.get(0);
            let created: i64 = row.get(1);
            let status_str: String = row.get(2);
            let status = DocumentStatus::from_str(&status_str)?;

            versions.push(DocumentVersion {
                hash,
                created: created as u64,
                status,
            });
        }

        let total = if include_count {
            match limit_offset {
                None => versions.len(),
                Some(_) => {
                    let stmt = c
                        .prepare(
                            format!(
                                "SELECT COUNT(*) FROM data_sources_documents dsd \
                                INNER JOIN data_sources_nodes dsn ON dsn.document=dsd.id \
                                WHERE {}",
                                where_clauses.join(" AND ")
                            )
                            .as_str(),
                        )
                        .await?;
                    let t: i64 = c.query_one(&stmt, &params).await?.get(0);
                    t as usize
                }
            }
        } else {
            0
        };

        Ok((versions, total))
    }

    async fn find_data_source_document_ids(
        &self,
        project: &Project,
        data_source_id: &str,
        filter: &Option<SearchFilter>,
        view_filter: &Option<SearchFilter>,
        limit_offset: Option<(usize, usize)>,
        include_count: bool,
    ) -> Result<(Vec<String>, usize)> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let project_id = project.project_id().clone();

        let mut where_clauses: Vec<String> = vec![];
        let mut params: Vec<&(dyn ToSql + Sync)> = vec![];

        let r = c
            .query_one(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2",
                &[&project_id, &data_source_id],
            )
            .await?;

        let data_source_row_id: i64 = r.get(0);

        where_clauses.push("dsd.data_source = $1".to_string());
        params.push(&data_source_row_id);
        where_clauses.push("dsd.status = 'latest'".to_string());

        let (filter_clauses, filter_params, p_idx) = Self::where_clauses_and_params_for_filter(
            filter,
            "dsn.tags_array",
            "dsn.parents",
            "dsd.timestamp",
            params.len() + 1,
        );

        where_clauses.extend(filter_clauses);
        params.extend(filter_params);

        let (view_filter_clauses, view_filter_params, p_idx) =
            Self::where_clauses_and_params_for_filter(
                view_filter,
                "dsn.tags_array",
                "dsn.parents",
                "dsd.timestamp",
                p_idx,
            );

        where_clauses.extend(view_filter_clauses);
        params.extend(view_filter_params);

        // compute the total count
        let count = if include_count {
            let count_query = format!(
                "SELECT COUNT(*) \
                   FROM data_sources_documents dsd \
                   INNER JOIN data_sources_nodes dsn ON dsn.document=dsd.id \
                   WHERE {}",
                where_clauses.join(" AND ")
            );
            let count: i64 = c.query_one(&count_query, &params).await?.get(0);
            count as usize
        } else {
            0
        };

        let mut query = format!(
            "SELECT document_id FROM data_sources_documents dsd \
              INNER JOIN data_sources_nodes dsn ON dsn.document=dsd.id \
              WHERE {} ORDER BY dsd.timestamp DESC",
            where_clauses.join(" AND ")
        );

        let limit: i64;
        let offset: i64;

        if let Some((l, o)) = limit_offset {
            query = query + &format!(" LIMIT ${} OFFSET ${}", p_idx, p_idx + 1);
            limit = l as i64;
            offset = o as i64;
            params.push(&limit);
            params.push(&offset);
        }

        let rows = c.query(&query, &params).await?;
        let document_ids: Vec<String> = rows.iter().map(|row| row.get(0)).collect();

        Ok((document_ids, count as usize))
    }

    async fn create_data_source_document(
        &self,
        project: &Project,
        data_source_id: String,
        create_params: DocumentCreateParams,
    ) -> Result<Document> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        let r = c
            .query(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };

        let tx = c.transaction().await?;

        let stmt = tx
            .prepare(
                "UPDATE data_sources_documents SET status = 'superseded' \
                   WHERE data_source = $1 AND document_id = $2 AND status = 'latest'",
            )
            .await?;
        let _ = tx
            .query(&stmt, &[&data_source_row_id, &create_params.document_id])
            .await?;

        let stmt = tx
            .prepare(
                "INSERT INTO data_sources_documents \
                   (id, data_source, created, document_id, timestamp, \
                    hash, text_size, chunk_count, status) \
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, $8) \
                   RETURNING id, created",
            )
            .await?;

        let r = tx
            .query_one(
                &stmt,
                &[
                    &data_source_row_id,
                    &(create_params.created as i64),
                    &create_params.document_id,
                    &(create_params.timestamp as i64),
                    &create_params.hash,
                    &(create_params.text_size as i64),
                    &(create_params.chunk_count as i64),
                    &"latest",
                ],
            )
            .await?;

        let document_row_id: i64 = r.get(0);
        let created: i64 = r.get(1);

        // TODO: defaults
        let title = create_params.title.unwrap_or("".to_string());
        let mime_type = create_params.mime_type.unwrap_or("".to_string());
        let provider_visibility = create_params.provider_visibility;

        let document = Document {
            data_source_id,
            data_source_internal_id: data_source_internal_id.to_string(),
            title,
            mime_type,
            provider_visibility,
            created: created as u64,
            document_id: create_params.document_id,
            timestamp: create_params.timestamp,
            tags: create_params.tags,
            parent_id: create_params.parents.get(1).cloned(),
            parents: create_params.parents,
            source_url: create_params.source_url,
            hash: create_params.hash,
            text_size: create_params.text_size,
            chunk_count: create_params.chunk_count,
            chunks: vec![],
            text: None,
            token_count: None,
        };

        self.upsert_data_source_node(
            UpsertNode {
                node_id: &document.document_id,
                node_type: &NodeType::Document,
                timestamp: document.timestamp,
                title: &document.title,
                mime_type: &document.mime_type,
                provider_visibility: &document.provider_visibility,
                parents: &document.parents,
                source_url: &document.source_url,
                tags: &document.tags,
                text_size: &Some(document.text_size as i64),
            },
            data_source_row_id,
            document_row_id,
            &tx,
        )
        .await?;

        tx.commit().await?;

        Ok(document)
    }

    async fn list_data_source_documents(
        &self,
        project: &Project,
        data_source_id: &str,
        view_filter: &Option<SearchFilter>,
        document_ids: &Option<Vec<String>>,
        limit_offset: Option<(usize, usize)>,
        remove_system_tags: bool,
    ) -> Result<Vec<Document>> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };

        let mut where_clauses: Vec<String> = vec![];
        let mut params: Vec<&(dyn ToSql + Sync)> = vec![];

        where_clauses.push("dsd.data_source = $1".to_string());
        params.push(&data_source_row_id);
        where_clauses.push("dsd.status = 'latest'".to_string());

        let (filter_clauses, filter_params, mut p_idx) = Self::where_clauses_and_params_for_filter(
            view_filter,
            "dsn.tags_array",
            "dsn.parents",
            "dsd.timestamp",
            params.len() + 1,
        );

        where_clauses.extend(filter_clauses);
        params.extend(filter_params);

        // Add document_ids filter if provided.
        if let Some(ref ids) = document_ids {
            // Create a dynamic list of placeholders for the document IDs.
            let id_placeholders: Vec<String> = (0..ids.len())
                .map(|_| {
                    let placeholder = format!("${}", p_idx);
                    p_idx += 1; // Increment p_idx after each document.
                    placeholder
                })
                .collect();

            where_clauses.push(format!(
                "dsd.document_id IN ({})",
                id_placeholders.join(", ")
            ));
            params.extend(ids.iter().map(|id| id as &(dyn ToSql + Sync)));
        }

        let sql = format!(
            "SELECT dsd.id, dsd.created, dsd.document_id, dsd.timestamp, dsn.tags_array, \
               dsn.parents, dsn.source_url, dsd.hash, dsd.text_size, dsd.chunk_count, \
               dsn.title, dsn.mime_type, dsn.provider_visibility \
               FROM data_sources_documents dsd \
               INNER JOIN data_sources_nodes dsn ON dsn.document=dsd.id \
               WHERE {} ORDER BY dsd.timestamp DESC",
            where_clauses.join(" AND "),
        );

        let rows = match limit_offset {
            None => {
                let stmt = c.prepare(&sql).await?;
                c.query(&stmt, &params).await?
            }
            Some((limit, offset)) => {
                let limit = limit as i64;
                let offset = offset as i64;

                let mut params = params.clone();
                params.push(&limit);
                params.push(&offset);

                let stmt = c
                    .prepare(&(sql + &format!(" LIMIT ${} OFFSET ${}", p_idx, p_idx + 1)))
                    .await?;
                c.query(&stmt, &params).await?
            }
        };

        let documents: Vec<Document> = rows
            .iter()
            .map(|r| {
                let created: i64 = r.get(1);
                let document_id: String = r.get(2);
                let timestamp: i64 = r.get(3);
                let tags: Vec<String> = r.get(4);
                let parents: Vec<String> = r.get(5);
                let source_url: Option<String> = r.get(6);
                let hash: String = r.get(7);
                let text_size: i64 = r.get(8);
                let chunk_count: i64 = r.get(9);
                let node_title: Option<String> = r.get(10);
                let node_mime_type: Option<String> = r.get(11);
                let node_provider_visibility: Option<ProviderVisibility> = r.get(12);

                let tags = if remove_system_tags {
                    // Remove tags that are prefixed with the system tag prefix.
                    tags.into_iter()
                        .filter(|t| !t.starts_with(DATA_SOURCE_DOCUMENT_SYSTEM_TAG_PREFIX))
                        .collect()
                } else {
                    tags
                };

                Ok(Document {
                    data_source_id: data_source_id.clone(),
                    data_source_internal_id: data_source_internal_id.clone(),
                    created: created as u64,
                    timestamp: timestamp as u64,
                    title: node_title.unwrap_or(document_id.clone()),
                    mime_type: node_mime_type.unwrap_or("application/octet-stream".to_string()),
                    provider_visibility: node_provider_visibility,
                    document_id,
                    tags,
                    parent_id: parents.get(1).cloned(),
                    parents,
                    source_url,
                    hash,
                    text_size: text_size as u64,
                    chunk_count: chunk_count as usize,
                    chunks: vec![],
                    text: None,
                    token_count: None,
                })
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(documents)
    }

    async fn delete_data_source_document(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
    ) -> Result<()> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let document_id = document_id.to_string();

        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        let tx = c.transaction().await?;

        let r = tx
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        let stmt = tx
            .prepare(
                "DELETE FROM data_sources_nodes \
                   WHERE data_source = $1 AND node_id = $2 AND document IS NOT NULL",
            )
            .await?;
        let _ = tx
            .query(&stmt, &[&data_source_row_id, &document_id])
            .await?;
        let stmt = tx
            .prepare(
                "UPDATE data_sources_documents SET status = 'deleted' \
                   WHERE data_source = $1 AND document_id = $2",
            )
            .await?;
        let _ = tx
            .query(&stmt, &[&data_source_row_id, &document_id])
            .await?;

        tx.commit().await?;

        Ok(())
    }

    async fn delete_data_source_document_version(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        version: &DocumentVersion,
    ) -> Result<()> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let document_id = document_id.to_string();
        let created = version.created as i64;
        let hash = version.hash.clone();
        let status = version.status.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        if status == "active" {
            let stmt = c
                .prepare(
                    "DELETE FROM data_sources_nodes \
                            WHERE data_source = $1 AND node_id = $2 AND document IS NOT NULL",
                )
                .await?;

            let _ = c.query(&stmt, &[&data_source_row_id, &document_id]).await?;
        }

        let stmt = c
            .prepare(
                "DELETE FROM data_sources_documents \
                   WHERE data_source = $1 AND document_id = $2 \
                   AND created = $3 AND hash = $4 AND status=$5",
            )
            .await?;
        let _ = c
            .query(
                &stmt,
                &[&data_source_row_id, &document_id, &created, &hash, &status],
            )
            .await?;

        Ok(())
    }

    async fn delete_data_source(&self, project: &Project, data_source_id: &str) -> Result<u64> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        // Safety sweep for leftover tables/folders and their nodes.
        // In normal flow, tables and folders are deleted earlier (via DataSource::delete),
        // but orphan rows can remain (eg. if list queries skipped them). Ensure removal here
        // to avoid FK violations when deleting the data source row.

        // Delete any remaining table nodes then tables for this data source.
        {
            // Remove nodes referencing tables first to satisfy FK(dsn.table -> tables.id).
            let stmt = c
                .prepare(
                    "DELETE FROM data_sources_nodes WHERE data_source = $1 AND \"table\" IS NOT NULL",
                )
                .await?;
            let _ = c.query(&stmt, &[&data_source_row_id]).await?;

            // Remove any remaining tables rows for this data source.
            let stmt = c
                .prepare("DELETE FROM tables WHERE data_source = $1")
                .await?;
            let _ = c.query(&stmt, &[&data_source_row_id]).await?;
        }

        // Delete any remaining folder nodes then folders for this data source.
        {
            let stmt = c
                .prepare(
                    "DELETE FROM data_sources_nodes WHERE data_source = $1 AND folder IS NOT NULL",
                )
                .await?;
            let _ = c.query(&stmt, &[&data_source_row_id]).await?;

            let stmt = c
                .prepare("DELETE FROM data_sources_folders WHERE data_source = $1")
                .await?;
            let _ = c.query(&stmt, &[&data_source_row_id]).await?;
        }

        // Data source documents can be numerous so we want to avoid any transaction that could
        // potentially hurt the performance of the database. Also we delete documents in small
        // batches to avoid long running operations.
        let deletion_batch_size: u64 = 512;
        let mut total_deleted_rows: u64 = 0;

        let stmt_nodes = c
            .prepare(
                "DELETE FROM data_sources_nodes WHERE id IN (
                   SELECT id FROM data_sources_nodes WHERE data_source = $1 \
                   AND document IS NOT NULL LIMIT $2
                 ) RETURNING document",
            )
            .await?;

        let stmt_documents = c
            .prepare("DELETE FROM data_sources_documents WHERE id = ANY($1)")
            .await?;

        // First remove active documents, which are linked to a node
        loop {
            let documents: Vec<i64> = c
                .query(
                    &stmt_nodes,
                    &[&data_source_row_id, &(deletion_batch_size as i64)],
                )
                .await?
                .iter()
                .map(|row| row.get(0))
                .collect();

            let deleted_rows = c.execute(&stmt_documents, &[&documents]).await?;
            total_deleted_rows += deleted_rows;
            if deleted_rows < deletion_batch_size {
                break;
            }
        }

        // Then remove all remaining documents
        let stmt = c
            .prepare(
                "DELETE FROM data_sources_documents WHERE id IN (
                   SELECT id FROM data_sources_documents WHERE data_source = $1 LIMIT $2
                 )",
            )
            .await?;

        loop {
            let deleted_rows = c
                .execute(&stmt, &[&data_source_row_id, &(deletion_batch_size as i64)])
                .await?;
            total_deleted_rows += deleted_rows;

            if deleted_rows < deletion_batch_size {
                break;
            }
        }

        let stmt = c.prepare("DELETE FROM data_sources WHERE id = $1").await?;
        let _ = c.query(&stmt, &[&data_source_row_id]).await?;

        Ok(total_deleted_rows)
    }

    async fn upsert_database(
        &self,
        table_ids_hash: &str,
        worker_ttl: u64,
    ) -> Result<TransientDatabase> {
        let pool = self.pool.clone();
        let mut c = pool.get().await?;
        let mut tx = c.transaction().await?;

        // Acquire a transaction-level advisory lock on the table_ids_hash.
        let mut hasher = DefaultHasher::new();
        format!("databases-{}", table_ids_hash).hash(&mut hasher);
        let lock_key = hasher.finish() as i64;
        tx.execute("SELECT pg_advisory_xact_lock($1)", &[&(lock_key)])
            .await?;

        async fn create_database(
            tx: &mut Transaction<'_>,
            table_ids_hash: &str,
            worker_ttl: u64,
            existing_database_row_id: &Option<i64>,
        ) -> Result<TransientDatabase> {
            if existing_database_row_id.is_some() {
                // Delete the database.
                let stmt = tx.prepare("DELETE FROM databases WHERE id = $1").await?;
                tx.execute(&stmt, &[&existing_database_row_id]).await?;
            }

            let created = utils::now();

            // Pick a random live worker.
            let stmt = tx
                .prepare(
                    "SELECT id, url, last_heartbeat
                       FROM sqlite_workers
                       WHERE last_heartbeat > $1 ORDER BY RANDOM() LIMIT 1",
                )
                .await?;
            let r = tx
                .query(&stmt, &[&((utils::now() - worker_ttl) as i64)])
                .await?;

            match r.len() {
                0 => Err(anyhow!("No live workers found"))?,
                1 => {
                    let (sqlite_worker_row_id, url, last_heartbeat): (i64, String, i64) =
                        (r[0].get(0), r[0].get(1), r[0].get(2));

                    // Insert the database row.
                    let stmt = tx
                        .prepare(
                            "INSERT INTO databases \
                            (id, created, table_ids_hash, sqlite_worker) \
                            VALUES (DEFAULT, $1, $2, $3) RETURNING id",
                        )
                        .await?;

                    tx.query_one(
                        &stmt,
                        &[&(created as i64), &table_ids_hash, &sqlite_worker_row_id],
                    )
                    .await?;

                    Ok(TransientDatabase::new(
                        created as u64,
                        &table_ids_hash,
                        &Some(SqliteWorker::new(url, last_heartbeat as u64)),
                    ))
                }
                _ => unreachable!(),
            }
        }

        // Check if there is already a database with the same table_ids_hash.
        let stmt = tx
            .prepare(
                "SELECT id, created, table_ids_hash, sqlite_worker \
                   FROM databases \
                   WHERE table_ids_hash = $1;",
            )
            .await?;
        let r = tx.query(&stmt, &[&table_ids_hash]).await?;
        let database_row: Option<(i64, i64, String, Option<i64>)> = match r.len() {
            0 => None,
            1 => Some((r[0].get(0), r[0].get(1), r[0].get(2), r[0].get(3))),
            _ => unreachable!(),
        };

        let database_result: Result<TransientDatabase, anyhow::Error> = match database_row {
            // There is no database with the same table_ids_hash, we can create a new one.
            None => create_database(&mut tx, table_ids_hash, worker_ttl, &None).await,
            // There is a database with the same table_ids_hash.
            Some((database_row_id, created, table_ids_hash, sqlite_worker_row_id)) => {
                if sqlite_worker_row_id.is_none() {
                    // There is no sqlite_worker assigned to the database.
                    create_database(&mut tx, &table_ids_hash, worker_ttl, &Some(database_row_id))
                        .await
                } else {
                    // There is a sqlite_worker assigned to the database. We need to check if the
                    // sqlite_worker is still alive. If it is, we can release the lock and return
                    // the database. If it is not, we need to delete the database and create a new
                    // one. We need to keep the lock until the database is deleted and a new one is
                    // created.

                    // Get the sqlite_worker row id.
                    let sqlite_worker_row_id = sqlite_worker_row_id.unwrap();
                    let sqlite_worker: Option<SqliteWorker> = {
                        let stmt = tx
                            .prepare(
                                "SELECT url, last_heartbeat \
                                   FROM sqlite_workers \
                                  WHERE id = $1 AND last_heartbeat > $2 LIMIT 1",
                            )
                            .await?;
                        let r = tx
                            .query(
                                &stmt,
                                &[&sqlite_worker_row_id, &((utils::now() - worker_ttl) as i64)],
                            )
                            .await?;
                        match r.len() {
                            0 => None,
                            1 => {
                                let url: String = r[0].get(0);
                                let last_heartbeat: i64 = r[0].get(1);
                                Some(SqliteWorker::new(url, last_heartbeat as u64))
                            }
                            _ => unreachable!(),
                        }
                    };

                    match sqlite_worker {
                        None => {
                            // The sqlite_worker is dead or missing.
                            create_database(
                                &mut tx,
                                &table_ids_hash,
                                worker_ttl,
                                &Some(database_row_id),
                            )
                            .await
                        }
                        Some(sqlite_worker) => {
                            // The sqlite_worker is still alive.
                            // We can release the lock and return the database.
                            Ok(TransientDatabase::new(
                                created as u64,
                                &table_ids_hash,
                                &Some(sqlite_worker),
                            ))
                        }
                    }
                }
            }
        };

        // Commit the transaction and release the lock.
        tx.commit().await?;

        database_result
    }

    async fn load_database(
        &self,
        table_ids_hash: &str,
        worker_ttl: u64,
    ) -> Result<Option<TransientDatabase>> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare(
                "SELECT id, created, table_ids_hash, sqlite_worker \
                   FROM databases \
                   WHERE table_ids_hash = $1;",
            )
            .await?;
        let r = c.query(&stmt, &[&table_ids_hash]).await?;
        let database_row: Option<(i64, i64, String, Option<i64>)> = match r.len() {
            0 => None,
            1 => Some((r[0].get(0), r[0].get(1), r[0].get(2), r[0].get(3))),
            _ => unreachable!(),
        };

        match database_row {
            None => Ok(None),
            Some((_database_row_id, created, table_ids_hash, sqlite_worker_row_id)) => {
                match sqlite_worker_row_id {
                    None => Ok(Some(TransientDatabase::new(
                        created as u64,
                        &table_ids_hash,
                        &None,
                    ))),
                    Some(worker_id) => {
                        let sqlite_worker: Option<SqliteWorker> = {
                            let stmt = c
                                .prepare(
                                    "SELECT url, last_heartbeat \
                                    FROM sqlite_workers \
                                    WHERE id = $1 AND last_heartbeat > $2 LIMIT 1",
                                )
                                .await?;
                            let r = c
                                .query(&stmt, &[&worker_id, &((utils::now() - worker_ttl) as i64)])
                                .await?;
                            match r.len() {
                                0 => None,
                                1 => Some(SqliteWorker::new(
                                    r[0].get::<usize, String>(0),
                                    r[0].get::<usize, i64>(1) as u64,
                                )),
                                _ => unreachable!(),
                            }
                        };

                        Ok(Some(TransientDatabase::new(
                            created as u64,
                            &table_ids_hash,
                            &sqlite_worker,
                        )))
                    }
                }
            }
        }
    }

    async fn delete_database(&self, table_ids_hash: &str) -> Result<()> {
        let pool = self.pool.clone();
        let mut c = pool.get().await?;
        let tx = c.transaction().await?;

        // Acquire a transaction-level advisory lock on the table_ids_hash.
        let mut hasher = DefaultHasher::new();
        format!("databases-{}", table_ids_hash).hash(&mut hasher);
        let lock_key = hasher.finish() as i64;
        tx.execute("SELECT pg_advisory_xact_lock($1)", &[&(lock_key)])
            .await?;

        let stmt = tx
            .prepare("DELETE FROM databases WHERE table_ids_hash = $1")
            .await?;
        let _ = tx.query(&stmt, &[&table_ids_hash]).await?;

        // Commit the transaction and release the lock.
        tx.commit().await?;

        Ok(())
    }

    async fn find_databases_using_table(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
        worker_ttl: u64,
    ) -> Result<Vec<TransientDatabase>> {
        let data_source_id = data_source_id.to_string();
        let table_id = table_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // We look for databases that have a table_ids_hash that contains the table's unique id.
        let stmt = c
            .prepare(
                "SELECT table_ids_hash \
                   FROM databases \
                WHERE table_ids_hash LIKE $1",
            )
            .await?;
        let r = c
            .query(
                &stmt,
                &[&format!(
                    "%{}%",
                    get_table_unique_id(project, &data_source_id, &table_id)
                )],
            )
            .await?;
        let database_ids = r
            .into_iter()
            .map(|row| row.get::<usize, String>(0))
            .collect::<Vec<_>>();

        Ok((try_join_all(
            database_ids
                .iter()
                .map(|h| self.load_database(&h, worker_ttl))
                .collect::<Vec<_>>(),
        )
        .await?)
            .into_iter()
            .filter_map(|d| d)
            .collect::<Vec<_>>())
    }

    async fn upsert_data_source_table(
        &self,
        project: Project,
        data_source_id: String,
        upsert_params: TableUpsertParams,
    ) -> Result<Table> {
        let project_id = project.project_id();

        let table_created = utils::now();

        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        let tx = c.transaction().await?;
        let r = tx
            .query(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;
        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };

        // Check if there is already a table with that name in the data source.
        if upsert_params.check_name_uniqueness.unwrap_or(false) {
            let stmt = tx
                .prepare("SELECT id FROM tables WHERE data_source = $1 AND name = $2 AND table_id != $3 LIMIT 1")
                .await?;
            let r = tx
                .query(
                    &stmt,
                    &[
                        &data_source_row_id,
                        &upsert_params.name,
                        &upsert_params.table_id,
                    ],
                )
                .await?;

            if !r.is_empty() {
                // We already have a table with that name but a different table id, it is not allowed
                return Err(anyhow!("Tables names must be unique within a data source."));
            }
        }

        let stmt = tx
            .prepare(
                "INSERT INTO tables \
                   (id, data_source, created, table_id, name, description, timestamp, \
                   remote_database_table_id, remote_database_secret_id) \
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, $8) \
                   ON CONFLICT (table_id, data_source) DO UPDATE \
                   SET name = EXCLUDED.name, description = EXCLUDED.description, \
                   timestamp = EXCLUDED.timestamp, \
                     remote_database_table_id = EXCLUDED.remote_database_table_id, \
                     remote_database_secret_id = EXCLUDED.remote_database_secret_id \
                   RETURNING id, created, schema, schema_stale_at",
            )
            .await?;

        let table_row = tx
            .query_one(
                &stmt,
                &[
                    &data_source_row_id,
                    &(table_created as i64),
                    &upsert_params.table_id,
                    &upsert_params.name,
                    &upsert_params.description,
                    &(upsert_params.timestamp as i64),
                    &upsert_params.remote_database_table_id,
                    &upsert_params.remote_database_secret_id,
                ],
            )
            .await?;

        let table_row_id = table_row.get::<usize, i64>(0);
        let table_created = table_row.get::<usize, i64>(1) as u64;
        let raw_schema = table_row.get::<usize, Option<String>>(2);
        let table_schema_stale_at = table_row.get::<usize, Option<i64>>(3);

        let parsed_schema: Option<TableSchema> = match raw_schema {
            None => None,
            Some(schema) => {
                if schema.is_empty() {
                    None
                } else {
                    Some(serde_json::from_str(&schema)?)
                }
            }
        };

        let title = upsert_params.title;

        let table = Table::new(
            project,
            data_source_id,
            data_source_internal_id,
            table_created,
            upsert_params.table_id,
            upsert_params.name,
            upsert_params.description,
            upsert_params.timestamp,
            title,
            upsert_params.mime_type,
            upsert_params.provider_visibility,
            upsert_params.tags,
            upsert_params.parents.get(1).cloned(),
            upsert_params.parents,
            upsert_params.source_url,
            parsed_schema,
            table_schema_stale_at.map(|t| t as u64),
            upsert_params.remote_database_table_id,
            upsert_params.remote_database_secret_id,
        );

        self.upsert_data_source_node(
            UpsertNode {
                node_id: table.table_id(),
                node_type: &NodeType::Table,
                timestamp: table.timestamp(),
                title: table.title(),
                mime_type: table.mime_type(),
                provider_visibility: table.provider_visibility(),
                parents: table.parents(),
                source_url: table.source_url(),
                tags: &table.get_tags(),
                text_size: &None,
            },
            data_source_row_id,
            table_row_id,
            &tx,
        )
        .await?;
        tx.commit().await?;

        Ok(table)
    }

    async fn update_data_source_table_schema(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
        schema: &TableSchema,
    ) -> Result<()> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let table_id = table_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // Get the data source row id.
        let stmt = c
            .prepare(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
            )
            .await?;
        let r = c.query(&stmt, &[&project_id, &data_source_id]).await?;
        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        // Update the schema.
        let stmt = c
            .prepare(
                "UPDATE tables SET schema = $1, schema_stale_at = NULL \
                   WHERE data_source = $2 AND table_id = $3",
            )
            .await?;
        c.query(
            &stmt,
            &[
                &serde_json::to_string(schema)?,
                &data_source_row_id,
                &table_id,
            ],
        )
        .await?;

        Ok(())
    }

    async fn invalidate_data_source_table_schema(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
    ) -> Result<()> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let table_id = table_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // Get the data source row id.
        let stmt = c
            .prepare(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
            )
            .await?;
        let r = c.query(&stmt, &[&project_id, &data_source_id]).await?;
        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        // Invalidate the schema.
        let schema_stale_at = utils::now() as i64;
        let stmt = c
            .prepare(
                "UPDATE tables SET schema_stale_at = $1 \
                   WHERE data_source = $2 AND table_id = $3",
            )
            .await?;
        c.query(&stmt, &[&schema_stale_at, &data_source_row_id, &table_id])
            .await?;

        Ok(())
    }

    async fn load_data_source_table(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
    ) -> Result<Option<Table>> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let table_id = table_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // Get the data source row id.
        let stmt = c
            .prepare(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
            )
            .await?;
        let r = c.query(&stmt, &[&project_id, &data_source_id]).await?;
        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };

        let stmt = c
            .prepare(
                "SELECT t.created, t.table_id, t.name, t.description, \
                        t.timestamp, dsn.tags_array, dsn.parents, dsn.source_url, \
                        t.schema, t.schema_stale_at, \
                        t.remote_database_table_id, t.remote_database_secret_id, \
                        dsn.title, dsn.mime_type, dsn.provider_visibility \
                        FROM tables t INNER JOIN data_sources_nodes dsn ON dsn.table=t.id \
                        WHERE t.data_source = $1 AND t.table_id = $2 LIMIT 1",
            )
            .await?;
        let r = c.query(&stmt, &[&data_source_row_id, &table_id]).await?;

        let d: Option<(
            i64,
            String,
            String,
            String,
            i64,
            Vec<String>,
            Vec<String>,
            Option<String>,
            Option<String>,
            Option<i64>,
            Option<String>,
            Option<String>,
            String,
            String,
            Option<ProviderVisibility>,
        )> = match r.len() {
            0 => None,
            1 => Some((
                r[0].get(0),
                r[0].get(1),
                r[0].get(2),
                r[0].get(3),
                r[0].get(4),
                r[0].get(5),
                r[0].get(6),
                r[0].get(7),
                r[0].get(8),
                r[0].get(9),
                r[0].get(10),
                r[0].get(11),
                r[0].get(12),
                r[0].get(13),
                r[0].get(14),
            )),
            _ => unreachable!(),
        };

        match d {
            None => Ok(None),
            Some((
                created,
                table_id,
                name,
                description,
                timestamp,
                tags,
                parents,
                source_url,
                schema,
                schema_stale_at,
                remote_database_table_id,
                remote_database_secret_id,
                title,
                mime_type,
                provider_visibility,
            )) => {
                let parsed_schema: Option<TableSchema> = match schema {
                    None => None,
                    Some(schema) => {
                        if schema.is_empty() {
                            None
                        } else {
                            Some(serde_json::from_str(&schema)?)
                        }
                    }
                };

                Ok(Some(Table::new(
                    project.clone(),
                    data_source_id.clone(),
                    data_source_internal_id.clone(),
                    created as u64,
                    table_id,
                    name,
                    description,
                    timestamp as u64,
                    title,
                    mime_type,
                    provider_visibility,
                    tags,
                    parents.get(1).cloned(),
                    parents,
                    source_url,
                    parsed_schema,
                    schema_stale_at.map(|t| t as u64),
                    remote_database_table_id,
                    remote_database_secret_id,
                )))
            }
        }
    }

    async fn list_data_source_tables(
        &self,
        project: &Project,
        data_source_id: &str,
        view_filter: &Option<SearchFilter>,
        table_ids: &Option<Vec<String>>,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Table>, usize)> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // get the data source row id
        let r = c
            .query(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };

        let mut where_clauses: Vec<String> = vec![];
        let mut params: Vec<&(dyn ToSql + Sync)> = vec![];

        where_clauses.push("t.data_source = $1".to_string());
        params.push(&data_source_row_id);

        let (filter_clauses, filter_params, mut p_idx) = Self::where_clauses_and_params_for_filter(
            view_filter,
            "dsn.tags_array",
            "dsn.parents",
            "t.timestamp",
            params.len() + 1,
        );

        where_clauses.extend(filter_clauses);
        params.extend(filter_params);

        // Add table_ids filter if provided.
        if let Some(ref ids) = table_ids {
            // Create a dynamic list of placeholders for the table IDs.
            let id_placeholders: Vec<String> = (0..ids.len())
                .map(|_| {
                    let placeholder = format!("${}", p_idx);
                    p_idx += 1; // Increment p_idx after each table.
                    placeholder
                })
                .collect();

            where_clauses.push(format!("t.table_id IN ({})", id_placeholders.join(", ")));
            params.extend(ids.iter().map(|id| id as &(dyn ToSql + Sync)));
        }

        let sql = format!(
            "SELECT t.created, t.table_id, t.name, t.description, \
                    t.timestamp, dsn.tags_array, dsn.parents, \
                    t.schema, t.schema_stale_at, \
                    t.remote_database_table_id, t.remote_database_secret_id, \
                    dsn.title, dsn.mime_type, dsn.source_url, dsn.provider_visibility \
                FROM tables t INNER JOIN data_sources_nodes dsn ON dsn.table=t.id \
                WHERE {} ORDER BY t.timestamp DESC",
            where_clauses.join(" AND "),
        );

        let rows = match limit_offset {
            None => {
                let stmt = c.prepare(&sql).await?;
                c.query(&stmt, &params).await?
            }
            Some((limit, offset)) => {
                let limit = limit as i64;
                let offset = offset as i64;

                let mut params = params.clone();
                params.push(&limit);
                params.push(&offset);

                let stmt = c
                    .prepare(&(sql + &format!(" LIMIT ${} OFFSET ${}", p_idx, p_idx + 1)))
                    .await?;
                c.query(&stmt, &params).await?
            }
        };

        let tables: Vec<Table> = rows
            .into_iter()
            .map(|r| {
                let created: i64 = r.get(0);
                let table_id: String = r.get(1);
                let name: String = r.get(2);
                let description: String = r.get(3);
                let timestamp: i64 = r.get(4);
                let tags: Vec<String> = r.get(5);
                let parents: Vec<String> = r.get(6);
                let schema: Option<String> = r.get(7);
                let schema_stale_at: Option<i64> = r.get(8);
                let remote_database_table_id: Option<String> = r.get(9);
                let remote_database_secret_id: Option<String> = r.get(10);
                let title: String = r.get(11);
                let mime_type: String = r.get(12);
                let source_url: Option<String> = r.get(13);
                let provider_visibility: Option<ProviderVisibility> = r.get(14);

                let parsed_schema: Option<TableSchema> = match schema {
                    None => None,
                    Some(schema) => {
                        if schema.is_empty() {
                            None
                        } else {
                            Some(serde_json::from_str(&schema)?)
                        }
                    }
                };

                Ok(Table::new(
                    project.clone(),
                    data_source_id.clone(),
                    data_source_internal_id.clone(),
                    created as u64,
                    table_id,
                    name,
                    description,
                    timestamp as u64,
                    title,
                    mime_type,
                    provider_visibility,
                    tags,
                    parents.get(1).cloned(),
                    parents,
                    source_url,
                    parsed_schema,
                    schema_stale_at.map(|t| t as u64),
                    remote_database_table_id,
                    remote_database_secret_id,
                ))
            })
            .collect::<Result<Vec<_>>>()?;

        let total = match limit_offset {
            None => tables.len(),
            Some(_) => {
                let stmt = c
                    .prepare(
                        format!(
                            "SELECT COUNT(*) FROM tables t \
                               INNER JOIN data_sources_nodes dsn ON dsn.table=t.id \
                               WHERE {}",
                            where_clauses.join(" AND ")
                        )
                        .as_str(),
                    )
                    .await?;
                let t: i64 = c.query_one(&stmt, &params).await?.get(0);
                t as usize
            }
        };

        Ok((tables, total))
    }

    async fn delete_data_source_table(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
    ) -> Result<()> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();
        let table_id = table_id.to_string();

        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        let tx = c.transaction().await?;

        let r = tx
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;
        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        let stmt = tx
            .prepare(
                "DELETE FROM data_sources_nodes WHERE data_source = $1 \
                   AND node_id = $2 AND \"table\" IS NOT NULL",
            )
            .await?;
        let _ = tx.query(&stmt, &[&data_source_row_id, &table_id]).await?;
        let stmt = tx
            .prepare("DELETE FROM tables WHERE data_source = $1 AND table_id = $2")
            .await?;
        let _ = tx.query(&stmt, &[&data_source_row_id, &table_id]).await?;

        tx.commit().await?;

        Ok(())
    }

    async fn upsert_data_source_folder(
        &self,
        project: Project,
        data_source_id: String,
        upsert_params: FolderUpsertParams,
    ) -> Result<Folder> {
        let project_id = project.project_id();

        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        let created = utils::now();

        // get the data source row id
        let tx = c.transaction().await?;
        let r = tx
            .query(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };

        let stmt = tx
            .prepare(
                "INSERT INTO data_sources_folders \
                       (id, data_source, created, folder_id) \
                       VALUES (DEFAULT, $1, $2, $3) \
                       ON CONFLICT (folder_id, data_source)  DO UPDATE \
                       SET folder_id = data_sources_folders.folder_id \
                       RETURNING id",
            )
            .await?;

        let r = tx
            .query_one(
                &stmt,
                &[
                    &data_source_row_id,
                    &(created as i64),
                    &upsert_params.folder_id,
                ],
            )
            .await?;

        let folder_row_id: i64 = r.get(0);

        let folder = Folder::new(
            data_source_id,
            data_source_internal_id,
            upsert_params.folder_id,
            upsert_params.timestamp,
            upsert_params.title,
            upsert_params.parents.get(1).cloned(),
            upsert_params.parents,
            upsert_params.mime_type,
            upsert_params.source_url,
            upsert_params.provider_visibility,
        );

        self.upsert_data_source_node(
            UpsertNode {
                node_id: folder.folder_id(),
                node_type: &NodeType::Folder,
                timestamp: folder.timestamp(),
                provider_visibility: folder.provider_visibility(),
                title: folder.title(),
                mime_type: folder.mime_type(),
                parents: folder.parents(),
                source_url: folder.source_url(),
                tags: &vec![],
                text_size: &None,
            },
            data_source_row_id,
            folder_row_id,
            &tx,
        )
        .await?;

        tx.commit().await?;

        Ok(folder)
    }

    async fn load_data_source_folder(
        &self,
        project: &Project,
        data_source_id: &str,
        folder_id: &str,
    ) -> Result<Option<Folder>> {
        let data_source_id = data_source_id.to_string();
        let folder_id = folder_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        match self
            .get_data_source_node(&project, &data_source_id, &folder_id)
            .await?
        {
            None => Ok(None),
            Some((node, row_id)) => {
                let stmt = c
                    .prepare(
                        "SELECT id \
                           FROM data_sources_folders \
                           WHERE id = $1 LIMIT 1",
                    )
                    .await?;
                let row = c.query(&stmt, &[&row_id]).await?;

                match row.len() {
                    0 => Ok(None),
                    1 => Ok(Some(node.into_folder())),
                    _ => unreachable!(),
                }
            }
        }
    }

    async fn list_data_source_folders(
        &self,
        project: &Project,
        data_source_id: &str,
        view_filter: &Option<SearchFilter>,
        folder_ids: &Option<Vec<String>>,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Folder>, usize)> {
        let project_id = project.project_id();
        let data_source_id = data_source_id.to_string();

        let pool = self.pool.clone();
        let c = pool.get().await?;

        // get the data source row id
        let r = c
            .query(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };

        let mut where_clauses: Vec<String> = vec![];
        let mut params: Vec<&(dyn ToSql + Sync)> = vec![];

        where_clauses.push("dsn.data_source = $1".to_string());
        params.push(&data_source_row_id);

        let (filter_clauses, filter_params, mut p_idx) = Self::where_clauses_and_params_for_filter(
            &view_filter,
            "dsn.tags_array",
            "dsn.parents",
            "dsn.timestamp",
            params.len() + 1,
        );

        where_clauses.extend(filter_clauses);
        params.extend(filter_params);

        // Add folder_ids filter if provided.
        if let Some(ref ids) = folder_ids {
            // Create a dynamic list of placeholders for the folder IDs.
            let id_placeholders: Vec<String> = (0..ids.len())
                .map(|_| {
                    let placeholder = format!("${}", p_idx);
                    p_idx += 1; // Increment p_idx after each table.
                    placeholder
                })
                .collect();

            where_clauses.push(format!("dsn.node_id IN ({})", id_placeholders.join(", ")));
            params.extend(ids.iter().map(|id| id as &(dyn ToSql + Sync)));
        }

        let sql = format!(
            "SELECT dsn.node_id, dsn.title, dsn.timestamp, dsn.parents, dsn.mime_type, dsn.source_url, dsn.provider_visibility \
               FROM data_sources_nodes dsn \
               WHERE dsn.folder IS NOT NULL AND {} ORDER BY dsn.timestamp DESC",
            where_clauses.join(" AND "),
        );

        let (rows, total) = match limit_offset {
            None => {
                let stmt = c.prepare(&sql).await?;
                let rows = c.query(&stmt, &params).await?;
                let total = rows.len();
                (rows, total)
            }
            Some((limit, offset)) => {
                let limit = limit as i64;
                let offset = offset as i64;

                let mut params_with_limits = params.clone();
                params_with_limits.push(&limit);
                params_with_limits.push(&offset);

                let stmt = c
                    .prepare(&(sql + &format!(" LIMIT ${} OFFSET ${}", p_idx, p_idx + 1)))
                    .await?;
                let rows = c.query(&stmt, &params_with_limits).await?;

                let stmt = c
                    .prepare(
                        format!(
                            "SELECT COUNT(*) FROM data_sources_nodes dsn \
                                WHERE folder IS NOT NULL AND {}",
                            where_clauses.join(" AND ")
                        )
                        .as_str(),
                    )
                    .await?;
                let t: i64 = c.query_one(&stmt, &params).await?.get(0);
                (rows, t as usize)
            }
        };

        let folders: Vec<Folder> = rows
            .into_iter()
            .map(|r| {
                let node_id: String = r.get(0);
                let title: String = r.get(1);
                let timestamp: i64 = r.get(2);
                let parents: Vec<String> = r.get(3);
                let mime_type: String = r.get(4);
                let source_url: Option<String> = r.get(5);
                let provider_visibility: Option<ProviderVisibility> = r.get(6);

                Ok(Folder::new(
                    data_source_id.clone(),
                    data_source_internal_id.clone(),
                    node_id,
                    timestamp as u64,
                    title,
                    parents.get(1).cloned(),
                    parents,
                    mime_type,
                    source_url,
                    provider_visibility,
                ))
            })
            .collect::<Result<Vec<_>>>()?;
        Ok((folders, total))
    }

    async fn delete_data_source_folder(
        &self,
        project: &Project,
        data_source_id: &str,
        folder_id: &str,
    ) -> Result<()> {
        let project_id = project.project_id();
        let pool = self.pool.clone();
        let mut c = pool.get().await?;

        let tx = c.transaction().await?;

        let r = tx
            .query(
                "SELECT id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;
        let data_source_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        let stmt = tx
            .prepare(
                "DELETE FROM data_sources_nodes \
                   WHERE data_source = $1 AND node_id = $2 AND folder IS NOT NULL",
            )
            .await?;
        let _ = tx.query(&stmt, &[&data_source_row_id, &folder_id]).await?;
        let stmt = tx
            .prepare("DELETE FROM data_sources_folders WHERE data_source = $1 AND folder_id = $2")
            .await?;
        let _ = tx.query(&stmt, &[&data_source_row_id, &folder_id]).await?;

        tx.commit().await?;

        Ok(())
    }

    async fn get_data_source_node(
        &self,
        project: &Project,
        data_source_id: &str,
        node_id: &str,
    ) -> Result<Option<(Node, i64)>> {
        let project_id = project.project_id();
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let r = c
            .query(
                "select id, internal_id FROM data_sources WHERE project = $1 AND data_source_id = $2 LIMIT 1",
                &[&project_id, &data_source_id],
            )
            .await?;

        let (data_source_row_id, data_source_internal_id): (i64, String) = match r.len() {
            0 => Err(anyhow!("Unknown DataSource: {}", data_source_id))?,
            1 => (r[0].get(0), r[0].get(1)),
            _ => unreachable!(),
        };

        let stmt = c
            .prepare(
                "SELECT timestamp, title, mime_type, provider_visibility, parents, node_id, document, \"table\", folder, source_url, tags_array, text_size \
                   FROM data_sources_nodes \
                   WHERE data_source = $1 AND node_id = $2 LIMIT 1",
            )
            .await?;
        let row = c.query(&stmt, &[&data_source_row_id, &node_id]).await?;

        match row.len() {
            0 => Ok(None),
            1 => {
                let timestamp: i64 = row[0].get::<_, i64>(0);
                let title: String = row[0].get::<_, String>(1);
                let mime_type: String = row[0].get::<_, String>(2);
                let provider_visibility: Option<ProviderVisibility> =
                    row[0].get::<_, Option<ProviderVisibility>>(3);
                let parents: Vec<String> = row[0].get::<_, Vec<String>>(4);
                let node_id: String = row[0].get::<_, String>(5);
                let document_row_id = row[0].get::<_, Option<i64>>(6);
                let table_row_id = row[0].get::<_, Option<i64>>(7);
                let folder_row_id = row[0].get::<_, Option<i64>>(8);
                let (node_type, row_id) = match (document_row_id, table_row_id, folder_row_id) {
                    (Some(id), None, None) => (NodeType::Document, id),
                    (None, Some(id), None) => (NodeType::Table, id),
                    (None, None, Some(id)) => (NodeType::Folder, id),
                    _ => unreachable!(),
                };
                let source_url: Option<String> = row[0].get::<_, Option<String>>(9);
                let tags: Option<Vec<String>> = row[0].get::<_, Option<Vec<String>>>(10);
                let text_size: Option<i64> = row[0].get::<_, Option<i64>>(11);
                Ok(Some((
                    Node::new(
                        &data_source_id,
                        &data_source_internal_id,
                        &node_id,
                        node_type,
                        text_size,
                        timestamp as u64,
                        &title,
                        &mime_type,
                        provider_visibility,
                        parents.get(1).cloned(),
                        parents,
                        source_url,
                        tags,
                    ),
                    row_id,
                )))
            }
            _ => unreachable!(),
        }
    }

    async fn list_data_source_nodes(
        &self,
        id_cursor: i64,
        batch_size: i64,
    ) -> Result<Vec<(Node, i64, i64)>> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare(
                "SELECT dsn.timestamp, dsn.title, dsn.mime_type, dsn.provider_visibility, dsn.parents, dsn.node_id, dsn.document, dsn.\"table\", dsn.folder, ds.data_source_id, ds.internal_id, dsn.source_url, dsn.tags_array, dsn.id, dsn.text_size \
                   FROM data_sources_nodes dsn JOIN data_sources ds ON dsn.data_source = ds.id \
                   WHERE dsn.id > $1 ORDER BY dsn.id ASC LIMIT $2",
            )
            .await?;
        let rows = c.query(&stmt, &[&id_cursor, &batch_size]).await?;

        let nodes: Vec<(Node, i64, i64)> = rows
            .iter()
            .map(|row| {
                let timestamp: i64 = row.get::<_, i64>(0);
                let title: String = row.get::<_, String>(1);
                let mime_type: String = row.get::<_, String>(2);
                let provider_visibility: Option<ProviderVisibility> =
                    row.get::<_, Option<ProviderVisibility>>(3);
                let parents: Vec<String> = row.get::<_, Vec<String>>(4);
                let node_id: String = row.get::<_, String>(5);
                let document_row_id = row.get::<_, Option<i64>>(6);
                let table_row_id = row.get::<_, Option<i64>>(7);
                let folder_row_id = row.get::<_, Option<i64>>(8);
                let data_source_id: String = row.get::<_, String>(9);
                let data_source_internal_id: String = row.get::<_, String>(10);
                let (node_type, element_row_id) =
                    match (document_row_id, table_row_id, folder_row_id) {
                        (Some(id), None, None) => (NodeType::Document, id),
                        (None, Some(id), None) => (NodeType::Table, id),
                        (None, None, Some(id)) => (NodeType::Folder, id),
                        _ => unreachable!(),
                    };
                let source_url: Option<String> = row.get::<_, Option<String>>(11);
                let tags: Option<Vec<String>> = row.get::<_, Option<Vec<String>>>(12);
                let row_id = row.get::<_, i64>(13);
                let text_size: Option<i64> = row.get::<_, Option<i64>>(14);
                (
                    Node::new(
                        &data_source_id,
                        &data_source_internal_id,
                        &node_id,
                        node_type,
                        text_size,
                        timestamp as u64,
                        &title,
                        &mime_type,
                        provider_visibility,
                        parents.get(1).cloned(),
                        parents,
                        source_url,
                        tags,
                    ),
                    row_id,
                    element_row_id,
                )
            })
            .collect::<Vec<_>>();
        Ok(nodes)
    }

    async fn count_nodes_children(
        &self,
        nodes: &Vec<NodeESDocument>,
    ) -> Result<HashMap<String, u64>> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        // Extract all node IDs we want to count children for and get corresponding data_source_row_ids
        let node_ids: Vec<String> = nodes.iter().map(|n| n.node_id.clone()).collect();
        let data_source_internal_ids: Vec<String> = nodes
            .iter()
            .map(|n| n.data_source_internal_id.clone())
            .collect();
        let r = c
            .query(
                "SELECT ds.id, p.node_id FROM data_sources ds
                    JOIN UNNEST(
                        $1::text[],
                        $2::text[]
                    ) AS p(node_id, internal_id)
                ON ds.internal_id = p.internal_id",
                &[&node_ids, &data_source_internal_ids],
            )
            .await?;

        let data_source_row_ids: Vec<i64> = r.iter().map(|row| row.get(0)).collect();
        let node_ids: Vec<String> = r.iter().map(|row| row.get(1)).collect();
        // using index (data_source, parents[2]), check for existence of children
        let stmt = c
            .prepare(
                "SELECT p.node_id,
                    EXISTS (
                        SELECT 1
                        FROM data_sources_nodes dsn
                        WHERE dsn.data_source = p.data_source
                        AND dsn.parents[2] = p.node_id
                        LIMIT 1
                    ) as has_children
                    FROM UNNEST(
                        $1::bigint[],
                        $2::text[]
                    ) AS p(data_source, node_id)",
            )
            .await?;
        let rows = c.query(&stmt, &[&data_source_row_ids, &node_ids]).await?;

        // Convert the results into a HashMap
        let counts = rows
            .iter()
            .map(|row| {
                let parent_id: String = row.get(0);
                let has_children: bool = row.get(1);
                (
                    parent_id,
                    match has_children {
                        true => 1,
                        false => 0,
                    },
                )
            })
            .collect::<HashMap<String, u64>>();

        Ok(counts)
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
                "INSERT INTO cache (id, project, created, hash, request, response, type, version)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7) RETURNING id",
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
                &LLMRequest::request_type(),
                &LLMRequest::version(),
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
                "INSERT INTO cache (id, project, created, hash, request, response, type, version)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7) RETURNING id",
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
                &LLMChatRequest::request_type(),
                &LLMChatRequest::version(),
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
                "INSERT INTO cache (id, project, created, hash, request, response, type, version)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7) RETURNING id",
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
                &EmbedderRequest::request_type(),
                &EmbedderRequest::version(),
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
                "INSERT INTO cache (id, project, created, hash, request, response, type, version)
                   VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7) RETURNING id",
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
                &LLMRequest::request_type(),
                &LLMRequest::version(),
            ],
        )
        .await?;
        Ok(())
    }

    // SQLite Workers
    async fn sqlite_workers_list(&self) -> Result<Vec<SqliteWorker>> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        let stmt = c
            .prepare("SELECT url, last_heartbeat FROM sqlite_workers")
            .await?;
        let rows = c.query(&stmt, &[]).await?;

        rows.iter()
            .map(|row| {
                let url: String = row.get(0);
                let last_heartbeat: i64 = row.get(1);
                Ok(SqliteWorker::new(url, last_heartbeat as u64))
            })
            .collect::<Result<Vec<_>>>()
    }

    async fn sqlite_workers_upsert(&self, url: &str, ttl: u64) -> Result<(SqliteWorker, bool)> {
        let pool = self.pool.clone();
        let c = pool.get().await?;

        // First, check if the worker already exists.
        let stmt = c
            .prepare("SELECT last_heartbeat FROM sqlite_workers WHERE url = $1 LIMIT 1")
            .await?;
        let r = c.query(&stmt, &[&url.to_string()]).await?;

        let already_alive = match r.len() {
            0 => false,
            1 => r[0].get::<usize, i64>(0) > (utils::now() - ttl) as i64,
            _ => unreachable!(),
        };

        let last_heartbeat = utils::now();

        let stmt = c
            .prepare(
                "INSERT INTO sqlite_workers (id, created, url, last_heartbeat) \
                VALUES (DEFAULT, $1, $2, $3) \
                ON CONFLICT (url) DO UPDATE \
                SET last_heartbeat = EXCLUDED.last_heartbeat RETURNING id",
            )
            .await?;

        c.query_one(
            &stmt,
            &[
                &(utils::now() as i64),
                &url.to_string(),
                &(last_heartbeat as i64),
            ],
        )
        .await?;

        Ok((
            SqliteWorker::new(url.to_string(), last_heartbeat),
            !already_alive,
        ))
    }

    async fn sqlite_workers_delete(&self, url: &str) -> Result<()> {
        let pool = self.pool.clone();
        let mut c = pool.get().await?;
        let tx = c.transaction().await?;

        // Find the ID of the worker.
        let stmt = tx
            .prepare("SELECT id FROM sqlite_workers WHERE url = $1 LIMIT 1")
            .await?;
        let r = tx.query(&stmt, &[&url.to_string()]).await?;
        let worker_row_id: i64 = match r.len() {
            0 => Err(anyhow!("Unknown SQLite Worker: {}", url))?,
            1 => r[0].get(0),
            _ => unreachable!(),
        };

        // Delete the databases that are assigned to the worker.
        let stmt = tx
            .prepare(
                "DELETE FROM databases \
                WHERE sqlite_worker = $1",
            )
            .await?;
        tx.execute(&stmt, &[&worker_row_id]).await?;

        // Delete the worker.
        let stmt = tx
            .prepare(
                "DELETE FROM sqlite_workers \
                WHERE id = $1",
            )
            .await?;
        tx.execute(&stmt, &[&worker_row_id]).await?;

        tx.commit().await?;

        Ok(())
    }

    async fn sqlite_workers_cleanup(&self, ttl: u64) -> Result<()> {
        let pool = self.pool.clone();
        let mut c = pool.get().await?;
        let tx = c.transaction().await?;

        // Find the IDs of the dead workers.
        let stmt = tx
            .prepare(
                "SELECT id FROM sqlite_workers \
                WHERE last_heartbeat < $1",
            )
            .await?;
        let rows = tx
            .query(&stmt, &[&(utils::now() as i64 - ttl as i64)])
            .await?;
        let dead_worker_ids = rows
            .iter()
            .map(|row| row.get::<usize, i64>(0))
            .collect::<Vec<_>>();

        // Delete databases that are assigned to the dead workers.
        let stmt = tx
            .prepare(
                "DELETE FROM databases \
                WHERE sqlite_worker = ANY($1)",
            )
            .await?;
        tx.execute(&stmt, &[&dead_worker_ids]).await?;

        // Delete the dead workers.
        let stmt = tx
            .prepare(
                "DELETE FROM sqlite_workers \
                WHERE id = ANY($1)",
            )
            .await?;
        tx.execute(&stmt, &[&dead_worker_ids]).await?;

        tx.commit().await?;

        Ok(())
    }

    fn clone_box(&self) -> Box<dyn Store + Sync + Send> {
        Box::new(self.clone())
    }
}
