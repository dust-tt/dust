use std::path::Path;

use anyhow::{anyhow, Result};
use serde::Serialize;

use super::{databases_dir, emit_error};

#[derive(Serialize, Debug, PartialEq)]
struct DatabaseEntry {
    name: String,
    size_bytes: u64,
}

/// List the live sandbox databases (`*.db` files in the databases directory) with
/// their sizes as a one-line JSON envelope. A missing directory is an empty
/// list: it is created by the first reconcile that claims a database.
pub fn cmd_db_list() -> Result<()> {
    let dir = databases_dir();
    let databases = enumerate_databases(&dir)
        .map_err(|e| emit_error(anyhow!("cannot read {}: {e}", dir.display())))?;

    println!(
        "{}",
        serde_json::json!({ "ok": true, "databases": databases })
    );
    Ok(())
}

fn enumerate_databases(dir: &Path) -> std::io::Result<Vec<DatabaseEntry>> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Vec::new());
        }
        Err(e) => return Err(e),
    };

    let mut databases: Vec<DatabaseEntry> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        // Never follow symlinks: the databases dir is workload-writable, and a planted link
        // must not have dsbx report (or stat) a foreign file. DirEntry::file_type/metadata
        // do not traverse links.
        let is_regular_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
        if !is_regular_file || path.extension().and_then(|e| e.to_str()) != Some("db") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        // Hostile-name allowlist: only names satisfying the frozen contract are databases
        // (consistent with db_file_path and replica-name filtering).
        if !super::is_valid_db_name(name) {
            continue;
        }
        // Include the -wal sibling: @dust/pod runs with wal_autocheckpoint=0, so recent data
        // lives in the WAL until litestream checkpoints it.
        let mut size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let wal_path = dir.join(format!("{name}.db-wal"));
        if let Ok(wal_metadata) = std::fs::symlink_metadata(&wal_path) {
            if wal_metadata.is_file() {
                size_bytes += wal_metadata.len();
            }
        }
        databases.push(DatabaseEntry {
            name: name.to_string(),
            size_bytes,
        });
    }
    databases.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(databases)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_db_files_only_sorted_with_wal_inclusive_sizes() -> Result<()> {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("notes.db"), b"y")?;
        std::fs::write(dir.path().join("chat.db"), "x".repeat(42))?;
        // WAL size is folded into the database's size (wal_autocheckpoint=0 keeps data there);
        // SHM and stray files are not databases and never listed on their own.
        std::fs::write(dir.path().join("chat.db-wal"), "w".repeat(8))?;
        std::fs::write(dir.path().join("chat.db-shm"), b"s")?;
        std::fs::write(dir.path().join("readme.txt"), b"t")?;
        std::fs::create_dir(dir.path().join("subdir.db"))?;
        // Names outside the frozen ^[a-z][a-z0-9_]{0,63}$ contract are not databases.
        std::fs::write(dir.path().join("Weird Name.db"), b"n")?;
        std::fs::write(dir.path().join("UPPER.db"), b"n")?;

        let databases = enumerate_databases(dir.path())?;
        assert_eq!(
            databases,
            vec![
                DatabaseEntry {
                    name: "chat".to_string(),
                    size_bytes: 50
                },
                DatabaseEntry {
                    name: "notes".to_string(),
                    size_bytes: 1
                },
            ]
        );
        Ok(())
    }

    #[test]
    fn missing_dir_is_an_empty_list() -> Result<()> {
        let databases = enumerate_databases(Path::new("/nonexistent/dsbx-db-list-test"))?;
        assert!(databases.is_empty());
        Ok(())
    }
}
