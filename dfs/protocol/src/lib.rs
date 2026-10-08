/// @cc [owner:spolu,label:architecture;api] dfs-generated-rpc
/// RPC types and client/server bindings MUST be generated from `proto/dfs.proto`. Protocol behavior
/// MUST follow the specifications in `CONTRACTS`; generated bindings do not enforce server
/// behavior.
/**
 * @cc [owner:spolu,label:api] dfs-rust-json
 * RPC JSON MUST use Rust serde representations: string object IDs/references, numeric enum fields
 * and attribute/content versions, and arrays of byte values. It MUST NOT use protobuf JSON mapping.
 */
pub mod rpc {
    tonic::include_proto!("dfs.v1");
}

pub mod error;
mod id;
mod reference;

pub use id::{InvalidId, ObjectId};
pub use reference::ObjectRef;
