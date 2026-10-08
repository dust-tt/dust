use tokio::net::TcpListener;
use tonic::transport::server::TcpIncoming;

/// @cc [owner:spolu,label:performance] accepted-socket-nodelay
/// gRPC listeners MUST request TCP_NODELAY for accepted sockets. Tonic's server builder setting
/// does not apply to serve_with_incoming; omitting it introduces delayed-ACK latency on Linux.
pub fn incoming(listener: TcpListener) -> TcpIncoming {
    TcpIncoming::from(listener).with_nodelay(Some(true))
}
