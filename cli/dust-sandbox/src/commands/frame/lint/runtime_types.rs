use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use anyhow::{bail, ensure, Context};
use flate2::read::GzDecoder;
use reqwest::{Client, Url};
use ring::digest::{digest, SHA256};
use serde::Deserialize;

const MAX_ARCHIVE_BYTES: usize = 20 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    version: u8,
    id: String,
    modules: Vec<String>,
    path: String,
    tarball_sha256: String,
    size_bytes: usize,
}

pub(super) struct RuntimeTypes {
    pub directory: PathBuf,
    pub modules: Vec<String>,
}

/// @cc [owner:flvndvd,label:security] frame-types-verified-cache
/// Downloads MUST match the manifest checksum and size before extraction. Archive entries MUST
/// stay inside the cache and contain only declarations and JSON files. A cache entry MUST become
/// visible only after extraction succeeds. A changed manifest id MUST select new declarations.
pub(super) async fn fetch(viz_url: &str, cache_dir: &Path) -> anyhow::Result<RuntimeTypes> {
    let origin = Url::parse(viz_url).context("invalid Viz URL")?;
    ensure!(
        matches!(origin.scheme(), "http" | "https"),
        "Viz URL must use HTTP or HTTPS"
    );
    let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
    let bytes = download(
        &client,
        origin.join("/frame-runtime/manifest.json")?,
        64 * 1024,
    )
    .await?;
    let manifest: Manifest =
        serde_json::from_slice(&bytes).context("invalid Viz types manifest")?;
    validate_manifest(&manifest)?;
    fs::create_dir_all(cache_dir).context("failed to create the Frame types cache")?;
    let cache_dir = cache_dir.canonicalize()?;
    let directory = cache_dir.join(&manifest.id);
    if !directory.is_dir() {
        let archive = download(&client, origin.join(&manifest.path)?, MAX_ARCHIVE_BYTES).await?;
        ensure!(
            archive.len() == manifest.size_bytes,
            "Viz types archive size mismatch"
        );
        ensure!(
            sha256(&archive) == manifest.tarball_sha256,
            "Viz types archive checksum mismatch"
        );
        let staging = tempfile::tempdir_in(&cache_dir)?;
        extract(&archive, staging.path())?;
        ensure!(
            staging.path().join("tsconfig.json").is_file(),
            "Viz types archive has no tsconfig.json"
        );
        ensure!(
            staging.path().join("index.d.ts").is_file(),
            "Viz types archive has no index.d.ts"
        );
        // Another lint command may finish downloading these same types first.
        if let Err(error) = fs::rename(staging.path(), &directory) {
            if !directory.is_dir() {
                return Err(error).context("failed to save the Viz types cache");
            }
        }
    }
    Ok(RuntimeTypes {
        directory,
        modules: manifest.modules,
    })
}

fn validate_manifest(manifest: &Manifest) -> anyhow::Result<()> {
    ensure!(
        manifest.version == 1,
        "unsupported Viz types manifest version"
    );
    for hash in [&manifest.id, &manifest.tarball_sha256] {
        ensure!(
            hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "invalid Viz types checksum"
        );
    }
    ensure!(
        manifest.path == format!("/frame-runtime/{}.tgz", manifest.tarball_sha256),
        "invalid Viz types archive path"
    );
    ensure!(
        manifest.size_bytes > 0 && manifest.size_bytes <= MAX_ARCHIVE_BYTES,
        "Viz types archive is too large or empty"
    );
    ensure!(
        !manifest.modules.is_empty(),
        "Viz types manifest has no runtime modules"
    );
    Ok(())
}

