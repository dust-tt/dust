//! `dsbx db` — pod database subcommands (reconcile/schema/list/query).
//!
//! Databases are per-pod SQLite files `{name}.db` under `$DUST_POD_DATABASES_DIR`
//! (falling back to the image's `/pod-state/databases`, per the frozen paths-env.v1
//! contract). This Rust layer owns name validation and path resolution; the DDL/SQL
//! work runs in the embedded Bun runner (same privilege-drop machinery as
//! `dsbx function`: dropped to `agent-proxied` via `runuser` whenever dsbx runs as
//! root, NODE_PATH pointed at the image's global npm modules so `drizzle-kit`
//! resolves at run time).

use std::ffi::OsStr;
use std::path::PathBuf;
use std::process::Stdio;

use anyhow::{anyhow, Result};
use clap::Subcommand;
use tokio::process::Command;

use super::function::{ensure_runner, harness_node_path, running_as_root, set_mode, AGENT_USER};

mod list;
mod query;
mod reconcile;
mod schema;

pub use list::cmd_db_list;
pub use query::cmd_db_query;
pub use reconcile::cmd_db_reconcile;
pub use schema::cmd_db_schema;

pub(crate) use super::function::emit_error;

/// Directory holding the live pod databases. Set by front on `function run` /
/// `db *` execs; the constant fallback matches the image layout (paths-env.v1).
/// TODO(pod-state): Track 3's parallel stack adds identically-named consts plus a
/// `pod_databases_dir()` helper to src/commands/function/mod.rs for `function run` — after the
/// stacks merge, dedup onto a single shared definition (these here are the superset:
/// PathBuf-typed helper + empty-value fallback).
pub(crate) const POD_DATABASES_DIR_ENV: &str = "DUST_POD_DATABASES_DIR";
pub(crate) const DEFAULT_POD_DATABASES_DIR: &str = "/pod-state/databases";

#[derive(Subcommand)]
pub enum DbCommand {
    /// Reconcile a pod database with a drizzle schema file (additive DDL only)
    Reconcile {
        /// Database name (resolved to <name>.db in ${DUST_POD_DATABASES_DIR})
        name: String,
        /// Path to the drizzle schema file (databases/{db}.db.ts)
        schema_file: String,
    },
    /// Regenerate a drizzle schema file from a live pod database
    Schema {
        /// Database name (resolved to <name>.db in ${DUST_POD_DATABASES_DIR})
        name: String,
        /// Output path for the regenerated schema file
        out_schema: String,
    },
    /// List pod databases with sizes
    List,
    /// Execute read-only SQL (from stdin) against a pod database
    Query {
        /// Database name (resolved to <name>.db in ${DUST_POD_DATABASES_DIR})
        name: String,
    },
}

/// The configured pod databases directory, falling back to the image constant.
pub(crate) fn databases_dir() -> PathBuf {
    std::env::var_os(POD_DATABASES_DIR_ENV)
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_POD_DATABASES_DIR))
}

/// Database name contract (paths-env.v1): `^[a-z][a-z0-9_]{0,63}$`. Also blocks
/// path traversal — names never contain separators.
pub(crate) fn is_valid_db_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_lowercase()
        && name.len() <= 64
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

/// Resolve a database name to its `{name}.db` file path, or emit a typed error.
pub(crate) fn db_file_path(name: &str) -> Result<PathBuf> {
    if !is_valid_db_name(name) {
        return Err(emit_error(anyhow!(
            "invalid database name {name:?}: must match ^[a-z][a-z0-9_]{{0,63}}$"
        )));
    }
    Ok(databases_dir().join(format!("{name}.db")))
}

