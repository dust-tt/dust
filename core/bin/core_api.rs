use anyhow::anyhow;
use axum::{
    extract::DefaultBodyLimit,
    middleware::from_fn,
    routing::{delete, get, patch, post},
    Router,
};
use axum_tracing_opentelemetry::middleware::{OtelAxumLayer, OtelInResponseLayer};
use dust::api::api_state::APIState;
use dust::api::{
    data_sources, databases, datasets, folders, nodes, projects, runs, specifications,
    sqlite_workers, tables, tags, tokenize,
};
use dust::{
    api_keys::validate_api_key,
    data_sources::qdrant::QdrantClients,
    databases::table_upserts_background_worker::TableUpsertsBackgroundWorker,
    databases_store::{self, gcs::GoogleCloudStorageDatabasesStore},
    deno::js_executor::JSExecutor,
    open_telemetry::init_subscribers,
    search_stores::search_store::{ElasticsearchSearchStore, SearchStore},
    stores::{
        postgres,
        store::{self},
    },
};
use std::sync::Arc;
use tikv_jemallocator::Jemalloc;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
};
use tracing::{error, info};

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

/// Index

async fn index() -> &'static str {
    "dust_api server ready"
}

// Misc

fn main() {
    JSExecutor::init();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        // Start the background worker for table upserts
        tokio::task::spawn(async move {
            TableUpsertsBackgroundWorker::start_loop().await;
        });

        let _guard = init_subscribers()?;

        let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await?;
                Box::new(store)
            }
            Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
        };

        let databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send> = {
            let store = GoogleCloudStorageDatabasesStore::new();
            Box::new(store)
        };

        let url = std::env::var("ELASTICSEARCH_URL").expect("ELASTICSEARCH_URL must be set");
        let username =
            std::env::var("ELASTICSEARCH_USERNAME").expect("ELASTICSEARCH_USERNAME must be set");
        let password =
            std::env::var("ELASTICSEARCH_PASSWORD").expect("ELASTICSEARCH_PASSWORD must be set");

        let search_store : Box<dyn SearchStore + Sync + Send> = Box::new(ElasticsearchSearchStore::new(&url, &username, &password).await?);

        let state = Arc::new(APIState::new(
            store,
            databases_store,
            QdrantClients::build().await?,
            search_store,
        ));

        let router = Router::new()
        // Projects
        .route("/projects", post(projects::projects_create))
        .route("/projects/{project_id}", delete(projects::projects_delete))
        .route("/projects/{project_id}/clone", post(projects::projects_clone))
        // Specifications
        .route(
            "/projects/{project_id}/specifications/check",
            post(specifications::specifications_check),
        )
        .route(
            "/projects/{project_id}/specifications/{hash}",
            get(specifications::specifications_retrieve),
        )
        .route(
            "/projects/{project_id}/specifications",
            get(specifications::specifications_get),
        )
        .route(
            "/projects/{project_id}/specifications",
            post(specifications::specifications_post),
        )

        // Datasets
        .route("/projects/{project_id}/datasets", post(datasets::datasets_register))
        .route("/projects/{project_id}/datasets", get(datasets::datasets_list))
        .route(
            "/projects/{project_id}/datasets/{dataset_id}/{hash}",
            get(datasets::datasets_retrieve),
        )
        // Runs
        .route("/projects/{project_id}/runs", post(runs::runs_create))
        .route(
            "/projects/{project_id}/runs/stream",
            post(runs::runs_create_stream),
        )
        .route("/projects/{project_id}/runs", get(runs::runs_list))
        .route(
            "/projects/{project_id}/runs/batch",
            post(runs::runs_retrieve_batch),
        )
        .route("/projects/{project_id}/runs/{run_id}", get(runs::runs_retrieve))
        .route(
            "/projects/{project_id}/runs/{run_id}",
            delete(runs::runs_delete),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/cancel",
            post(runs::runs_cancel),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/blocks/{block_type}/{block_name}",
            get(runs::runs_retrieve_block),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/status",
            get(runs::runs_retrieve_status),
        )
        // DataSources
        .route(
            "/projects/{project_id}/data_sources",
            post(data_sources::data_sources_register),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            patch(data_sources::data_sources_update),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            get(data_sources::data_sources_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tokenize",
            post(data_sources::data_sources_tokenize),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/versions",
            get(data_sources::data_sources_documents_versions_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents",
            post(data_sources::data_sources_documents_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/blob",
            get(data_sources::data_sources_documents_retrieve_blob),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/tags",
            patch(data_sources::data_sources_documents_update_tags),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/parents",
            patch(data_sources::data_sources_documents_update_parents),
        )
        // Provided by the data_source block.
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/search",
            post(data_sources::data_sources_search),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents",
            get(data_sources::data_sources_documents_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}",
            get(data_sources::data_sources_documents_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/text",
            get(data_sources::data_sources_documents_retrieve_text),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}",
            delete(data_sources::data_sources_documents_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/scrub_deleted_versions",
            post(data_sources::data_sources_documents_scrub_deleted_versions),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            delete(data_sources::data_sources_delete),
        )
        // Databases
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/validate_csv_content",
            post(tables::tables_validate_csv_content),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables",
            post(tables::tables_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/parents",
            patch(tables::tables_update_parents),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}",
            get(tables::tables_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables",
            get(tables::tables_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}",
            delete(tables::tables_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/blob",
            get(tables::tables_retrieve_blob),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows",
            post(tables::tables_rows_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/csv",
            post(tables::tables_csv_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows/{row_id}",
            get(tables::tables_rows_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows/{row_id}",
            delete(tables::tables_rows_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows",
            get(tables::tables_rows_list),
        )
        .route(
            "/query_database",
            post(databases::databases_query_run),
        )
        .route(
            "/database_schema",
            post(databases::databases_schema_retrieve),
        )
        .route("/sqlite_workers", delete(sqlite_workers::sqlite_workers_delete))

        // Folders
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders",
            post(folders::folders_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders/{folder_id}",
            get(folders::folders_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders",
            get(folders::folders_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders/{folder_id}",
            delete(folders::folders_delete),
        )

        //Search
        .route("/nodes/search", post(nodes::nodes_search))
        .route("/stats", post(data_sources::data_sources_stats))
        .route("/tags/search", post(tags::tags_search))

        // Misc
        .route("/tokenize", post(tokenize::tokenize))
        .route("/tokenize/batch", post(tokenize::tokenize_batch))
        .layer(OtelInResponseLayer::default())
        // Start OpenTelemetry trace on incoming request.
        .layer(OtelAxumLayer::default())
        // Extensions
        .layer(DefaultBodyLimit::disable())
        .layer(from_fn(validate_api_key))
        .with_state(state.clone());

        let sqlite_heartbeat_router = Router::new()
            .route("/sqlite_workers", post(sqlite_workers::sqlite_workers_heartbeat))
            .layer(from_fn(validate_api_key))
            .with_state(state.clone());

        let health_check_router = Router::new().route("/", get(index));

        let app = Router::new()
            .merge(router)
            .merge(sqlite_heartbeat_router)
            .merge(health_check_router);

        // Start the APIState run loop.
        let runloop_state = state.clone();
        tokio::task::spawn(async move { runloop_state.run_loop().await });

        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        let (tx2, rx2) = tokio::sync::oneshot::channel::<()>();

        let srv = axum::serve(
            TcpListener::bind::<std::net::SocketAddr>("[::]:3001".parse().unwrap()).await?,
            app.into_make_service(),
        )
        .with_graceful_shutdown(async {
            rx1.await.ok();
        });

        tokio::spawn(async move {
            if let Err(e) = srv.await {
                error!(error = %e, "Server error");
            }
            info!("[GRACEFUL] Server stopped");
            tx2.send(()).ok();
        });

        info!(pid = std::process::id() as u64, "dust_api server started");

        let mut stream = signal(SignalKind::terminate()).unwrap();
        stream.recv().await;

        // Gracefully shut down the server
        info!("[GRACEFUL] SIGTERM received, stopping server...");
        tx1.send(()).ok();

        // Wait for the server to shutdown
        info!("[GRACEFUL] Awaiting server shutdown...");
        rx2.await.ok();

        // Wait for the run loop to finish.
        info!("[GRACEFUL] Awaiting stop loop...");
        state.stop_loop().await;

        info!("[GRACEFUL] Exiting");

        // sleep for 1 second to allow the logger to flush
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        Ok::<(), anyhow::Error>(())
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            error!(error = %e, "dust_api server error");
            std::process::exit(1);
        }
    }
}
