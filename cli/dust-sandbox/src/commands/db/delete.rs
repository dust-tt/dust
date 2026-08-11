use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};

use super::{db_file_path, emit_error};

/// SQLite sidecars that belong to a database file and must go with it. `@dust/pod` runs with
/// `wal_autocheckpoint=0`, so recent rows can live entirely in `-wal`: leaving it behind would let a
/// later reconcile of the same name recover data this delete was meant to destroy.
const DB_FILE_SIDECAR_SUFFIXES: [&str; 2] = ["-wal", "-shm"];

/// Delete a live pod database and its SQLite sidecars, reporting the files removed as a one-line
/// JSON envelope.
///
/// Idempotent: a name with nothing on disk succeeds with an empty `removed` list, so a caller
/// working from a replica listing never has to check what is live first.
///
/// This removes only the LIVE files. The litestream replica is the durable copy and outlives them,
/// so a caller deleting a database for good must wipe that replica prefix too — otherwise the next
/// cold-start restore brings the database back.
pub fn cmd_db_delete(name: &str) -> Result<()> {
    let db_path = db_file_path(name)?;
    let removed = remove_database_files(&db_path)
        .map_err(|e| emit_error(anyhow!("cannot delete {}: {e}", db_path.display())))?;

    println!("{}", serde_json::json!({ "ok": true, "removed": removed }));
    Ok(())
}

/// The database file's own path plus one path per sidecar suffix. Built by appending to the OsString
/// rather than formatting a display string, which would be lossy for a non-UTF8 directory.
fn database_file_paths(db_path: &Path) -> Vec<PathBuf> {
    let mut paths = vec![db_path.to_path_buf()];
    for suffix in DB_FILE_SIDECAR_SUFFIXES {
        let mut with_suffix = db_path.as_os_str().to_os_string();
        with_suffix.push(suffix);
        paths.push(PathBuf::from(with_suffix));
    }
    paths
}

/// Remove the database and its sidecars, returning the file names actually removed, in the order
/// attempted. A file that is already gone is skipped rather than failing the delete.
fn remove_database_files(db_path: &Path) -> std::io::Result<Vec<String>> {
    let mut removed: Vec<String> = Vec::new();

    for path in database_file_paths(db_path) {
        // `remove_file` unlinks a symlink itself and never follows it to its target, so a link
        // planted in the workload-writable databases dir cannot make this delete reach a foreign
        // file (the same reasoning as the no-follow guards in `db list`).
        match std::fs::remove_file(&path) {
            Ok(()) => {
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    removed.push(file_name.to_string());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e),
        }
    }

    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_the_database_with_its_sidecars() -> Result<()> {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("chat.db");
        std::fs::write(&db_path, b"main")?;
        std::fs::write(dir.path().join("chat.db-wal"), b"wal")?;
        std::fs::write(dir.path().join("chat.db-shm"), b"shm")?;

        let removed = remove_database_files(&db_path)?;

        assert_eq!(removed, vec!["chat.db", "chat.db-wal", "chat.db-shm"]);
        assert!(!db_path.exists());
        assert!(!dir.path().join("chat.db-wal").exists());
        assert!(!dir.path().join("chat.db-shm").exists());
        Ok(())
    }

    #[test]
    fn reports_only_the_files_that_existed() -> Result<()> {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("notes.db");
        std::fs::write(&db_path, b"main")?;

        let removed = remove_database_files(&db_path)?;

        assert_eq!(removed, vec!["notes.db"]);
        Ok(())
    }

    #[test]
    fn a_database_that_is_already_gone_is_not_an_error() -> Result<()> {
        let dir = tempfile::tempdir().expect("tempdir");

        // Idempotent: front deletes by name read from the replica, which may have no live file.
        let removed = remove_database_files(&dir.path().join("missing.db"))?;

        assert!(removed.is_empty());
        Ok(())
    }

    #[test]
    fn leaves_other_databases_untouched() -> Result<()> {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("chat.db");
        std::fs::write(&db_path, b"main")?;
        // A sibling whose name merely starts with the deleted one must survive.
        std::fs::write(dir.path().join("chat_v2.db"), b"other")?;
        std::fs::write(dir.path().join("notes.db"), b"other")?;

        remove_database_files(&db_path)?;

        assert!(dir.path().join("chat_v2.db").exists());
        assert!(dir.path().join("notes.db").exists());
        Ok(())
    }

    #[test]
    fn unlinks_a_planted_symlink_without_touching_its_target() -> Result<()> {
        let dir = tempfile::tempdir().expect("tempdir");
        let outside = dir.path().join("outside.txt");
        std::fs::write(&outside, b"secret")?;
        let db_path = dir.path().join("chat.db");
        // The databases dir is workload-writable, so a hostile link can sit at a database's path.
        std::os::unix::fs::symlink(&outside, &db_path)?;

        let removed = remove_database_files(&db_path)?;

        assert_eq!(removed, vec!["chat.db"]);
        assert!(!db_path.exists());
        assert!(outside.exists(), "the link's target must survive");
        Ok(())
    }

    #[test]
    fn rejects_a_name_outside_the_contract() {
        // Path traversal and hostile names are refused before any file is touched.
        assert!(cmd_db_delete("../../etc/passwd").is_err());
        assert!(cmd_db_delete("Chat").is_err());
        assert!(cmd_db_delete("").is_err());
    }
}
