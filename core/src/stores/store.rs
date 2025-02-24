use anyhow::Result;
use async_trait::async_trait;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use std::collections::HashMap;
use tokio_postgres::NoTls;

use crate::{
    blocks::block::BlockType,
    cached_request::CachedRequest,
    data_sources::{
        data_source::{DataSource, DataSourceConfig, Document, DocumentVersion},
        folder::Folder,
        node::{Node, ProviderVisibility},
    },
    databases::{table::Table, table_schema::TableSchema, transient_database::TransientDatabase},
    dataset::Dataset,
    http::request::{HttpRequest, HttpResponse},
    project::Project,
    providers::{
        embedder::{EmbedderRequest, EmbedderVector},
        llm::{LLMChatGeneration, LLMChatRequest, LLMGeneration, LLMRequest},
    },
    run::{Run, RunStatus, RunType},
    search_filter::SearchFilter,
    sqlite_workers::client::SqliteWorker,
};

pub struct DocumentCreateParams {
    pub document_id: String,
    pub title: Option<String>,
    pub mime_type: Option<String>,
    pub provider_visibility: Option<ProviderVisibility>,
    pub timestamp: u64,
    pub tags: Vec<String>,
    pub parents: Vec<String>,
    pub source_url: Option<String>,
    pub hash: String,
    pub text_size: u64,
    pub chunk_count: usize,
    pub created: u64,
}

impl From<Document> for DocumentCreateParams {
    fn from(document: Document) -> Self {
        DocumentCreateParams {
            document_id: document.document_id,
            title: Some(document.title),
            mime_type: Some(document.mime_type),
            provider_visibility: document.provider_visibility,
            timestamp: document.timestamp,
            tags: document.tags,
            parents: document.parents,
            source_url: document.source_url,
            hash: document.hash,
            text_size: document.text_size,
            chunk_count: document.chunk_count,
            created: document.created,
        }
    }
}

pub struct TableUpsertParams {
    pub table_id: String,
    pub name: String,
    pub description: String,
    pub timestamp: u64,
    pub tags: Vec<String>,
    pub parents: Vec<String>,
    pub source_url: Option<String>,
    pub remote_database_table_id: Option<String>,
    pub remote_database_secret_id: Option<String>,
    pub title: String,
    pub mime_type: String,
    pub provider_visibility: Option<ProviderVisibility>,
}

pub struct FolderUpsertParams {
    pub folder_id: String,
    pub timestamp: u64,
    pub title: String,
    pub parents: Vec<String>,
    pub mime_type: String,
    pub source_url: Option<String>,
    pub provider_visibility: Option<ProviderVisibility>,
}

