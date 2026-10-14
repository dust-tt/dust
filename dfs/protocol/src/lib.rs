/**
 * @cc [owner:spolu,label:architecture;api] dfs-generated-rpc
 * RPC types and client/server bindings MUST be generated from `proto/dfs.proto`. Generated bindings
 * do not enforce server behavior.
 */
pub mod rpc {
    tonic::include_proto!("dfs.v1");
}

pub mod error;
mod id;
mod reference;

pub use id::{InvalidId, ObjectId};
pub use reference::ObjectRef;

/// Most references one `Stat` request may carry.
pub const STAT_MAX_REFERENCES: usize = 256;

/// Most UTF-8 bytes in an object name.
pub const NAME_MAX_BYTES: usize = 255;

/// Whether `name` is a valid object name: 1 to `NAME_MAX_BYTES` UTF-8 bytes, without slash or NUL,
/// and neither `.` nor `..`.
pub fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= NAME_MAX_BYTES
        && name != "."
        && name != ".."
        && !name.contains(['/', '\0'])
}
