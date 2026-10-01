use std::{
    collections::BTreeMap,
    io::{Read, Write},
    sync::Arc,
};

use anyhow::{Context, Result, ensure};
use dfs_client::{CachedClient, Client, Error};
use dfs_protocol::{model::RequestId, wire::*};
use dfs_server::{
    api::{self, Access, ApiState},
    storage::Storage,
};
use slatedb::object_store::local::LocalFileSystem;

const KEY: &str = "test_server_key_01234567890123456789";

struct Repeated {
    remaining: u64,
}
impl Read for Repeated {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        let size = buffer.len().min(self.remaining as usize);
        buffer[..size].fill(0x5a);
        self.remaining -= size as u64;
        Ok(size)
    }
}
struct Checked {
    count: u64,
}
impl Write for Checked {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.iter().any(|&byte| byte != 0x5a) {
            return Err(std::io::Error::other("unexpected byte"));
        }
        self.count += bytes.len() as u64;
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn eventually(mut predicate: impl FnMut() -> Result<bool>) -> Result<()> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1200);
    while !predicate()? {
        ensure!(
            std::time::Instant::now() < deadline,
            "cache did not refresh within the staleness bound"
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    Ok(())
}

#[test]
fn real_http_streams_ranges_receipts_and_session_closure() -> Result<()> {
    let runtime = tokio::runtime::Runtime::new()?;
    let directory = tempfile::tempdir()?;
    let (storage, state, listener) = runtime.block_on(async {
        let storage = Arc::new(
            Storage::open(
                Arc::new(LocalFileSystem::new_with_prefix(directory.path())?),
                &"client".parse()?,
            )
            .await?,
        );
        let state = ApiState::new(Some(storage.clone()), Access::new(Some(KEY))?);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        Ok::<_, anyhow::Error>((storage, state, listener))
    })?;
    let endpoint = format!("http://{}", listener.local_addr()?);
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let serving_state = state.clone();
    let server = runtime.spawn(async move {
        axum::serve(listener, api::router(serving_state))
            .with_graceful_shutdown(async {
                let _ = stopped.await;
            })
            .await
    });
    let exercise = (|| -> Result<()> {
        let http = reqwest::blocking::Client::new();
        let workspace: CreateWorkspaceResponse = http
            .post(format!("{endpoint}/workspaces"))
            .bearer_auth(KEY)
            .json(&CreateWorkspaceRequest {
                workspace_id: "client".into(),
                root_grants: vec!["owner".into()],
            })
            .send()?
            .error_for_status()?
            .json()?;
        let session: CreateSessionResponse = http
            .post(format!("{endpoint}/sessions"))
            .bearer_auth(&workspace.workspace_key)
            .json(&CreateSessionRequest {
                workspace_id: workspace.workspace_id,
                grants: vec!["owner".into()],
            })
            .send()?
            .error_for_status()?
            .json()?;
        let client = Client::new(&endpoint, &session.session_key)?;
        ensure!(
            client
                .session()
                .context("session")?
                .grants
                .contains("owner")
        );
        let upload = client.start_upload(&StartUploadRequest::Create {
            parent_id: workspace.root_id.clone(),
            name: "large".into(),
        })?;
        let size = 80 * 1024 * 1024;
        // Neither direction allocates the entire body; this exceeds the server's transfer budget.
        client
            .upload(&upload.upload_id, Repeated { remaining: size }, None)
            .context("upload 80 MiB")?;
        let receipt = client.commit_upload(&CommitUploadRequest {
            upload_id: upload.upload_id,
            mime_type: None,
            xattrs: BTreeMap::new(),
            mode: None,
        })?;
        ensure!(receipt.size_bytes == size);
        let opened = client.open(&OpenFileRequest {
            object_id: receipt.object_id.clone(),
            read: true,
            write: true,
            append: false,
            truncate: false,
            request_id: None,
        })?;
        let mut sink = Checked { count: 0 };
        client
            .read(
                &ReadFileRequest {
                    handle_id: opened.handle_id.clone(),
                    content_version: Some(receipt.content_version),
                    offset: 0,
                    length: size,
                },
                &mut sink,
            )
            .context("read 80 MiB")?;
        ensure!(sink.count == size);
        let mut range = Checked { count: 0 };
        client
            .read(
                &ReadFileRequest {
                    handle_id: opened.handle_id.clone(),
                    content_version: None,
                    offset: size - 123,
                    length: 1024,
                },
                &mut range,
            )
            .context("read range")?;
        ensure!(range.count == 123);
        let cached = CachedClient::new(client.clone())?;
        let second_cache = CachedClient::new(client.clone())?;
        for cache in [&cached, &second_cache] {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            while !cache.cache_stats()?.metadata_fresh {
                ensure!(
                    std::time::Instant::now() < deadline,
                    "cache check did not become ready"
                );
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            cache.list(&workspace.root_id, None, 64)?;
            let before = cache.cache_stats()?;
            cache.lookup(&workspace.root_id, "large")?;
            cache.stat(&receipt.object_id)?;
            let after = cache.cache_stats()?;
            ensure!(after.hits == before.hits + 2 && after.misses == before.misses);
            ensure!(cache.read_object(&receipt.object_id, 0, 1024)? == [0x5a; 1024]);
            let before = cache.cache_stats()?;
            ensure!(cache.read_object(&receipt.object_id, 0, 1024)? == [0x5a; 1024]);
            ensure!(cache.cache_stats()?.misses == before.misses);
        }
        // A metadata-only change must reauthorize without throwing away unchanged content blocks.
        let attributes = cached.stat(&receipt.object_id)?;
        cached.update(&UpdateMetadataRequest {
            object_id: receipt.object_id.clone(),
            expected_metadata_revision: attributes.metadata_revision,
            mime_type: Some("text/plain".into()),
            xattrs: BTreeMap::new(),
            mode: None,
            atime: None,
            mtime: None,
        })?;
        ensure!(cached.stat(&receipt.object_id)?.mime_type == "text/plain");
        for cache in [&cached, &second_cache] {
            eventually(|| {
                Ok(cache.cache_stats()?.metadata_fresh
                    && cache.stat(&receipt.object_id)?.mime_type == "text/plain")
            })?;
            let before = cache.cache_stats()?;
            ensure!(cache.read_object(&receipt.object_id, 0, 1024)? == [0x5a; 1024]);
            let after = cache.cache_stats()?;
            ensure!(after.misses == before.misses && after.hits == before.hits + 2);
        }
        let id = RequestId::generate().to_string();
        let request = TruncateFileRequest {
            handle_id: opened.handle_id.clone(),
            request_id: id.clone(),
            sequence: 1,
            size_bytes: 9,
        };
        let first = cached.truncate(&request)?;
        ensure!(cached.read_object(&receipt.object_id, 0, 1024)? == [0x5a; 9]);
        let retried = client.truncate(&request)?;
        ensure!(first.content_version == retried.content_version);
        client.fsync(&opened.handle_id, 1)?;
        for cache in [&cached, &second_cache] {
            eventually(|| Ok(cache.read_object(&receipt.object_id, 0, 1024)? == [0x5a; 9]))?;
        }
        ensure!(
            client
                .status(&MutationStatusRequest {
                    object_id: receipt.object_id.clone(),
                    request_id: id
                })?
                .is_some()
        );
        ensure!(matches!(
            client.fsync(&opened.handle_id, 2),
            Err(Error::Conflict)
        ));
        ensure!(client.list(&workspace.root_id, None, 64)?.entries.len() == 1);
        let root = client.stat(&workspace.root_id)?;
        http.post(format!("{endpoint}/objects/grants/update"))
            .bearer_auth(&workspace.workspace_key)
            .json(
                &serde_json::json!({"workspace_id":"client", "object_id":workspace.root_id,
                "expected_metadata_revision":root.metadata_revision, "grants":{"owner":false}}),
            )
            .send()?
            .error_for_status()?;
        for cache in [&cached, &second_cache] {
            eventually(|| {
                Ok(matches!(
                    cache.stat(&receipt.object_id),
                    Err(Error::NotFound)
                ))
            })?;
            ensure!(matches!(
                cache.read_object(&receipt.object_id, 0, 9),
                Err(Error::NotFound)
            ));
        }
        http.delete(format!(
            "{endpoint}/sessions/{}",
            session.session.session_id
        ))
        .bearer_auth(session.session_key)
        .send()?
        .error_for_status()?;
        eventually(|| {
            Ok(matches!(
                cached.stat(&receipt.object_id),
                Err(Error::Unauthenticated)
            ))
        })?;
        eventually(|| {
            Ok(matches!(
                second_cache.read_object(&receipt.object_id, 0, 9),
                Err(Error::Unauthenticated)
            ))
        })?;
        ensure!(matches!(client.stat("root"), Err(Error::Unauthenticated)));
        ensure!(matches!(
            client.close(&opened.handle_id),
            Err(Error::Unauthenticated)
        ));
        Ok(())
    })();
    let _ = stop.send(());
    runtime.block_on(async {
        server.await??;
        state.drain_file_jobs().await;
        storage.close().await
    })?;
    exercise
}
