use tonic::transport::server::Router;

pub mod fdb;

/// Every gRPC service the server exposes. For now only the standard health service.
pub fn router() -> Router {
    let (_reporter, health) = tonic_health::server::health_reporter();
    tonic::transport::Server::builder().add_service(health)
}