#[async_trait]
pub trait Store {
    fn raw_pool(&self) -> &Pool<PostgresConnectionManager<NoTls>>;
    // Projects
    async fn create_project(&self) -> Result<Project>;
    async fn delete_project(&self, project: &Project) -> Result<()>;

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
    async fn list_specification_hashes(&self, project: &Project) -> Result<Vec<String>>;
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
    async fn load_runs(
        &self,
        project: &Project,
        run_ids: Vec<String>,
    ) -> Result<HashMap<String, Run>>;

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
        store_blocks_results: bool,
    ) -> Result<()>;

    async fn load_run(
        &self,
        project: &Project,
        run_id: &str,
        // None return all, Some(None), return none, Some(Some(_)) return that block.
        block: Option<Option<(BlockType, String)>>,
    ) -> Result<Option<Run>>;
    async fn delete_run(&self, project: &Project, run_id: &str) -> Result<()>;

    // DataSources
    async fn has_data_sources(&self, project: &Project) -> Result<bool>;
    async fn register_data_source(&self, project: &Project, ds: &DataSource) -> Result<()>;
    async fn load_data_source(
        &self,
        project: &Project,
        data_source_id: &str,
    ) -> Result<Option<DataSource>>;
    async fn load_data_source_by_internal_id(
        &self,
        data_source_internal_id: &str,
    ) -> Result<Option<DataSource>>;
    async fn update_data_source_config(
        &self,
        project: &Project,
        data_source_id: &str,
        config: &DataSourceConfig,
    ) -> Result<()>;
    async fn load_data_source_document(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        version_hash: &Option<String>,
    ) -> Result<Option<Document>>;
    async fn find_data_source_document_ids(
        &self,
        project: &Project,
        data_source_id: &str,
        filter: &Option<SearchFilter>,
        view_filter: &Option<SearchFilter>,
        limit_offset: Option<(usize, usize)>,
        include_count: bool,
    ) -> Result<(Vec<String>, usize)>;
    async fn create_data_source_document(
        &self,
        project: &Project,
        data_source_id: String,
        create_params: DocumentCreateParams,
    ) -> Result<Document>;
    async fn update_data_source_node_tags(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        add_tags: &Vec<String>,
        remove_tags: &Vec<String>,
    ) -> Result<Vec<String>>;
    async fn update_data_source_document_chunk_count(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        chunk_count: u64,
    ) -> Result<()>;
    async fn list_data_source_document_versions(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        limit_offset: Option<(usize, usize)>,
        view_filter: &Option<SearchFilter>,
        latest_hash: &Option<String>,
        include_count: bool,
    ) -> Result<(Vec<DocumentVersion>, usize)>;
    async fn list_data_source_documents(
        &self,
        project: &Project,
        data_source_id: &str,
        view_filter: &Option<SearchFilter>,
        document_ids: &Option<Vec<String>>,
        limit_offset: Option<(usize, usize)>,
        remove_system_tags: bool,
        include_count: bool,
    ) -> Result<(Vec<Document>, usize)>;
    async fn delete_data_source_document(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
    ) -> Result<()>;
    async fn delete_data_source_document_version(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        version: &DocumentVersion,
    ) -> Result<()>;
    async fn delete_data_source(&self, project: &Project, data_source_id: &str) -> Result<u64>;
    // Databases
    async fn upsert_database(
        &self,
        table_ids_hash: &str,
        worker_ttl: u64,
    ) -> Result<TransientDatabase>;
    async fn load_database(
        &self,
        table_ids_hash: &str,
        worker_ttl: u64,
    ) -> Result<Option<TransientDatabase>>;
    async fn find_databases_using_table(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
        worker_ttl: u64,
    ) -> Result<Vec<TransientDatabase>>;
    async fn delete_database(&self, table_ids_hash: &str) -> Result<()>;
    // Tables
    async fn upsert_data_source_table(
        &self,
        project: Project,
        data_source_id: String,
        upsert_params: TableUpsertParams,
    ) -> Result<Table>;
    async fn update_data_source_table_schema(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
        schema: &TableSchema,
    ) -> Result<()>;
    async fn invalidate_data_source_table_schema(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
    ) -> Result<()>;
    async fn load_data_source_table(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
    ) -> Result<Option<Table>>;
    async fn list_data_source_tables(
        &self,
        project: &Project,
        data_source_id: &str,
        view_filter: &Option<SearchFilter>,
        table_ids: &Option<Vec<String>>,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Table>, usize)>;
    async fn delete_data_source_table(
        &self,
        project: &Project,
        data_source_id: &str,
        table_id: &str,
    ) -> Result<()>;
    // Folders
    async fn upsert_data_source_folder(
        &self,
        project: Project,
        data_source_id: String,
        upsert_params: FolderUpsertParams,
    ) -> Result<Folder>;
    async fn load_data_source_folder(
        &self,
        project: &Project,
        data_source_id: &str,
        folder_id: &str,
    ) -> Result<Option<Folder>>;
    async fn list_data_source_folders(
        &self,
        project: &Project,
        data_source_id: &str,
        view_filter: &Option<SearchFilter>,
        folder_ids: &Option<Vec<String>>,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Folder>, usize)>;
    async fn delete_data_source_folder(
        &self,
        project: &Project,
        data_source_id: &str,
        folder_id: &str,
    ) -> Result<()>;
    // Data Sources Nodes
    async fn get_data_source_node(
        &self,
        project: &Project,
        data_source_id: &str,
        node_id: &str,
    ) -> Result<Option<(Node, i64)>>;
    // returns a list of (node, row_id, element_row_id)
    async fn list_data_source_nodes(
        &self,
        id_cursor: i64,
        batch_size: i64,
    ) -> Result<Vec<(Node, i64, i64)>>;
    async fn update_data_source_node_parents(
        &self,
        project: &Project,
        data_source_id: &str,
        document_id: &str,
        parents: &Vec<String>,
    ) -> Result<()>;

    async fn count_nodes_children(&self, nodes: &Vec<Node>) -> Result<HashMap<String, u64>>;

    // LLM Cache
    async fn llm_cache_get(
        &self,
        project: &Project,
        request: &LLMRequest,
    ) -> Result<Vec<LLMGeneration>>
    where
        LLMRequest: CachedRequest;
    async fn llm_cache_store(
        &self,
        project: &Project,
        request: &LLMRequest,
        generation: &LLMGeneration,
    ) -> Result<()>
    where
        LLMRequest: CachedRequest;

    // LLM Chat Cache
    async fn llm_chat_cache_get(
        &self,
        project: &Project,
        request: &LLMChatRequest,
    ) -> Result<Vec<LLMChatGeneration>>
    where
        LLMChatRequest: CachedRequest;
    async fn llm_chat_cache_store(
        &self,
        project: &Project,
        request: &LLMChatRequest,
        generation: &LLMChatGeneration,
    ) -> Result<()>
    where
        LLMChatRequest: CachedRequest;

    // Embedder Cache
    async fn embedder_cache_get(
        &self,
        project: &Project,
        request: &EmbedderRequest,
    ) -> Result<Vec<EmbedderVector>>
    where
        EmbedderRequest: CachedRequest;
    async fn embedder_cache_store(
        &self,
        project: &Project,
        request: &EmbedderRequest,
        embedding: &EmbedderVector,
    ) -> Result<()>
    where
        EmbedderRequest: CachedRequest;

    // HTTP Cache
    async fn http_cache_get(
        &self,
        project: &Project,
        request: &HttpRequest,
    ) -> Result<Vec<HttpResponse>>
    where
        HttpRequest: CachedRequest;
    async fn http_cache_store(
        &self,
        project: &Project,
        request: &HttpRequest,
        response: &HttpResponse,
    ) -> Result<()>
    where
        HttpRequest: CachedRequest;

    // SQLite Workers
    async fn sqlite_workers_list(&self) -> Result<Vec<SqliteWorker>>;
    async fn sqlite_workers_upsert(&self, url: &str, ttl: u64) -> Result<(SqliteWorker, bool)>;
    async fn sqlite_workers_delete(&self, url: &str) -> Result<()>;
    async fn sqlite_workers_cleanup(&self, ttl: u64) -> Result<()>;

    // Cloning
    fn clone_box(&self) -> Box<dyn Store + Sync + Send>;
}

