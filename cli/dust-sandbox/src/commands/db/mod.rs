//! `dsbx db` database subcommands (reconcile/schema/list/query).
//!
//! Databases are sandbox-owned SQLite files `{name}.db` under `$DUST_POD_DATABASES_DIR`
//! (falling back to the image's `/sandbox-state/databases`). This Rust layer owns name
//! validation and path resolution; the DDL/SQL
//! work runs in the embedded Bun runner (same privilege-drop machinery as
//! `dsbx function`: dropped to `agent-proxied` via `runuser` whenever dsbx runs as
//! root, NODE_PATH pointed at the image's global npm modules so `drizzle-kit`
//! resolves at run time).

use std::ffi::OsStr;
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
const FRAME_ID_ENV: &str = "FRAME_ID";

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

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum SandboxOwner {
    Conversation,
    Frame,
    Unknown,
    Invalid,
}

fn is_nonempty_marker(value: Option<&OsStr>) -> bool {
    value.is_some_and(|value| !value.is_empty())
}

pub(crate) fn sandbox_owner_from_markers(
    conversation_id: Option<&OsStr>,
    frame_id: Option<&OsStr>,
) -> SandboxOwner {
    match (
        is_nonempty_marker(conversation_id),
        is_nonempty_marker(frame_id),
    ) {
        (true, false) => SandboxOwner::Conversation,
        (false, true) => SandboxOwner::Frame,
        (false, false) => SandboxOwner::Unknown,
        (true, true) => SandboxOwner::Invalid,
    }
}

fn current_sandbox_owner() -> SandboxOwner {
    sandbox_owner_from_markers(
        std::env::var_os(CONVERSATION_ID_ENV).as_deref(),
        std::env::var_os(FRAME_ID_ENV).as_deref(),
    )
}

/**
 * @cc [owner:davidebbo,label:product] frame-target-only-from-conversation
 * `--frame` MUST be accepted only when `CONVERSATION_ID` is the sole sandbox owner marker. A
 * conversation sandbox without `--frame` MUST fail instead of inspecting its empty local database
 * directory, while a Frame sandbox without `--frame` MUST keep using its local databases.
 */
pub(crate) fn resolve_execution_target<'a>(
    requested_frame_id: Option<&'a str>,
    sandbox_owner: SandboxOwner,
) -> Result<DbExecutionTarget<'a>> {
    match (requested_frame_id, sandbox_owner) {
        (Some(frame_id), SandboxOwner::Conversation) => {
            validate_frame_id(frame_id)?;
            Ok(DbExecutionTarget::RemoteFrame(frame_id))
        }
        (Some(_), SandboxOwner::Frame | SandboxOwner::Unknown | SandboxOwner::Invalid) => Err(
            anyhow!("--frame can only be used from a conversation sandbox"),
        ),
        (None, SandboxOwner::Conversation) => Err(anyhow!(
            "conversation sandboxes have no local Frame databases; pass --frame <frame-id>"
        )),
        (None, SandboxOwner::Invalid) => Err(anyhow!(
            "invalid sandbox environment: CONVERSATION_ID and FRAME_ID are both set"
        )),
        (None, SandboxOwner::Frame | SandboxOwner::Unknown) => Ok(DbExecutionTarget::Local),
    }
}

pub(crate) fn execution_target(frame_id: Option<&str>) -> Result<DbExecutionTarget<'_>> {
    resolve_execution_target(frame_id, current_sandbox_owner())
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
            resolve_execution_target(Some("fil_abc123"), SandboxOwner::Conversation)
                .expect("conversation sandbox may target a Frame"),
            DbExecutionTarget::RemoteFrame("fil_abc123")
        );
        assert!(resolve_execution_target(Some("fil_abc123"), SandboxOwner::Frame).is_err());
        assert!(resolve_execution_target(Some("fil_abc123"), SandboxOwner::Unknown).is_err());
        assert!(resolve_execution_target(Some("fil_abc123"), SandboxOwner::Invalid).is_err());
    }

    #[test]
    fn requires_frame_target_in_conversation_sandboxes() {
        assert!(resolve_execution_target(None, SandboxOwner::Conversation).is_err());
        assert_eq!(
            resolve_execution_target(None, SandboxOwner::Frame)
                .expect("Frame sandbox uses its local databases"),
            DbExecutionTarget::Local
        );
        assert_eq!(
            resolve_execution_target(None, SandboxOwner::Unknown)
                .expect("host invocation keeps local behavior"),
            DbExecutionTarget::Local
        );
    }

    #[test]
    fn detects_reserved_sandbox_owner_markers() {
        use std::ffi::OsStr;

        assert_eq!(
            sandbox_owner_from_markers(Some(OsStr::new("conv_123")), None),
            SandboxOwner::Conversation
        );
        assert_eq!(
            sandbox_owner_from_markers(None, Some(OsStr::new("fil_123"))),
            SandboxOwner::Frame
        );
        assert_eq!(
            sandbox_owner_from_markers(Some(OsStr::new("")), None),
            SandboxOwner::Unknown
        );
        assert_eq!(
            sandbox_owner_from_markers(Some(OsStr::new("conv_123")), Some(OsStr::new("fil_123"))),
            SandboxOwner::Invalid
        );
    }
}
