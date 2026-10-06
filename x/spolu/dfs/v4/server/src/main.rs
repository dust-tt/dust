use anyhow::{Context, Result, ensure};
use clap::Parser;
use dfs_protocol::{MAX_MESSAGE, credentials::read_key, rpc::dfs_server::DfsServer};
use dfs_server_v4::{
    State,
    api::Api,
    storage::{Storage, StorageConfig},
};
use std::{
    net::SocketAddr,
    path::PathBuf,
    time::{Duration, Instant},
};
use tokio::{
    net::TcpListener,
    signal::unix::{SignalKind, signal},
};
use tonic::transport::{Identity, Server, ServerTlsConfig};
use tracing::info;

#[derive(Parser)]
#[command(version, about = "dfs:// v4 FoundationDB filesystem server")]
struct Config {
    #[arg(long, env = "DFS_LISTEN", default_value = "127.0.0.1:8080")]
    listen: SocketAddr,
    #[arg(long, env = "DFS_SERVER_KEY_FILE")]
    server_key_file: PathBuf,
    #[arg(long, requires = "tls_key")]
    tls_cert: Option<PathBuf>,
    #[arg(long, requires = "tls_cert")]
    tls_key: Option<PathBuf>,
    /// Permit plaintext on a non-loopback interface for a local Docker VM.
    #[arg(long)]
    allow_insecure: bool,
    #[arg(long, default_value_t = 300)]
    shutdown_timeout_seconds: u64,
    #[command(flatten)]
    storage: StorageConfig,
}
fn main() -> Result<()> {
    dfs_server_v4::network::run(run())
}

async fn run() -> Result<()> {
    let config = Config::parse();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_writer(std::io::stderr)
        .json()
        .init();
    ensure!(
        config.listen.ip().is_loopback() || config.tls_cert.is_some() || config.allow_insecure,
        "non-loopback listeners require TLS or --allow-insecure for local development"
    );
    let key = read_key(&config.server_key_file).context("read server key")?;
    let storage = Storage::open(&config.storage).await?;
    let state = State::new(storage, &key)?;
    let mut server = Server::builder();
    if let (Some(cert), Some(key)) = (config.tls_cert, config.tls_key) {
        server = server.tls_config(ServerTlsConfig::new().identity(Identity::from_pem(
            tokio::fs::read(cert).await?,
            tokio::fs::read(key).await?,
        )))?;
    }
    let listener = TcpListener::bind(config.listen).await?;
    let mut interrupt = signal(SignalKind::interrupt())?;
    let mut terminate = signal(SignalKind::terminate())?;
    let (stop, stopped) = tokio::sync::oneshot::channel();
    info!(address = %listener.local_addr()?, "dfs server listening");
    let service = DfsServer::new(Api(state.clone()))
        .max_decoding_message_size(MAX_MESSAGE)
        .max_encoding_message_size(MAX_MESSAGE);
    let task = tokio::spawn(
        server
            .concurrency_limit_per_connection(64)
            .max_concurrent_streams(64)
            .add_service(service)
            .serve_with_incoming_shutdown(dfs_server_v4::transport::incoming(listener), async {
                let _ = stopped.await;
            }),
    );
    tokio::pin!(task);
    tokio::select! {
        result = &mut task => { result??; anyhow::bail!("server stopped unexpectedly"); }
        _ = interrupt.recv() => {}
        _ = terminate.recv() => {}
    }
    let started = Instant::now();
    info!("dfs server draining");
    let _ = stop.send(());
    tokio::time::timeout(
        Duration::from_secs(config.shutdown_timeout_seconds),
        async {
            task.await??;
            state.drain().await?;
            Ok::<(), anyhow::Error>(())
        },
    )
    .await
    .context("shutdown drain timed out")??;
    info!(
        drain_ms = started.elapsed().as_millis() as u64,
        "dfs server stopped"
    );
    Ok(())
}
