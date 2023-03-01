use crate::blocks::block::BlockType;
use crate::dataset::Dataset;
use crate::datasources::datasource::{DataSource, Document};
use crate::http::request::{HttpRequest, HttpResponse};
use crate::project::Project;
use crate::providers::embedder::{EmbedderRequest, EmbedderVector};
use crate::providers::llm::{LLMChatGeneration, LLMChatRequest, LLMGeneration, LLMRequest};
use crate::providers::llm::{LLMGeneration, LLMRequest};
use crate::run::{Run, RunStatus, RunType};
use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;

#[async_trait]
pub trait Store {
    // Projects
    async fn create_project(&self) -> Result<Project>;

    // Datasets
    async fn latest_dataset_hash(
        &self,
        project: &Project,
        dataset_id: &str,
    ) -> Result<Option<String>>;
    async fn register_dataset(&self, project: &Project, d: &Dataset) -> Result<()>;
    async fn load_dataset(
        &self,
        project: &Project,
        dataset_id: &str,
        hash: &str,
    ) -> Result<Option<Dataset>>;
    async fn list_datasets(&self, project: &Project)
        -> Result<HashMap<String, Vec<(String, u64)>>>;

    // Specifications
    async fn latest_specification_hash(&self, project: &Project) -> Result<Option<String>>;
    async fn register_specification(&self, project: &Project, hash: &str, spec: &str)
        -> Result<()>;
    async fn load_specification(
        &self,
        project: &Project,
        hash: &str,
    ) -> Result<Option<(u64, String)>>;

    // Runs
    async fn latest_run_id(&self, project: &Project, run_type: RunType) -> Result<Option<String>>;
    async fn list_runs(
        &self,
        project: &Project,
        run_type: RunType,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Run>, usize)>;

    async fn create_run_empty(&self, project: &Project, run: &Run) -> Result<()>;
    async fn update_run_status(
        &self,
        project: &Project,
        run_id: &str,
        run_status: &RunStatus,
    ) -> Result<()>;
    async fn append_run_block(
        &self,
        project: &Project,
        run: &Run,
        block_idx: usize,
        block_type: &BlockType,
        block_name: &String,
    ) -> Result<()>;

    async fn load_run(
        &self,
        project: &Project,
        run_id: &str,
        // None return all, Some(None), return none, Some(Some(_)) return that block.
        block: Option<Option<(BlockType, String)>>,
    ) -> Result<Option<Run>>;

    // DataSources
    async fn register_data_source(&self, project: &Project, ds: &DataSource) -> Result<()>;
    async fn load_data_source(
        &self,
        project: &Project,
        data_source_id: &str,
    ) -> Result<Option<DataSource>>;
    async fn upsert_data_source_document(
        &self,
        project: &Project,
        data_source_id: &str,
        document: &Document,
    ) -> Result<()>;

    // LLM Cache
    async fn llm_cache_get(
        &self,
        project: &Project,
        request: &LLMRequest,
    ) -> Result<Vec<LLMGeneration>>;
    async fn llm_cache_store(
        &self,
        project: &Project,
        request: &LLMRequest,
        generation: &LLMGeneration,
    ) -> Result<()>;

    // LLM Chat Cache
    async fn llm_chat_cache_get(
        &self,
        project: &Project,
        request: &LLMChatRequest,
    ) -> Result<Vec<LLMChatGeneration>>;
    async fn llm_chat_cache_store(
        &self,
        project: &Project,
        request: &LLMChatRequest,
        generation: &LLMChatGeneration,
    ) -> Result<()>;

    // Embedder Cache
    async fn embedder_cache_get(
        &self,
        project: &Project,
        request: &EmbedderRequest,
    ) -> Result<Vec<EmbedderVector>>;
    async fn embedder_cache_store(
        &self,
        project: &Project,
        request: &EmbedderRequest,
        embedding: &EmbedderVector,
    ) -> Result<()>;

    // HTTP Cache
    async fn http_cache_get(
        &self,
        project: &Project,
        request: &HttpRequest,
    ) -> Result<Vec<HttpResponse>>;
    async fn http_cache_store(
        &self,
        project: &Project,
        request: &HttpRequest,
        response: &HttpResponse,
    ) -> Result<()>;

    // Cloning
    fn clone_box(&self) -> Box<dyn Store + Sync + Send>;
}

impl Clone for Box<dyn Store + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