async fn download(client: &Client, url: Url, limit: usize) -> anyhow::Result<Vec<u8>> {
    let mut response = client
        .get(url.clone())
        .send()
        .await
        .with_context(|| format!("failed to download {url}"))?
        .error_for_status()
        .with_context(|| format!("failed to download {url}"))?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        ensure!(
            bytes.len() + chunk.len() <= limit,
            "Viz types download exceeds its size limit"
        );
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn sha256(bytes: &[u8]) -> String {
    digest(&SHA256, bytes)
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn extract(bytes: &[u8], destination: &Path) -> anyhow::Result<()> {
    let mut archive = tar::Archive::new(GzDecoder::new(bytes).take(MAX_UNPACKED_BYTES + 1));
    let mut total_bytes = 0;
    for (index, entry) in archive.entries()?.enumerate() {
        ensure!(
            index < 10_000,
            "Viz types archive contains too many entries"
        );
        let mut entry = entry?;
        let relative = entry.path()?.into_owned();
        ensure!(
            relative
                .components()
                .all(|component| matches!(component, Component::Normal(_) | Component::CurDir)),
            "invalid Viz types archive path: {}",
            relative.display()
        );
        if entry.header().entry_type().is_dir() {
            continue;
        }
        ensure!(
            entry.header().entry_type().is_file(),
            "Viz types archive contains a link or special file"
        );
        let name = relative
            .to_str()
            .context("Viz types path must be valid UTF-8")?;
        ensure!(
            name.ends_with(".d.ts")
                || name.ends_with(".d.mts")
                || name.ends_with(".d.cts")
                || name.ends_with(".json"),
            "unexpected file in Viz types archive: {name}"
        );
        total_bytes += entry.size();
        ensure!(
            total_bytes <= MAX_UNPACKED_BYTES,
            "Viz types archive expands beyond its size limit"
        );
        if !entry.unpack_in(destination)? {
            bail!("Viz types archive path escapes the cache");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::thread;

    use flate2::{write::GzEncoder, Compression};
    use serde_json::json;

    use super::*;

    fn archive(declaration: &str) -> Vec<u8> {
        let mut builder = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::default()));
        for (name, content) in [("index.d.ts", declaration), ("tsconfig.json", "{}")] {
            let mut header = tar::Header::new_gnu();
            header.set_size(content.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(&mut header, name, content.as_bytes())
                .expect("append declaration");
        }
        builder
            .into_inner()
            .expect("finish tar")
            .finish()
            .expect("finish gzip")
    }

    fn manifest(archive: &[u8], id: &str) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "version": 1,
            "id": id,
            "modules": ["react"],
            "path": format!("/frame-runtime/{}.tgz", sha256(archive)),
            "tarballSha256": sha256(archive),
            "sizeBytes": archive.len()
        }))
        .expect("serialize manifest")
    }

    fn serve(responses: Vec<(String, Vec<u8>)>) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind server");
        let url = format!("http://{}", listener.local_addr().expect("server address"));
        let handle = thread::spawn(move || {
            for (path, body) in responses {
                let (mut socket, _) = listener.accept().expect("accept request");
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .expect("read timeout");
                let mut reader = BufReader::new(&socket);
                let mut request = String::new();
                reader.read_line(&mut request).expect("request line");
                assert!(request.starts_with(&format!("GET {path} ")), "{request}");
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).expect("request header");
                    if line == "\r\n" {
                        break;
                    }
                    assert!(!line.to_ascii_lowercase().starts_with("authorization:"));
                }
                write!(
                    socket,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .expect("response headers");
                socket.write_all(&body).expect("response body");
            }
        });
        (url, handle)
    }

    #[tokio::test]
    async fn caches_verified_types_and_refreshes_when_viz_changes() {
        let first = archive("export type Value = string");
        let second = archive("export type Value = number");
        let first_id = "a".repeat(64);
        let second_id = "b".repeat(64);
        let manifest_path = "/frame-runtime/manifest.json".to_owned();
        let (url, server) = serve(vec![
            (manifest_path.clone(), manifest(&first, &first_id)),
            (
                format!("/frame-runtime/{}.tgz", sha256(&first)),
                first.clone(),
            ),
            (manifest_path.clone(), manifest(&first, &first_id)),
            (manifest_path, manifest(&second, &second_id)),
            (format!("/frame-runtime/{}.tgz", sha256(&second)), second),
        ]);
        let cache = tempfile::tempdir().expect("cache directory");
        let initial = fetch(&url, cache.path()).await.expect("download types");
        let cached = fetch(&url, cache.path()).await.expect("reuse types");
        assert_eq!(initial.directory, cached.directory);
        assert_eq!(cached.modules, ["react"]);
        let updated = fetch(&url, cache.path()).await.expect("refresh types");
        assert_ne!(initial.directory, updated.directory);
        assert_eq!(
            fs::read_to_string(updated.directory.join("index.d.ts")).expect("updated declaration"),
            "export type Value = number"
        );
        assert_eq!(
            fs::read_dir(cache.path()).expect("cache entries").count(),
            2
        );
        server.join().expect("server completed");
    }

    #[tokio::test]
    async fn rejects_a_corrupt_download_without_caching_it() {
        let original = archive("export type Value = string");
        let mut corrupt = original.clone();
        corrupt[0] ^= 1;
        let (url, server) = serve(vec![
            (
                "/frame-runtime/manifest.json".to_owned(),
                manifest(&original, &"a".repeat(64)),
            ),
            (format!("/frame-runtime/{}.tgz", sha256(&original)), corrupt),
        ]);
        let cache = tempfile::tempdir().expect("cache directory");
        let error = fetch(&url, cache.path())
            .await
            .err()
            .expect("checksum failure");
        assert!(error.to_string().contains("checksum mismatch"));
        assert_eq!(
            fs::read_dir(cache.path()).expect("cache entries").count(),
            0
        );
        server.join().expect("server completed");
    }

    #[test]
    fn rejects_links_executable_files_and_paths_outside_the_cache() {
        for (name, kind) in [
            ("../escape.json", tar::EntryType::Regular),
            ("run.js", tar::EntryType::Regular),
            ("link.d.ts", tar::EntryType::Symlink),
        ] {
            let destination = tempfile::tempdir().expect("extract directory");
            let mut builder = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::default()));
            let mut header = tar::Header::new_gnu();
            header.as_mut_bytes()[..name.len()].copy_from_slice(name.as_bytes());
            header.set_size(0);
            header.set_mode(0o644);
            header.set_entry_type(kind);
            header.set_cksum();
            builder
                .append(&header, &[][..])
                .expect("append unsafe entry");
            let bytes = builder
                .into_inner()
                .expect("finish tar")
                .finish()
                .expect("finish gzip");
            assert!(extract(&bytes, destination.path()).is_err(), "{name}");
        }
    }
}
