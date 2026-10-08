use clap::Parser;
use dfs_fdb::{
    Config, Store,
    engine::{Engine, Limits},
    model::Credential,
    rpc::Service,
};
use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tonic::transport::{Identity, Server, ServerTlsConfig};

#[derive(Parser)]
struct Args {
    #[arg(long)]
    cluster_file: String,
    #[arg(long)]
    namespace: String,
    #[arg(long)]
    credentials: PathBuf,
    #[arg(long, default_value = "127.0.0.1:7543")]
    listen: SocketAddr,
    #[arg(long, default_value_t = 64 << 20)]
    cache_bytes: usize,
    #[arg(long, requires = "elasticsearch")]
    search_listen: Option<SocketAddr>,
    #[arg(long, default_value_t = 100_000)]
    max_nodes: usize,
    #[arg(long, requires = "tls_key")]
    tls_cert: Option<PathBuf>,
    #[arg(long, requires = "tls_cert")]
    tls_key: Option<PathBuf>,
    #[arg(long, requires = "publication_signal_file")]
    pause_after_publication_head: Option<u64>,
    #[arg(long, requires = "pause_after_publication_head")]
    publication_signal_file: Option<PathBuf>,
    #[arg(long, value_delimiter = ',', requires = "index_tokens")]
    elasticsearch: Vec<String>,
    #[arg(long, value_delimiter = ',', requires = "elasticsearch")]
    index_tokens: Vec<PathBuf>,
    #[arg(long, requires_all = ["index_tokens", "index_signal_file"])]
    pause_before_index_checkpoint_head: Option<u64>,
    #[arg(long, requires = "pause_before_index_checkpoint_head")]
    index_signal_file: Option<PathBuf>,
}

fn main() -> anyhow::Result<()> {
    let network = unsafe { dfs_fdb::boot() };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let result = runtime.block_on(run());
    drop(runtime);
    drop(network);
    result
}

async fn run() -> anyhow::Result<()> {
    dfs_fdb::rpc::initialize_crypto();
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let args = Args::parse();
    anyhow::ensure!(
        args.listen.ip().is_loopback() || args.tls_cert.is_some(),
        "non-loopback RPC requires TLS"
    );
    let credentials: Vec<Credential> = serde_json::from_slice(&std::fs::read(args.credentials)?)?;
    let mut config = Config::new(args.cluster_file, args.namespace);
    config.cache_bytes = args.cache_bytes;
    let engine = Arc::new(
        Engine::open(
            Store::connect(config).await?,
            credentials,
            Limits {
                max_nodes: args.max_nodes,
                ..Limits::default()
            },
        )
        .await?,
    );
    let search_server = if let Some(address) = args.search_listen {
        Some(
            dfs_fdb::search::http::start(
                Arc::new(dfs_fdb::search::Search::new(
                    engine.clone(),
                    args.elasticsearch.clone(),
                )?),
                address,
                args.tls_cert.clone().zip(args.tls_key.clone()),
            )
            .await?,
        )
    } else {
        None
    };
    let index_worker = if args.elasticsearch.is_empty() {
        None
    } else {
        Some(dfs_fdb::search::worker::start(
            engine.clone(),
            args.elasticsearch,
            args.index_tokens,
            args.pause_before_index_checkpoint_head
                .zip(args.index_signal_file),
        )?)
    };
    let mut service = Service::new(engine.clone());
    if let (Some(head), Some(path)) = (
        args.pause_after_publication_head,
        args.publication_signal_file,
    ) {
        service = service.with_publication_pause(head, path);
    }
    let shutdown = service.clone();
    let mut server = Server::builder()
        .initial_stream_window_size(Some(2 << 20))
        .initial_connection_window_size(Some(8 << 20))
        .concurrency_limit_per_connection(16)
        .timeout(Duration::from_secs(130));
    if let (Some(cert), Some(key)) = (args.tls_cert, args.tls_key) {
        server = server.tls_config(ServerTlsConfig::new().identity(Identity::from_pem(
            std::fs::read(cert)?,
            std::fs::read(key)?,
        )))?;
    }
    tracing::info!(address = %args.listen, incarnation = %engine.incarnation, "frontend ready");
    let rpc = server
        .add_service(service.server())
        .serve_with_shutdown(args.listen, async move {
            #[cfg(unix)]
            {
                let mut terminate =
                    tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                        .expect("termination signal");
                tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
            }
            #[cfg(not(unix))]
            {
                let _ = tokio::signal::ctrl_c().await;
            }
            shutdown.stop();
        });
    let result = if let Some(mut http) = search_server {
        tokio::select! {
            result = rpc => {
                http.abort();
                result.map_err(anyhow::Error::from)
            }
            result = &mut http => Err(anyhow::anyhow!("search listener stopped: {result:?}")),
        }
    } else {
        rpc.await.map_err(anyhow::Error::from)
    };
    if let Some(worker) = index_worker {
        worker.abort();
    }
    tracing::info!("frontend stopped");
    result
}
