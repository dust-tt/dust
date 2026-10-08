use clap::Parser;
use dfs_fdb::{model::Credential, router::Router};
use std::{net::SocketAddr, path::PathBuf};
use tonic::transport::{Identity, Server, ServerTlsConfig};

#[derive(Parser)]
struct Args {
    #[arg(long, value_delimiter = ',', required = true)]
    frontends: Vec<String>,
    #[arg(long)]
    credentials: PathBuf,
    #[arg(long, default_value = "127.0.0.1:7544")]
    listen: SocketAddr,
    #[arg(long)]
    frontend_ca: Option<PathBuf>,
    #[arg(long, requires = "frontend_ca")]
    frontend_tls_name: Option<String>,
    #[arg(long, requires = "tls_key")]
    tls_cert: Option<PathBuf>,
    #[arg(long, requires = "tls_cert")]
    tls_key: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dfs_fdb::rpc::initialize_crypto();
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let args = Args::parse();
    anyhow::ensure!(
        args.listen.ip().is_loopback() || args.tls_cert.is_some(),
        "non-loopback router requires TLS"
    );
    let credentials: Vec<Credential> = serde_json::from_slice(&std::fs::read(args.credentials)?)?;
    let ca = args.frontend_ca.map(std::fs::read).transpose()?;
    let router = Router::new(args.frontends, &credentials, ca, args.frontend_tls_name)?;
    let shutdown = router.clone();
    let discovery = router.spawn_discovery();
    let mut server = Server::builder().concurrency_limit_per_connection(32);
    if let (Some(cert), Some(key)) = (args.tls_cert, args.tls_key) {
        server = server.tls_config(ServerTlsConfig::new().identity(Identity::from_pem(
            std::fs::read(cert)?,
            std::fs::read(key)?,
        )))?;
    }
    tracing::info!(address = %args.listen, "router ready");
    server
        .add_service(router.server())
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
        })
        .await?;
    discovery.abort();
    Ok(())
}
