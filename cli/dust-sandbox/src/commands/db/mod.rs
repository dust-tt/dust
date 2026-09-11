//! `dsbx db` database subcommands (reconcile/schema/list/query).
//!
//! Databases are sandbox-owned SQLite files `{name}.db` under `$DUST_POD_DATABASES_DIR`
//! (falling back to the image's `/sandbox-state/databases`). This Rust layer owns name
//! validation and path resolution; the DDL/SQL
//! work runs in the embedded Bun runner (same privilege-drop machinery as
//! `dsbx function`: dropped to `agent-proxied` via `runuser` whenever dsbx runs as
//! root, NODE_PATH pointed at the image's global npm modules so `drizzle-kit`
//! resolves at run time).

use std::path::PathBuf;

use anyhow::{anyhow, Result};
use clap::Subcommand;

use super::frame::validate_frame_id;
use super::function::spawn_runner;

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
/// `db *` execs; the constant fallback matches the image layout.
/// TODO(pod-state): function/mod.rs (Track 3, merged) carries identically-named consts plus
/// an Option-typed `pod_databases_dir()` for `function run` — dedup onto a single shared
/// definition (these here are the superset: PathBuf-typed helper + empty-value fallback).
pub(crate) const POD_DATABASES_DIR_ENV: &str = "DUST_POD_DATABASES_DIR";
pub(crate) const DEFAULT_POD_DATABASES_DIR: &str = "/sandbox-state/databases";
const CONVERSATION_ID_ENV: &str = "CONVERSATION_ID";
const NO_LOCAL_DATABASES_MESSAGE: &str = "conversation sandboxes have no local databases";

#[derive(Subcommand)]
pub enum DbCommand {
    /// Reconcile a sandbox database with a drizzle schema file (additive DDL only)
    Reconcile {
        /// Database name (resolved to <name>.db in ${DUST_POD_DATABASES_DIR})
        name: String,
        /// Path to the drizzle schema file (databases/{db}.db.ts)
        schema_file: String,
    },
    /// Regenerate a drizzle schema file from a live sandbox database
    Schema {
        /// Database name (resolved to <name>.db in ${DUST_POD_DATABASES_DIR})
        name: String,
        /// Output path for the regenerated schema file
        out_schema: String,
    },
    /// List databases with sizes
    List {
        /// Target Frame ID. Only valid from a conversation sandbox.
        #[arg(long)]
        frame: Option<String>,
    },
    /// Execute one SQL statement (from stdin) against a database (SELECT/DML; DDL is refused)
    Query {
        /// Database name (resolved to <name>.db in ${DUST_POD_DATABASES_DIR})
        name: String,
        /// Target Frame ID. Only valid from a conversation sandbox.
        #[arg(long)]
        frame: Option<String>,
    },
}

#[derive(Debug, PartialEq)]
pub(crate) enum DbExecutionTarget<'a> {
    Local,
    RemoteFrame(&'a str),
}

/// Front sets `CONVERSATION_ID` on conversation-owned sandboxes only (see
/// `getSandboxOwnerEnvVars` in front/lib/api/sandbox/owner.ts).
fn in_conversation_sandbox() -> bool {
    std::env::var_os(CONVERSATION_ID_ENV).is_some_and(|value| !value.is_empty())
}

/**
 * @cc [owner:davidebbo,label:product] frame-target-only-from-conversation
 * `--frame` MUST be accepted only in a conversation sandbox (`CONVERSATION_ID` set). A conversation
 * sandbox without `--frame` MUST fail instead of inspecting its empty local database directory;
 * any other sandbox MUST keep using its local databases.
 */
pub(crate) fn resolve_execution_target(
    requested_frame_id: Option<&str>,
    in_conversation: bool,
) -> Result<DbExecutionTarget<'_>> {
    match (requested_frame_id, in_conversation) {
        (Some(frame_id), true) => {
            validate_frame_id(frame_id)?;
            Ok(DbExecutionTarget::RemoteFrame(frame_id))
        }
        (Some(_), false) => Err(anyhow!(
            "--frame can only be used from a conversation sandbox"
        )),
        (None, true) => Err(anyhow!(
            "{NO_LOCAL_DATABASES_MESSAGE}; pass --frame <frame-id>"
        )),
        (None, false) => Ok(DbExecutionTarget::Local),
    }
}

/// Resolve where `db list` / `db query` run, emitting the stdout error envelope on failure.
pub(crate) fn execution_target(frame_id: Option<&str>) -> Result<DbExecutionTarget<'_>> {
    resolve_execution_target(frame_id, in_conversation_sandbox()).map_err(emit_error)
}

/// Guard for the local-only subcommands (`reconcile`, `schema`): a conversation sandbox has no
/// databases of its own, so creating one there would leave it invisible to `db list`.
pub(crate) fn require_local_databases() -> Result<()> {
    if in_conversation_sandbox() {
        return Err(emit_error(anyhow!(NO_LOCAL_DATABASES_MESSAGE)));
    }
    Ok(())
}

/// The configured pod databases directory, falling back to the image constant.
pub(crate) fn databases_dir() -> PathBuf {
    std::env::var_os(POD_DATABASES_DIR_ENV)
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_POD_DATABASES_DIR))
}

/// Valid database names: `^[a-z][a-z0-9_]{0,63}$`. Also blocks
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

    #[test]
    fn routes_frame_targets_only_from_conversation_sandboxes() {
        assert_eq!(
            resolve_execution_target(Some("fil_abc123"), true)
                .expect("conversation sandbox may target a Frame"),
            DbExecutionTarget::RemoteFrame("fil_abc123")
        );
        assert!(resolve_execution_target(Some("fil_abc123"), false).is_err());
        assert!(resolve_execution_target(Some("not-a-frame"), true).is_err());
    }

    #[test]
    fn requires_frame_target_in_conversation_sandboxes() {
        assert!(resolve_execution_target(None, true).is_err());
        assert_eq!(
            resolve_execution_target(None, false).expect("other sandboxes use local databases"),
            DbExecutionTarget::Local
        );
    }
}
