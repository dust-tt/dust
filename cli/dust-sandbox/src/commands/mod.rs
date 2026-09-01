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
    cmd_frame_call, cmd_frame_convert, cmd_frame_create, cmd_frame_publish, cmd_frame_register,
    cmd_frame_share_link, cmd_frame_validate,
};
pub use function::{cmd_function_build, cmd_function_get, cmd_function_run};
pub use healthcheck::cmd_healthcheck;
pub use resolve::cmd_resolve;
pub use tools::{cmd_exec, cmd_list_servers, cmd_list_tools, OffloadResolutionError};
pub use version::cmd_version;

/// Serializes tests that mutate process-global environment variables (e.g.
/// DUST_POD_DATABASES_DIR). Env vars are shared across the whole test binary, so every module
/// whose tests touch them must take this ONE lock — two module-local mutexes guarding the same
/// variable would not exclude each other under parallel test threads.
/// TODO(pod-state): function::tests currently keeps its own ENV_LOCK (and, post Track 3 merge,
/// also mutates DUST_POD_DATABASES_DIR) — migrate it to this shared lock after the stacks merge.
#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
