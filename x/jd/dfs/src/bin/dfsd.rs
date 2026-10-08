use clap::Parser;
use dfs_poc::{
    engine::{Engine, Limits},
    model::Credential,
    rpc::{Service, StreamLimits},
};
use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tonic::transport::{Identity, Server, ServerTlsConfig};

#[derive(Parser)]
struct Args {
    #[cfg(feature = "lexical-search")]
    #[arg(long, requires = "search_token_file")]
    search_index: Option<PathBuf>,
    #[cfg(feature = "lexical-search")]
    #[arg(long, requires = "search_index")]
    search_token_file: Option<PathBuf>,
    #[cfg(feature = "lexical-search")]
    #[arg(long, default_value = "127.0.0.1:7447")]
    search_listen: SocketAddr,
    #[cfg(feature = "lexical-search")]
    #[arg(long, default_value_t = 250)]
    search_poll_ms: u64,
    #[arg(long)]
    db: PathBuf,
    #[arg(long)]
    credentials: PathBuf,
    #[arg(long, default_value = "127.0.0.1:7443")]
    listen: SocketAddr,
    #[arg(long, default_value_t = 100)]
    sync_ms: u64,
    #[arg(long, default_value_t = 8 << 30)]
    tenant_bytes: u64,
    #[arg(long, default_value_t = 256 << 20)]
    pending_bytes: u64,
    #[arg(long, default_value_t = 100_000)]
    max_nodes: usize,
    #[arg(long, default_value_t = 256 << 20)]
    snapshot_bytes: usize,
    #[arg(long, default_value_t = 30_000)]
    writer_lease_ms: u64,
    #[arg(long, default_value_t = 8)]
    max_snapshots: usize,
    #[arg(long, default_value_t = 2)]
    tenant_snapshots: usize,
    #[arg(long, default_value_t = 64)]
    max_watches: usize,
    #[arg(long, default_value_t = 8)]
    tenant_watches: usize,
    #[arg(long)]
    tls_cert: Option<PathBuf>,
    #[arg(long)]
    tls_key: Option<PathBuf>,
    #[arg(long, value_parser = ["before_publish", "after_publish", "before_persist", "after_persist"])]
    fault_phase: Option<String>,
    #[arg(long, default_value_t = 1)]
    fault_after: u64,
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dfs_poc::rpc::initialize_crypto();
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let args = Args::parse();
    anyhow::ensure!(args.sync_ms > 0, "sync interval must be positive");
    anyhow::ensure!(args.max_nodes > 0, "node limit must be positive");
    anyhow::ensure!(
        args.snapshot_bytes > 0,
        "snapshot byte limit must be positive"
    );
    anyhow::ensure!(
        args.listen.ip().is_loopback() || (args.tls_cert.is_some() && args.tls_key.is_some()),
        "non-loopback requires TLS"
    );
    let credentials: Vec<Credential> = serde_json::from_slice(&std::fs::read(args.credentials)?)?;
    let engine = Arc::new(Engine::open(
        args.db,
        credentials,
        Limits {
            tenant_bytes: args.tenant_bytes,
            pending_bytes: args.pending_bytes,
            max_nodes: args.max_nodes,
            snapshot_bytes: args.snapshot_bytes,
            writer_lease_ms: args.writer_lease_ms,
            ..Limits::default()
        },
    )?);
    let service = Service::new(engine.clone()).with_stream_limits(StreamLimits {
        snapshots: args.max_snapshots,
        tenant_snapshots: args.tenant_snapshots,
        watches: args.max_watches,
        tenant_watches: args.tenant_watches,
    })?;
    *engine.fault.lock() = args.fault_phase.map(|phase| (phase, args.fault_after));
    let sync_engine = engine.clone();
    let sync_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(args.sync_ms));
        loop {
            interval.tick().await;
            let engine = sync_engine.clone();
            match tokio::task::spawn_blocking(move || engine.persist()).await {
                Ok(Ok(_)) => {}
                error => {
                    tracing::error!(?error, "background persistence stopped");
                    break;
                }
            }
        }
    });
    #[cfg(feature = "lexical-search")]
    let search_task = if let Some(path) = args.search_index {
        Some(
            dfs_poc::lexical::start(
                engine.clone(),
                dfs_poc::lexical::Config {
                    path,
                    token_file: args
                        .search_token_file
                        .ok_or_else(|| anyhow::anyhow!("search requires --search-token-file"))?,
                    listen: args.search_listen,
                    poll_ms: args.search_poll_ms,
                },
            )
            .await?,
        )
    } else {
        None
    };
    let mut server = Server::builder()
        .initial_stream_window_size(Some(2 << 20))
        .initial_connection_window_size(Some(8 << 20))
        .concurrency_limit_per_connection(16)
        .timeout(Duration::from_secs(10));
    if let (Some(cert), Some(key)) = (args.tls_cert, args.tls_key) {
        server = server.tls_config(ServerTlsConfig::new().identity(Identity::from_pem(
            std::fs::read(cert)?,
            std::fs::read(key)?,
        )))?;
    }
    tracing::info!(address = %args.listen, incarnation = %engine.incarnation, "serving");
    let shutdown_engine = engine.clone();
    server
        .add_service(service.server())
        .serve_with_shutdown(args.listen, async move {
            #[cfg(unix)]
            {
                let mut terminate =
                    tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                        .expect("signal handler");
                tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
            }
            #[cfg(not(unix))]
            {
                let _ = tokio::signal::ctrl_c().await;
            }
            if let Err(error) = tokio::task::spawn_blocking(move || shutdown_engine.drain()).await {
                tracing::error!(%error, "shutdown barrier worker failed");
            }
        })
        .await?;
    #[cfg(feature = "lexical-search")]
    if let Some(task) = search_task {
        task.abort();
    }
    sync_task.abort();
    let head = tokio::task::spawn_blocking(move || engine.drain()).await??;
    tracing::info!(persisted = head, "clean shutdown");
    Ok(())
}
