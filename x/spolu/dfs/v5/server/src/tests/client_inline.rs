use super::*;
use ::dfs_client::{BlockingClient, CacheConfig, CachedClient, inline};
use std::time::Duration;

fn object(id: ObjectRef) -> ObjectRequest {
    ObjectRequest { object_id: id }
}
fn calls(client: &CachedClient, name: &str) -> u64 {
    client.metrics()["dfs_client_metrics"][name]["calls"]
        .as_u64()
        .unwrap_or(0)
}
fn deferred<T>(result: std::result::Result<T, tonic::Status>) -> Result<()> {
    assert!(inline::is_deferred(
        &result.err().context("expected inline deferral")?
    ));
    Ok(())
}
pub(super) fn contracts(
    endpoint: &str,
    key: &str,
    tenant: &Tenant,
    state: &Arc<State>,
) -> Result<()> {
    let runtime = tokio::runtime::Handle::current();
    std::thread::scope(|scope| {
        scope
            .spawn(|| -> Result<()> {
                assert!(
                    tokio::runtime::Handle::try_current().is_err(),
                    "probe starts outside any runtime"
                );
                let observer = BlockingClient::connect(endpoint, key)?;
                let folder = observer
                    .create(CreateRequest {
                        parent_id: tenant.root_id,
                        name: "inline".into(),
                        directory: true,
                        mode: 0o755,
                        ..Default::default()
                    })?
                    .object
                    .context("folder")?;
                let client = CachedClient::connect(
                    endpoint,
                    key,
                    CacheConfig {
                        cache_ttl_ms: 100,
                        write_delay_ms: 500,
                        max_write_delay_ms: 800,
                        ..Default::default()
                    },
                )?;
                deferred(inline::probe(|| client.stat_one(object(folder.id))))?;
                assert_eq!(calls(&client, "rpc.stat"), 0, "cold probe sends no RPC");
                client.stat_one(object(folder.id))?;
                inline::probe(|| client.stat_one(object(folder.id)))?;
                assert_eq!(calls(&client, "rpc.stat"), 1, "hot probe stays synchronous");
                client.list(ListRequest {
                    directory_id: folder.id,
                    limit: dfs_protocol::MAX_LIST,
                    after: None,
                })?;
                let file = inline::probe(|| {
                    client.create(CreateRequest {
                        parent_id: folder.id,
                        name: "once".into(),
                        mode: 0o644,
                        ..Default::default()
                    })
                })?
                .object
                .context("local file")?;
                inline::probe(|| {
                    client.write(WriteRequest {
                        object_id: file.id,
                        data: b"inline".to_vec(),
                        ..Default::default()
                    })
                })?;
                let read = || {
                    client.read(ReadRequest {
                        object_id: file.id,
                        length: 1024,
                        ..Default::default()
                    })
                };
                assert_eq!(inline::probe(read)?.data, b"inline");
                deferred(inline::probe(|| client.fsync(object(file.id))))?;
                deferred(inline::probe(|| {
                    client.write(WriteRequest {
                        object_id: file.id,
                        data: vec![1; 300 * 1024],
                        ..Default::default()
                    })
                }))?;
                assert_eq!(
                    inline::probe(read)?.data,
                    b"inline",
                    "large writes defer before their first chunk"
                );
                assert_eq!(
                    calls(&client, "rpc.mutate_batch"),
                    0,
                    "fsync probe cannot force dispatch"
                );
                let pressure = client.reserve_bookkeeping(413 * 1024 * 1024)?;
                deferred(inline::probe(|| {
                    client.write(WriteRequest {
                        object_id: file.id,
                        data: vec![2; 256 * 1024],
                        ..Default::default()
                    })
                }))?;
                assert_eq!(
                    inline::probe(read)?.data,
                    b"inline",
                    "capacity deferral accepts no bytes"
                );
                drop(pressure);
                let scratch = client.reserve_temporary(52 * 1024 * 1024)?;
                deferred(inline::probe(|| {
                    client.write(WriteRequest {
                        object_id: file.id,
                        data: b"not accepted".to_vec(),
                        ..Default::default()
                    })
                }))?;
                drop(scratch);
                assert_eq!(inline::probe(read)?.data, b"inline");
                let memory = &client.metrics()["dfs_memory_metrics"];
                assert_eq!(memory["temporary_peak_bytes"], 52 * 1024 * 1024);
                assert!(memory["accounted_peak_bytes"].as_u64() <= memory["limit_bytes"].as_u64());
                client.fsync(object(file.id))?;
                assert_eq!(
                    observer
                        .read(ReadRequest {
                            object_id: file.id,
                            length: 1024,
                            ..Default::default()
                        })?
                        .data,
                    b"inline"
                );
                assert_eq!(
                    observer
                        .list(ListRequest {
                            directory_id: folder.id,
                            limit: 16,
                            after: None
                        })?
                        .entries
                        .len(),
                    1
                );
                assert_eq!(calls(&client, "inline.wait_after_effect"), 0);
                // A blocked content RPC must not prevent an unrelated warm inline lookup.
                let client = CachedClient::connect(endpoint, key, CacheConfig::default())?;
                client.stat_one(object(folder.id))?;
                let pause = Arc::new(Pause {
                    entered: Default::default(),
                    release: Semaphore::new(0),
                });
                state
                    .content_reply_pauses
                    .lock()
                    .insert(file.id, pause.clone());
                std::thread::scope(|scope| -> Result<()> {
                    let reader = scope.spawn(|| {
                        client.read(ReadRequest {
                            object_id: file.id,
                            length: 1024,
                            ..Default::default()
                        })
                    });
                    let entered = runtime.block_on(async {
                        tokio::time::timeout(Duration::from_secs(3), pause.entered.notified()).await
                    });
                    let started = std::time::Instant::now();
                    let hot = inline::probe(|| client.stat_one(object(folder.id)));
                    let elapsed = started.elapsed();
                    state.content_reply_pauses.lock().remove(&file.id);
                    pause.release.add_permits(1);
                    entered.context("slow content response did not pause")?;
                    hot.context("unrelated hot stat deferred behind content RPC")?;
                    assert!(elapsed < Duration::from_millis(500));
                    assert_eq!(
                        reader
                            .join()
                            .map_err(|_| anyhow::anyhow!("reader panicked"))??
                            .data,
                        b"inline"
                    );
                    Ok(())
                })?;
                assert!(
                    tokio::runtime::Handle::try_current().is_err(),
                    "probe leaves no runtime context"
                );
                Ok(())
            })
            .join()
            .map_err(|_| anyhow::anyhow!("inline client worker panicked"))?
    })
}
