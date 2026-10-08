pub mod rpc {
    tonic::include_proto!("dfs.v5");
}

pub const BLOCK_SIZE: usize = 65_536;
pub const MAX_IO: usize = 1024 * 1024;
pub const MAX_REPLY: usize = 4 * 1024 * 1024;
pub const MAX_MESSAGE: usize = MAX_REPLY + 64 * 1024;
pub const MAX_STAT: usize = 256;
pub const MAX_LIST: u32 = 4096;
pub const MAX_GRANTS: usize = 512;
pub const MAX_XATTRS: usize = 32 * 1024;

pub mod credentials;
pub mod error;
pub mod id;
mod reference;
pub mod validate;

pub use id::ObjectId;
pub use reference::{ObjectRef, Revision};