/// Spawn the embedded runner under `bun` for a `db-*` subcommand. Mirrors
/// `function`'s privilege model: dropped to `agent-proxied` via `runuser` whenever
/// dsbx runs privileged, NODE_PATH prepended with the global npm modules (where
/// drizzle-kit lives in the sandbox image), and stdout inherited so the runner's
/// one-line JSON envelope reaches the caller. Returns the exit code.
pub(crate) async fn spawn_db_runner(
    subcommand: &str,
    args: &[&OsStr],
    inherit_stdin: bool,
) -> Result<i32> {
    let runner = ensure_runner()?;
    let as_agent = running_as_root();
    if as_agent {
        // The dropped child must read the runner dsbx wrote as root (0600).
        set_mode(&runner, 0o644)
            .map_err(|e| emit_error(anyhow!("failed to prepare runner: {e}")))?;
    }

    let mut cmd = if as_agent {
        let mut c = Command::new("runuser");
        c.arg("-u")
            .arg(AGENT_USER)
            .arg("--")
            .arg("bun")
            .arg(&*runner);
        c
    } else {
        let mut c = Command::new("bun");
        c.arg(&*runner);
        c
    };
    cmd.arg(subcommand).args(args);
    cmd.env("NODE_PATH", harness_node_path())
        // Threaded to the bun child for consistency with the paths-env.v1 contract
        // (the runner itself receives resolved paths and does not read it today).
        .env(POD_DATABASES_DIR_ENV, databases_dir())
        .stdin(if inherit_stdin {
            Stdio::inherit()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    let status = cmd
        .status()
        .await
        .map_err(|e| emit_error(anyhow!("failed to run bun: {e}")))?;

    runner.close().ok();

    Ok(status.code().unwrap_or(1))
}

#[cfg(test)]
mod tests {
    use super::*;

    // The crate-shared env lock (commands/mod.rs): DUST_POD_DATABASES_DIR is process-global
    // and other modules' tests (Track 3's function::tests post-merge) mutate it too.
    use crate::commands::ENV_LOCK;

    #[test]
    fn accepts_contract_names() {
        assert!(is_valid_db_name("chat"));
        assert!(is_valid_db_name("a"));
        assert!(is_valid_db_name("chat_v2"));
        assert!(is_valid_db_name("a0123456789_z"));
        // 64 chars total (1 + 63) is the maximum.
        assert!(is_valid_db_name(&format!("a{}", "b".repeat(63))));
    }

    #[test]
    fn rejects_names_outside_the_contract() {
        assert!(!is_valid_db_name(""));
        assert!(!is_valid_db_name("Chat"));
        assert!(!is_valid_db_name("0chat"));
        assert!(!is_valid_db_name("_chat"));
        assert!(!is_valid_db_name("chat-db"));
        assert!(!is_valid_db_name("chat.db"));
        assert!(!is_valid_db_name("a/b"));
        assert!(!is_valid_db_name(".."));
        assert!(!is_valid_db_name(&format!("a{}", "b".repeat(64))));
    }

    #[test]
    fn databases_dir_defaults_to_the_image_constant() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var(POD_DATABASES_DIR_ENV);
        assert_eq!(databases_dir(), PathBuf::from(DEFAULT_POD_DATABASES_DIR));
    }

    #[test]
    fn databases_dir_honors_the_env_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(POD_DATABASES_DIR_ENV, "/tmp/pod-dbs");
        assert_eq!(databases_dir(), PathBuf::from("/tmp/pod-dbs"));
        std::env::remove_var(POD_DATABASES_DIR_ENV);
    }

    #[test]
    fn empty_env_override_falls_back_to_the_constant() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(POD_DATABASES_DIR_ENV, "");
        assert_eq!(databases_dir(), PathBuf::from(DEFAULT_POD_DATABASES_DIR));
        std::env::remove_var(POD_DATABASES_DIR_ENV);
    }

    #[test]
    fn db_file_path_joins_name_and_dir() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(POD_DATABASES_DIR_ENV, "/tmp/pod-dbs");
        assert_eq!(
            db_file_path("chat").unwrap(),
            PathBuf::from("/tmp/pod-dbs/chat.db")
        );
        std::env::remove_var(POD_DATABASES_DIR_ENV);
    }

    #[test]
    fn db_file_path_rejects_invalid_names() {
        assert!(db_file_path("../escape").is_err());
        assert!(db_file_path("Chat").is_err());
    }
}
