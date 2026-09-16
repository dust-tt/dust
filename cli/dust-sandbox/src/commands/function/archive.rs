//! Materialization of a publication's `functions.tar` for warm and cold runs.
//!
//! New publications upload an uncompressed tar alongside the per-function GCS
//! objects. Before either path runs we copy that single object off gcsfuse,
//! extract into the local warm dir, and eagerly fill the per-sha bundle cache
//! for every slug — so warm `importFromCache` and cold resolve both skip an
//! uncached functions/ readdir. Older publications without the archive keep
//! using [`super::resolve_existing`].

use std::fs::File;
use std::io::{copy, ErrorKind, Read, Write};
use std::os::unix::fs::{DirBuilderExt as _, OpenOptionsExt as _};
use std::path::{Component, Path, PathBuf};

use anyhow::{anyhow, Result};
use tar::Archive;

use super::is_valid_name;
use super::warm::{self, ensure_trusted_warm_dir};

const ARCHIVE_FILE_NAME: &str = "functions.tar";
const COMPLETE_MARKER: &str = ".complete";

/// Hard caps so a hostile or corrupt archive cannot fill the sandbox disk.
const MAX_ARCHIVE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_ENTRIES: usize = 256;
const MAX_UNCOMPRESSED_BYTES: u64 = 64 * 1024 * 1024;

/// Copy + extract the publication's `functions.tar` into the local warm
/// archives dir and eagerly populate the per-sha bundle cache for every
/// extracted slug. Idempotent when an extract already exists. Used before
/// warm/cold invoke and by the publish-time seed command.
pub fn ensure_functions_archive_extracted(functions_dir: &Path) -> Option<PathBuf> {
    let publication_dir = functions_dir.parent()?;
    let publication_key = publication_dir
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| is_safe_publication_key(s))?;

    // Prefer an existing local extract before any gcsfuse touch: publications
    // are immutable per id, so a completed extract is definitive. Avoids a
    // ~1s metadata probe on every subsequent cold of the same publish.
    let extract_dir = if let Some(extract_dir) = existing_extract_dir(publication_key) {
        extract_dir
    } else {
        let archive_path = publication_dir.join(ARCHIVE_FILE_NAME);
        // Existence probe: one metadata hit on gcsfuse when the file is remote.
        // Missing archive (legacy publications) is the common fallback path.
        if !archive_path.is_file() {
            return None;
        }
        materialize_archive(&archive_path, publication_key)?
    };

    // Every slug in the tar → bundles/<content-sha>.js so warm and later
    // colds of other functions in this publication skip fuse entirely.
    warm::populate_bundle_caches_from_dir(&extract_dir);
    Some(extract_dir)
}

fn existing_extract_dir(publication_key: &str) -> Option<PathBuf> {
    let extract_dir = archives_root()?.join(publication_key);
    if extract_dir.join(COMPLETE_MARKER).is_file() {
        Some(extract_dir)
    } else {
        None
    }
}

fn is_safe_publication_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 128
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn archives_root() -> Option<PathBuf> {
    let dir = ensure_trusted_warm_dir()?.join("archives");
    let mut builder = std::fs::DirBuilder::new();
    builder.mode(0o700);
    match builder.create(&dir) {
        Ok(()) => {}
        Err(e) if e.kind() == ErrorKind::AlreadyExists => {}
        Err(_) => return None,
    }
    Some(dir)
}

