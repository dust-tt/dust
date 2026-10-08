/// @cc [owner:spolu,label:architecture;api] dfs-generated-rpc
/// RPC types and client/server bindings MUST be generated from `proto/dfs.proto`. Generated bindings
/// do not enforce server behavior.
pub mod rpc {
    tonic::include_proto!("dfs.v1");
}

pub mod error;
mod id;
mod reference;

pub use id::{InvalidId, ObjectId};
pub use reference::ObjectRef;