pub const SQLITE_TABLES: [&'static str; 12] = [
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
       run_type             TEXT NOT NULL,
       app_hash             TEXT NOT NULL,
       config_json          TEXT NOT NULL,
       status_json          TEXT NOT NULL,
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
    "-- Cache (non unique hash index)
    CREATE TABLE IF NOT EXISTS cache (
       id                   INTEGER PRIMARY KEY,
       project              INTEGER NOT NULL,
       created              INTEGER NOT NULL,
       hash                 TEXT NOT NULL,
       request              TEXT NOT NULL,
       response             TEXT NOT NULL,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- data sources
    CREATE TABLE IF NOT EXISTS data_sources (
       id                   INTEGER PRIMARY KEY,
       project              INTEGER NOT NULL,
       created              INTEGER NOT NULL,
       data_source_id       TEXT NOT NULL,
       config_json          TEXT NOT NULL,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- data sources documents
    CREATE TABLE IF NOT EXISTS data_sources_documents (
       id                       INTEGER PRIMARY KEY,
       data_source              INTEGER NOT NULL,
       created                  INTEGER NOT NULL,
       document_id              TEXT NOT NULL,
       metadata_json            TEXT NOT NULL,
       hash                     TEXT NOT NULL,
       status                   TEXT NOT NULL,
       splitter                 TEXT NOT NULL,
       FOREIGN KEY(data_source) REFERENCES data_sources(id),
    );",
    "-- data sources chunks
    CREATE TABLE IF NOT EXISTS data_sources_chunks (
       id                    INTEGER PRIMARY KEY,
       document              INTEGER NOT NULL,
       created               INTEGER NOT NULL,
       hash                  TEXT NOT NULL,
       FOREIGN KEY(document) REFERENCES data_sources_documents(id),
    );",
];

pub const POSTGRES_TABLES: [&'static str; 12] = [
    "-- projects
     CREATE TABLE IF NOT EXISTS projects (
        id BIGSERIAL PRIMARY KEY
    );",
    "-- app specifications
    CREATE TABLE IF NOT EXISTS specifications (
       id                   BIGSERIAL PRIMARY KEY,
       project              BIGINT NOT NULL,
       created              BIGINT NOT NULL,
       hash                 TEXT NOT NULL,
       specification        TEXT NOT NULL,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- datasets
    CREATE TABLE IF NOT EXISTS datasets (
       id                   BIGSERIAL PRIMARY KEY,
       project              BIGINT NOT NULL,
       created              BIGINT NOT NULL,
       dataset_id           TEXT NOT NULL,
       hash                 TEXT NOT NULL,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- datasets raw hashed data points
    CREATE TABLE IF NOT EXISTS datasets_points (
       id   BIGSERIAL PRIMARY KEY,
       hash TEXT NOT NULL,
       json TEXT NOT NULL
    );",
    "-- datasets to data association (avoid duplication)
    CREATE TABLE IF NOT EXISTS datasets_joins (
       id                   BIGSERIAL PRIMARY KEY,
       dataset              BIGINT NOT NULL,
       point                BIGINT NOT NULL,
       point_idx            BIGINT NOT NULL,
       FOREIGN KEY(dataset) REFERENCES datasets(id),
       FOREIGN KEY(point)   REFERENCES datasets_points(id)
    );",
    "-- runs
    CREATE TABLE IF NOT EXISTS runs (
       id                   BIGSERIAL PRIMARY KEY,
       project              BIGINT NOT NULL,
       created              BIGINT NOT NULL,
       run_id               TEXT NOT NULL,
       run_type             TEXT NOT NULL,
       app_hash             TEXT NOT NULL,
       config_json          TEXT NOT NULL,
       status_json          TEXT NOT NULL,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- block executions
    CREATE TABLE IF NOT EXISTS block_executions (
       id        BIGSERIAL PRIMARY KEY,
       hash      TEXT NOT NULL,
       execution TEXT NOT NULL
    );",
    "-- runs to block_executions association (avoid duplication)
    CREATE TABLE IF NOT EXISTS runs_joins (
       id                           BIGSERIAL PRIMARY KEY,
       run                          BIGINT NOT NULL,
       block_idx                    BIGINT NOT NULL,
       block_type                   TEXT NOT NULL,
       block_name                   TEXT NOT NULL,
       input_idx                    BIGINT NOT NULL,
       map_idx                      BIGINT NOT NULL,
       block_execution              BIGINT NOT NULL,
       FOREIGN KEY(run)             REFERENCES runs(id),
       FOREIGN KEY(block_execution) REFERENCES block_executions(id)
    );",
    "-- Cache (non unique hash index)
    CREATE TABLE IF NOT EXISTS cache (
       id                   BIGSERIAL PRIMARY KEY,
       project              BIGINT NOT NULL,
       created              BIGINT NOT NULL,
       hash                 TEXT NOT NULL,
       request              TEXT NOT NULL,
       response             TEXT NOT NULL,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- data sources
    CREATE TABLE IF NOT EXISTS data_sources (
       id                   BIGSERIAL PRIMARY KEY,
       project              BIGINT NOT NULL,
       created              BIGINT NOT NULL,
       data_source_id       TEXT NOT NULL,
       config_json          TEXT NOT NULL,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- data sources documents
    CREATE TABLE IF NOT EXISTS data_sources_documents (
       id                       BIGSERIAL PRIMARY KEY,
       data_source              BIGINT NOT NULL,
       created                  BIGINT NOT NULL,
       document_id              TEXT NOT NULL,
       metadata_json            TEXT NOT NULL,
       hash                     TEXT NOT NULL,
       status                   TEXT NOT NULL,
       splitter                 TEXT NOT NULL,
       FOREIGN KEY(data_source) REFERENCES data_sources(id),
    );",
    "-- data sources chunks
    CREATE TABLE IF NOT EXISTS data_sources_chunks (
       id                    BIGSERIAL PRIMARY KEY,
       document              BIGINT NOT NULL,
       created               BIGINT NOT NULL,
       hash                  TEXT NOT NULL,
       FOREIGN KEY(document) REFERENCES data_sources_documents(id),
    );",
];

pub const SQL_INDEXES: [&'static str; 10] = [
    "CREATE INDEX IF NOT EXISTS
       idx_specifications_project_created ON specifications (project, created);",
    "CREATE INDEX IF NOT EXISTS
       idx_specifications_project_hash ON specifications (project, hash);",
    "CREATE INDEX IF NOT EXISTS
       idx_datasets_project_dataset_id_created
       ON datasets (project, dataset_id, created);",
    "CREATE INDEX IF NOT EXISTS
       idx_runs_project_run_type_created ON runs (project, run_type, created);",
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
    "CREATE INDEX IF NOT EXISTS
       idx_cache_project_hash ON cache (project, hash);",
];