impl Clone for Box<dyn Store + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

pub const POSTGRES_TABLES: [&'static str; 16] = [
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
       id                   BIGSERIAL PRIMARY KEY,
       hash                 TEXT,
       execution            TEXT NOT NULL,
       project              BIGINT,
       created              BIGINT,
       FOREIGN KEY(project) REFERENCES projects(id)
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
       type                 TEXT,
       version              INTEGER,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- data sources
    CREATE TABLE IF NOT EXISTS data_sources (
       id                   BIGSERIAL PRIMARY KEY,
       project              BIGINT NOT NULL,
       created              BIGINT NOT NULL,
       data_source_id       TEXT NOT NULL,
       internal_id          TEXT NOT NULL,
       config_json          TEXT NOT NULL,
       FOREIGN KEY(project) REFERENCES projects(id)
    );",
    "-- data sources documents
    CREATE TABLE IF NOT EXISTS data_sources_documents (
       id                       BIGSERIAL PRIMARY KEY,
       data_source              BIGINT NOT NULL,
       created                  BIGINT NOT NULL,
       document_id              TEXT NOT NULL,
       timestamp                BIGINT NOT NULL,
       hash                     TEXT NOT NULL,
       text_size                BIGINT NOT NULL,
       chunk_count              BIGINT NOT NULL,
       status                   TEXT NOT NULL,
       FOREIGN KEY(data_source) REFERENCES data_sources(id)
    );",
    "-- SQLite workers
    CREATE TABLE IF NOT EXISTS sqlite_workers (
       id                   BIGSERIAL PRIMARY KEY,
       created              BIGINT NOT NULL,
       url                  TEXT NOT NULL,
       last_heartbeat       BIGINT NOT NULL
    );",
    "-- database
    CREATE TABLE IF NOT EXISTS databases (
       id                           BIGSERIAL PRIMARY KEY,
       created                      BIGINT NOT NULL,
       table_ids_hash               TEXT NOT NULL, -- unique. A hash of the table_ids in this database.
       sqlite_worker                BIGINT,
       FOREIGN KEY(sqlite_worker)   REFERENCES sqlite_workers(id)
    );",
    "-- databases tables
    CREATE TABLE IF NOT EXISTS tables (
       id                           BIGSERIAL PRIMARY KEY,
       created                      BIGINT NOT NULL,
       table_id                     TEXT NOT NULL, -- unique within datasource
       name                         TEXT NOT NULL, -- unique within datasource
       description                  TEXT NOT NULL,
       timestamp                    BIGINT NOT NULL,
       schema                       TEXT, -- json, kept up-to-date automatically with the last insert
       schema_stale_at              BIGINT, -- timestamp when the schema was last invalidated
       data_source                  BIGINT NOT NULL,
       remote_database_table_id     TEXT,
       remote_database_secret_id    TEXT,
       FOREIGN KEY(data_source)     REFERENCES data_sources(id)
    );",
    "-- data sources folders
    CREATE TABLE IF NOT EXISTS data_sources_folders (
       id                           BIGSERIAL PRIMARY KEY,
       data_source                  BIGINT NOT NULL,
       created                      BIGINT NOT NULL,
       folder_id                    TEXT NOT NULL,
       FOREIGN KEY(data_source)    REFERENCES data_sources(id)
    );",
    "-- data sources nodes
    CREATE TABLE IF NOT EXISTS data_sources_nodes (
       id                           BIGSERIAL PRIMARY KEY,
       created                      BIGINT NOT NULL,
       data_source                  BIGINT NOT NULL,
       timestamp                    BIGINT NOT NULL,
       node_id                      TEXT NOT NULL,
       title                        TEXT NOT NULL,
       mime_type                    TEXT NOT NULL,
       provider_visibility          TEXT,
       parents                      TEXT[] NOT NULL,
       source_url                   TEXT,
       tags_array                   TEXT[] NOT NULL DEFAULT array[]::text[],
       document                     BIGINT,
       \"table\"                    BIGINT,
       folder                       BIGINT,
       FOREIGN KEY(data_source)    REFERENCES data_sources(id),
       FOREIGN KEY(document)       REFERENCES data_sources_documents(id),
       FOREIGN KEY(\"table\")      REFERENCES tables(id),
       FOREIGN KEY(folder)         REFERENCES data_sources_folders(id),
       CONSTRAINT data_sources_nodes_document_id_table_id_folder_id_check CHECK (
           (document IS NOT NULL AND \"table\" IS NULL AND folder IS NULL) OR
           (document IS NULL AND \"table\" IS NOT NULL AND folder IS NULL) OR
           (document IS NULL AND \"table\" IS NULL AND folder IS NOT NULL)
        )
    );",
];

pub const SQL_INDEXES: [&'static str; 31] = [
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
    "CREATE INDEX IF NOT EXISTS
       idx_runs_created ON runs (created);",
    "CREATE UNIQUE INDEX IF NOT EXISTS
       idx_block_executions_hash ON block_executions (hash);",
    "CREATE UNIQUE INDEX IF NOT EXISTS
       idx_datasets_points_hash ON datasets_points (hash);",
    "CREATE INDEX IF NOT EXISTS
       idx_datasets_joins ON datasets_joins (dataset, point);",
    "CREATE INDEX IF NOT EXISTS
       idx_runs_joins ON runs_joins (run, block_execution);",
    "CREATE INDEX IF NOT EXISTS
       idx_runs_joins_block_execution ON runs_joins (block_execution);",
    "CREATE INDEX IF NOT EXISTS
       idx_cache_project_hash ON cache (project, hash);",
    "CREATE UNIQUE INDEX IF NOT EXISTS
       idx_data_sources_project_data_source_id ON data_sources (project, data_source_id);",
    "CREATE UNIQUE INDEX IF NOT EXISTS
       idx_data_sources_internal_id ON data_sources (internal_id);",
    "CREATE INDEX IF NOT EXISTS
       idx_data_sources_documents_data_source_document_id
       ON data_sources_documents (data_source, document_id);",
    "CREATE INDEX IF NOT EXISTS
       idx_data_sources_documents_data_source_status_timestamp
       ON data_sources_documents (data_source, status, timestamp);",
    "CREATE INDEX IF NOT EXISTS
       idx_data_sources_documents_data_source_document_id_hash
       ON data_sources_documents (data_source, document_id, hash);",
    "CREATE INDEX IF NOT EXISTS
       idx_data_sources_documents_data_source_document_id_status
       ON data_sources_documents (data_source, document_id, status);",
    "CREATE INDEX IF NOT EXISTS
       idx_data_sources_documents_data_source_document_id_created
       ON data_sources_documents (data_source, document_id, created DESC);",
    "CREATE UNIQUE INDEX IF NOT EXISTS
       idx_databases_table_ids_hash ON databases (table_ids_hash);",
    "CREATE UNIQUE INDEX IF NOT EXISTS
       idx_tables_data_source_table_id ON tables (data_source, table_id);",
    "CREATE UNIQUE INDEX IF NOT EXISTS
        idx_sqlite_workers_url ON sqlite_workers (url);",
    "CREATE INDEX IF NOT EXISTS
        idx_status_deleted ON data_sources_documents (id) WHERE status = 'deleted';",
    "CREATE UNIQUE INDEX IF NOT EXISTS
        idx_data_sources_folders_data_source_folder_id ON data_sources_folders(data_source, folder_id);",
    "CREATE UNIQUE INDEX IF NOT EXISTS
        idx_data_sources_nodes_data_source_node_id ON data_sources_nodes(data_source, node_id);",
    "CREATE INDEX IF NOT EXISTS
        idx_data_sources_nodes_parents_array ON data_sources_nodes USING GIN (parents);",
    "CREATE INDEX IF NOT EXISTS
        idx_data_sources_nodes_document ON data_sources_nodes(document);",
    "CREATE INDEX IF NOT EXISTS
        idx_data_sources_nodes_table ON data_sources_nodes(\"table\");",
    "CREATE INDEX IF NOT EXISTS
        idx_data_sources_nodes_folder ON data_sources_nodes(folder);",
    "CREATE INDEX IF NOT EXISTS
        idx_data_sources_nodes_parents_second ON data_sources_nodes (data_source, (parents[2]));",
    "CREATE INDEX IF NOT EXISTS
        idx_data_sources_nodes_parents_single ON data_sources_nodes (data_source, (array_length(parents, 1) = 1));",
];

pub const SQL_FUNCTIONS: [&'static str; 2] = [
    // SQL function to delete the project datasets / datasets_joins / datasets_points
    r#"
        CREATE OR REPLACE FUNCTION delete_project_datasets(v_project_id BIGINT)
        RETURNS void AS $$
        DECLARE
            datasets_ids BIGINT[];
            datasets_points_ids BIGINT[];
        BEGIN
            -- Store datasets_ids IDs in an array for the specified project
            SELECT array_agg(id) INTO datasets_ids FROM datasets WHERE project = v_project_id;

            -- Store datasets_points IDs in an array
            SELECT array_agg(point) INTO datasets_points_ids
            FROM datasets_joins
            WHERE dataset = ANY(datasets_ids);

            -- Delete from datasets_joins where point IDs match those in datasets_points
            DELETE FROM datasets_joins WHERE point = ANY(datasets_points_ids);

            -- Now delete from datasets_points using the stored IDs
            DELETE FROM datasets_points WHERE id = ANY(datasets_points_ids);

            -- Finally, delete from datasets where datasets IDs match those in the project
            DELETE FROM datasets WHERE id = ANY(datasets_ids);
        END;
        $$ LANGUAGE plpgsql;
    "#,
    // SQL function to delete a given run + its block_executions / runs_joins
    r#"
        CREATE OR REPLACE FUNCTION delete_run(v_project_id BIGINT, v_run_run_id TEXT)
        RETURNS void AS $$
        DECLARE
            block_exec_ids BIGINT[];
        BEGIN
            -- Store block_execution IDs in an array
            SELECT array_agg(rj.block_execution) INTO block_exec_ids
            FROM runs_joins rj
            JOIN runs r ON rj.run = r.id WHERE r.project = v_project_id AND r.run_id = v_run_run_id;
            -- Delete from runs_joins where run IDs match those in the project
            DELETE FROM runs_joins WHERE block_execution = ANY(block_exec_ids);
            -- Now delete from block_executions using the stored IDs
            DELETE FROM block_executions WHERE id = ANY(block_exec_ids);
            -- Finally, delete from runs where run IDs match those in the project
            DELETE FROM runs WHERE run_id = v_run_run_id;
        END;
        $$ LANGUAGE plpgsql;
    "#,
];
