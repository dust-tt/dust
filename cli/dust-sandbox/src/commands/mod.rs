pub mod db;
pub mod env;
mod filesystem;
pub mod forward;
pub mod frame;
pub mod function;
pub mod healthcheck;
pub mod resolve;
pub mod tools;
mod version;

pub use db::{cmd_db_list, cmd_db_query, cmd_db_reconcile, cmd_db_schema};
pub use env::cmd_env;
pub use filesystem::{run as run_filesystem, FilesystemCommand};
pub use forward::cmd_forward;
pub use frame::{
    cmd_frame_call, cmd_frame_create, cmd_frame_publish, cmd_frame_register, cmd_frame_share_link,
    cmd_frame_validate,
};
pub use function::{cmd_function_build, cmd_function_get, cmd_function_run};
pub use healthcheck::cmd_healthcheck;
pub use resolve::cmd_resolve;
pub use tools::{cmd_exec, cmd_list_servers, cmd_list_tools, OffloadResolutionError};
pub use version::cmd_version;

/// Serializes tests that mutate process-global environment variables. Every module whose tests
/// touch them must take this one lock so parallel test threads cannot race.
#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