fn materialize_archive(archive_path: &Path, publication_key: &str) -> Option<PathBuf> {
    let root = archives_root()?;
    let extract_dir = root.join(publication_key);
    let marker = extract_dir.join(COMPLETE_MARKER);
    if marker.is_file() {
        return Some(extract_dir);
    }
    // Incomplete leftover from a crashed extract — start clean.
    let _ = std::fs::remove_dir_all(&extract_dir);

    let tmp_dir = root.join(format!("{publication_key}.tmp-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp_dir);
    let mut builder = std::fs::DirBuilder::new();
    builder.mode(0o700);
    builder.create(&tmp_dir).ok()?;

    if let Err(e) = extract_archive_limited(archive_path, &tmp_dir) {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        tracing::warn!(
            error = %e,
            archive = %archive_path.display(),
            "failed to materialize functions.tar; falling back to gcsfuse resolve"
        );
        return None;
    }

    // Marker last so concurrent readers never see a half-extracted tree.
    File::create(tmp_dir.join(COMPLETE_MARKER)).ok()?;

    match std::fs::rename(&tmp_dir, &extract_dir) {
        Ok(()) => Some(extract_dir),
        Err(e) if e.kind() == ErrorKind::AlreadyExists => {
            // Lost the race to another dsbx; use the winner's tree.
            let _ = std::fs::remove_dir_all(&tmp_dir);
            if extract_dir.join(COMPLETE_MARKER).is_file() {
                Some(extract_dir)
            } else {
                None
            }
        }
        Err(_) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            None
        }
    }
}

fn extract_archive_limited(archive_path: &Path, dest: &Path) -> Result<()> {
    let meta = std::fs::metadata(archive_path)?;
    if meta.len() > MAX_ARCHIVE_BYTES {
        return Err(anyhow!("functions.tar too large ({} bytes)", meta.len()));
    }

    // Copy off the mount first so extract reads local bytes only (one GCS
    // object read through gcsfuse, then pure local I/O).
    let local_tar = dest.join(ARCHIVE_FILE_NAME);
    {
        let mut src = File::open(archive_path)?;
        let mut dst = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&local_tar)?;
        let copied = copy(&mut src, &mut dst)?;
        if copied > MAX_ARCHIVE_BYTES {
            return Err(anyhow!("functions.tar copy exceeded size cap"));
        }
        dst.flush()?;
    }

    let file = File::open(&local_tar)?;
    let mut archive = Archive::new(file);
    let mut entries = 0usize;
    let mut uncompressed: u64 = 0;

    for entry in archive.entries()? {
        let entry = entry?;
        entries += 1;
        if entries > MAX_ENTRIES {
            return Err(anyhow!("functions.tar has too many entries"));
        }

        let path = entry.path()?.into_owned();
        let name = validate_archive_entry_path(&path)?;
        let size = entry.size();
        uncompressed = uncompressed.saturating_add(size);
        if uncompressed > MAX_UNCOMPRESSED_BYTES {
            return Err(anyhow!("functions.tar uncompressed size too large"));
        }

        let out_path = dest.join(name);
        let mut out = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&out_path)?;
        // Bound the copy even if the tar header lied about size.
        let mut limited = entry.take(size.saturating_add(1));
        let written = copy(&mut limited, &mut out)?;
        if written > size {
            return Err(anyhow!("functions.tar entry larger than header size"));
        }
        out.flush()?;
    }

    // Drop the local copy of the tar; extracted files are enough.
    let _ = std::fs::remove_file(&local_tar);
    Ok(())
}

fn validate_archive_entry_path(path: &Path) -> Result<String> {
    let mut components = path.components();
    let name = match (components.next(), components.next()) {
        (Some(Component::Normal(os)), None) => os
            .to_str()
            .ok_or_else(|| anyhow!("non-utf8 archive entry"))?
            .to_string(),
        _ => {
            return Err(anyhow!(
                "archive entry must be a single relative file name: {}",
                path.display()
            ))
        }
    };
    let stem = Path::new(&name)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("archive entry missing stem"))?;
    if !is_valid_name(stem) {
        return Err(anyhow!("invalid function name in archive: {stem}"));
    }
    let ext = Path::new(&name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    match ext {
        "ts" | "js" | "mjs" | "cjs" => Ok(name),
        _ => Err(anyhow!("unsupported archive entry extension: {ext}")),
    }
}

