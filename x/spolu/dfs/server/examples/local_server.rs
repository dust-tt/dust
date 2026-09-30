//! Local object-store fixture for FUSE development; never a production storage fallback.
use anyhow::{Context, Result};
use clap::Parser;
use dfs_server::{api, storage::Storage};
use slatedb::object_store::local::LocalFileSystem;
use std::{path::PathBuf, sync::Arc};
use tokio::{
    net::TcpListener,
    signal::unix::{SignalKind, signal},
};

#[derive(Parser)]
struct Config {
    #[arg(long)]
    store: PathBuf,
    #[arg(long, default_value = "127.0.0.1:8080")]
    listen: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::parse();
    std::fs::create_dir_all(&config.store)?;
    let storage = Arc::new(
        Storage::open(
            Arc::new(LocalFileSystem::new_with_prefix(config.store)?),
            &"fixture".parse()?,
        )
        .await?,
    );
    let state = api::ApiState::new(Some(storage.clone()), api::Access::from_env()?);
    let listener = TcpListener::bind(config.listen).await?;
    let mut interrupt = signal(SignalKind::interrupt())?;
    let mut terminate = signal(SignalKind::terminate())?;
    eprintln!("local dfs fixture listening at {}", listener.local_addr()?);
    let result = axum::serve(listener, api::router(state.clone()))
        .with_graceful_shutdown(async move {
            tokio::select! { _=interrupt.recv()=>{}, _=terminate.recv()=>{} }
        })
        .await;
    state.drain_file_jobs().await;
    storage.close().await?;
    result.context("serve local fixture")
}
