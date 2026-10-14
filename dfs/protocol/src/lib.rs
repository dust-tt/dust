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
pub const STAT_MAX_REFERENCES: usize = 4_096;

/// Most bytes one `Read` request may ask for.
pub const READ_MAX_BYTES: u32 = 1024 * 1024;

/// Most UTF-8 bytes in an object name. Not taken from `libc`, which does not define `NAME_MAX` on
/// every platform.
/**
 * @cc [owner:fontanierh,label:api] linux-name-max
 * `NAME_MAX_BYTES` MUST NOT exceed Linux `NAME_MAX` (255 bytes per path component), so every dfs
 * name is a valid filename on a Linux mount.
 */
pub const NAME_MAX_BYTES: usize = 255;

/// Whether `name` is a valid object name: 1 to `NAME_MAX_BYTES` UTF-8 bytes, without slash or NUL,
/// and neither `.` nor `..`.
/**
 * @cc [owner:fontanierh,label:api] proto-name-rule
 * `is_valid_name` MUST accept exactly the stored basenames that `dfs-attribute-name` in
 * `proto/dfs.proto` allows for real non-root objects.
 */
pub fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= NAME_MAX_BYTES
        && name != "."
        && name != ".."
        && !name.contains(['/', '\0'])
}
