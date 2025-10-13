use crate::api::run_manager::RunManager;
use crate::data_sources::qdrant::QdrantClients;
use crate::search_stores::search_store::SearchStore;
use crate::sqlite_workers::client;
use crate::stores::store;
use crate::{app, databases_store, run};
use anyhow::Result;
use parking_lot::Mutex;
use std::sync::Arc;
use tracing::{error, info};

pub struct APIState {
    pub store: Box<dyn store::Store + Sync + Send>,
    pub databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send>,
    pub qdrant_clients: QdrantClients,
    pub search_store: Box<dyn SearchStore + Sync + Send>,
    run_manager: Arc<Mutex<RunManager>>,
}

impl APIState {
    pub fn new(
        store: Box<dyn store::Store + Sync + Send>,
        databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send>,
        qdrant_clients: QdrantClients,
        search_store: Box<dyn SearchStore + Sync + Send>,
    ) -> Self {
        APIState {
            store,
            qdrant_clients,
            databases_store,
            search_store,
            run_manager: Arc::new(Mutex::new(RunManager {
                pending_apps: vec![],
                pending_runs: vec![],
            })),
        }
    }

    pub fn run_app(
        &self,
        app: app::App,
        credentials: run::Credentials,
        secrets: run::Secrets,
        store_blocks_results: bool,
    ) {
        let mut run_manager = self.run_manager.lock();
        run_manager
            .pending_apps
            .push((app, credentials, secrets, store_blocks_results));
    }

    pub async fn stop_loop(&self) {
        loop {
            let pending_runs = {
                let manager = self.run_manager.lock();
                info!(
                    pending_runs = manager.pending_runs.len(),
                    "[GRACEFUL] stop_loop pending runs",
                );
                manager.pending_runs.len()
            };
            if pending_runs == 0 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(1024)).await;
        }
    }

    pub async fn run_loop(&self) -> Result<()> {
        let mut loop_count = 0;

        loop {
            let apps: Vec<(app::App, run::Credentials, run::Secrets, bool)> = {
                let mut manager = self.run_manager.lock();
                let apps = manager.pending_apps.drain(..).collect::<Vec<_>>();
                apps.iter().for_each(|app| {
                    manager
                        .pending_runs
                        .push(app.0.run_ref().unwrap().run_id().to_string());
                });
                apps
            };
            apps.into_iter().for_each(|mut app| {
                let store = self.store.clone();
                let databases_store = self.databases_store.clone();
                let qdrant_clients = self.qdrant_clients.clone();
                let manager = self.run_manager.clone();

                // Start a task that will run the app in the background.
                tokio::task::spawn(async move {
                    let now = std::time::Instant::now();

                    match app
                        .0
                        .run(
                            app.1,
                            app.2,
                            store,
                            databases_store,
                            qdrant_clients,
                            None,
                            app.3,
                        )
                        .await
                    {
                        Ok(()) => {
                            info!(
                                run = app.0.run_ref().unwrap().run_id(),
                                app_version = app.0.hash(),
                                elapsed = now.elapsed().as_millis(),
                                "Run finished"
                            );
                        }
                        Err(e) => {
                            error!(error = %e, "Run error");
                        }
                    }
                    {
                        let mut manager = manager.lock();
                        manager
                            .pending_runs
                            .retain(|run_id| run_id != app.0.run_ref().unwrap().run_id());
                    }
                });
            });
            loop_count += 1;
            tokio::time::sleep(std::time::Duration::from_millis(4)).await;
            if loop_count % 1024 == 0 {
                let manager = self.run_manager.lock();
                let runs_count = manager.pending_runs.len();
                if runs_count > 0 || loop_count % 65536 == 0 {
                    info!(pending_runs = runs_count, "Pending runs {}", runs_count);
                }
            }
            // Roughly every 4 minutes, cleanup dead SQLite workers if any.
            if loop_count % 65536 == 0 {
                let store = self.store.clone();
                tokio::task::spawn(async move {
                    match store
                        .sqlite_workers_cleanup(client::HEARTBEAT_INTERVAL_MS)
                        .await
                    {
                        Err(e) => {
                            error!(error = %e, "Failed to cleanup SQLite workers");
                        }
                        Ok(_) => (),
                    }
                });
            }
        }
    }
}