#[cfg(test)]
fn resolve_in_dir(name: &str, dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut matches: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path.file_name().and_then(|s| s.to_str()) != Some(COMPLETE_MARKER)
                && path.file_stem().and_then(|s| s.to_str()) == Some(name)
        })
        .collect();
    match matches.len() {
        1 => matches.pop(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt as _;
    use tempfile::TempDir;

    fn write_tar(dir: &Path, entries: &[(&str, &str)]) -> PathBuf {
        let tar_path = dir.join(ARCHIVE_FILE_NAME);
        let file = File::create(&tar_path).unwrap();
        let mut builder = tar::Builder::new(file);
        for (name, content) in entries {
            let bytes = content.as_bytes();
            let mut header = tar::Header::new_gnu();
            header.set_size(bytes.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder.append_data(&mut header, *name, bytes).unwrap();
        }
        builder.finish().unwrap();
        tar_path
    }

    #[test]
    fn rejects_path_traversal_entries() {
        assert!(validate_archive_entry_path(Path::new("../x.ts")).is_err());
        assert!(validate_archive_entry_path(Path::new("a/b.ts")).is_err());
        assert!(validate_archive_entry_path(Path::new("/abs.ts")).is_err());
        assert!(validate_archive_entry_path(Path::new("good-name.ts")).is_ok());
    }

    #[test]
    fn extracts_and_resolves_locally() {
        // ensure_trusted_warm_dir refuses root; skip when running as root in CI.
        if rustix::process::geteuid().is_root() {
            return;
        }
        let tmp = TempDir::new().unwrap();
        let pub_dir = tmp.path().join("pub-abc");
        let functions_dir = pub_dir.join("functions");
        std::fs::create_dir_all(&functions_dir).unwrap();
        write_tar(&pub_dir, &[("list-todos.ts", "export default {}")]);

        // Point warm dir at a temp HOME so we do not touch the real one.
        let home = tmp.path().join("home");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::set_permissions(&home, std::fs::Permissions::from_mode(0o700)).unwrap();
        // SAFETY: test-only, single-threaded for this process env mutation under ENV_LOCK
        // is not held here — this unit test avoids env and uses extract_archive_limited
        // directly instead.
        let extract = tmp.path().join("out");
        std::fs::create_dir_all(&extract).unwrap();
        extract_archive_limited(&pub_dir.join(ARCHIVE_FILE_NAME), &extract).unwrap();
        let resolved = resolve_in_dir("list-todos", &extract).unwrap();
        assert_eq!(
            std::fs::read_to_string(resolved).unwrap(),
            "export default {}"
        );
    }

    #[test]
    fn extract_eagerly_populates_sha_cache_for_every_slug() {
        if rustix::process::geteuid().is_root() {
            return;
        }
        let tmp = TempDir::new().unwrap();
        let pub_dir = tmp.path().join("pub-eager");
        let functions_dir = pub_dir.join("functions");
        std::fs::create_dir_all(&functions_dir).unwrap();
        let list_src = "export const list = 1";
        let add_src = "export const add = 2";
        write_tar(
            &pub_dir,
            &[("list-todos.ts", list_src), ("add-todo.ts", add_src)],
        );

        let home = tmp.path().join("home");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::set_permissions(&home, std::fs::Permissions::from_mode(0o700)).unwrap();
        let original_home = std::env::var_os("HOME");
        // SAFETY: test-only process env for warm-dir location.
        unsafe { std::env::set_var("HOME", &home) };

        let extract =
            ensure_functions_archive_extracted(&functions_dir).expect("archive should materialize");
        assert!(extract.join(COMPLETE_MARKER).is_file());

        let list_sha = {
            let digest = ring::digest::digest(&ring::digest::SHA256, list_src.as_bytes());
            digest
                .as_ref()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        };
        let add_sha = {
            let digest = ring::digest::digest(&ring::digest::SHA256, add_src.as_bytes());
            digest
                .as_ref()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        };
        let list_cached = warm::cached_bundle_path(&list_sha).expect("list-todos cached");
        let add_cached = warm::cached_bundle_path(&add_sha).expect("add-todo cached");
        assert_eq!(std::fs::read_to_string(list_cached).unwrap(), list_src);
        assert_eq!(std::fs::read_to_string(add_cached).unwrap(), add_src);

        match original_home {
            Some(v) => unsafe { std::env::set_var("HOME", v) },
            None => unsafe { std::env::remove_var("HOME") },
        }
    }

    #[test]
    fn extract_rejects_oversized_archive() {
        let tmp = TempDir::new().unwrap();
        let tar_path = tmp.path().join(ARCHIVE_FILE_NAME);
        // Header claims small; we also check file metadata.len before open.
        let huge = vec![0u8; (MAX_ARCHIVE_BYTES as usize) + 1];
        std::fs::write(&tar_path, &huge).unwrap();
        let dest = tmp.path().join("out");
        std::fs::create_dir_all(&dest).unwrap();
        assert!(extract_archive_limited(&tar_path, &dest).is_err());
    }
}
