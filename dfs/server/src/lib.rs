use std::{future::Future, time::Duration};

use anyhow::{Context, Result};
use dfs_protocol::rpc::dfs_server::DfsServer;
use tokio::{net::TcpListener, sync::oneshot};
use tokio_stream::wrappers::TcpListenerStream;
use tonic::{service::interceptor::InterceptedService, transport::Server};
use tonic_health::ServingStatus;

mod api;
pub mod auth;
pub mod storage;

const MAX_MESSAGE_SIZE: usize = 4 * 1024 * 1024;
const SHUTDOWN_TIMEOUT_SECONDS: u64 = 30;

/**
 * @cc [owner:spolu,label:api;concurrency] dfs-server-lifecycle
 * Health MUST report SERVING for the process and DFS service while accepting requests, then
 * NOT_SERVING on shutdown. Shutdown MUST stop accepting connections and allow at most 30 seconds
 * for active RPCs to drain.
 */
/**
 * @cc [owner:spolu,label:api;security] dfs-service-auth
 * Bearer validation MUST apply only to DFS RPCs. The gRPC health Check and Watch methods MUST
 * respond without authorization metadata.
 */
pub async fn serve(
    listener: TcpListener,
    server_key: &str,
    shutdown: impl Future<Output = ()>,
) -> Result<()> {
    let api = api::API::new(server_key)?;
    let (reporter, health) = tonic_health::server::health_reporter();
    reporter.set_serving::<DfsServer<api::API>>().await;
    let service = DfsServer::new(api)
        .max_decoding_message_size(MAX_MESSAGE_SIZE)
        .max_encoding_message_size(MAX_MESSAGE_SIZE);
    let (stop, stopped) = oneshot::channel();
    let server = Server::builder()
        .add_service(health)
        .add_service(InterceptedService::new(service, api::auth::bearer_auth))
        .serve_with_incoming_shutdown(TcpListenerStream::new(listener), async {
            let _ = stopped.await;
        });
    tokio::pin!(server);
    tokio::select! {
        result = &mut server => return Ok(result?),
        _ = shutdown => {}
    }

    tracing::info!("dfs-api draining");
    reporter.set_not_serving::<DfsServer<api::API>>().await;
    reporter
        .set_service_status("", ServingStatus::NotServing)
        .await;
    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(SHUTDOWN_TIMEOUT_SECONDS), server)
        .await
        .context("dfs-api shutdown timed out")??;
    tracing::info!("dfs-api stopped");
    Ok(())
}
