pub mod rpc {
    tonic::include_proto!("dfs.v1");
}

pub const BLOCK_SIZE: usize = 65_536;
pub const MAX_IO: usize = 1024 * 1024;
pub const MAX_MESSAGE: usize = 2 * MAX_IO;
pub const MAX_GRANTS: usize = 512;
pub const MAX_XATTRS: usize = 32 * 1024;

pub mod credentials;
pub mod error;
pub mod validate;
