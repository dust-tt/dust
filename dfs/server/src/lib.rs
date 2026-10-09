use dfs_protocol::rpc::dfs_server::DfsServer;
use tonic::transport::server::Router;

pub mod auth;
pub mod fdb;
mod service;

/// Every gRPC service the server exposes. Health stays unauthenticated; Dfs requires a bearer key.
pub fn router() -> Router {
    let (_reporter, health) = tonic_health::server::health_reporter();
    let dfs = DfsServer::with_interceptor(service::DfsService, auth::bearer_auth);
    tonic::transport::Server::builder()
        .add_service(health)
        .add_service(dfs)
}
