use super::*;
use ::dfs_client::{BlockingClient, CacheConfig, CachedClient};
use std::time::Duration;

fn create(parent: &str, name: &str, directory: bool) -> CreateRequest {
    CreateRequest {
        parent_id: parent.into(),
        name: name.into(),
        directory,
        mode: 0o755,
        ..Default::default()
    }
}
fn object(id: &str) -> ObjectRequest {
    ObjectRequest {
        object_id: id.into(),
    }
}
fn read(id: &str) -> ReadRequest {
    ReadRequest {
        object_id: id.into(),
        length: 64,
        ..Default::default()
    }
}
fn write(id: &str, offset: u64, data: &[u8], append: bool) -> WriteRequest {
    WriteRequest {
        object_id: id.into(),
        offset,
        data: data.into(),
        append,
    }
}
fn calls(client: &CachedClient, name: &str) -> u64 {
    client.metrics()["dfs_client_metrics"][name]["calls"]
        .as_u64()
        .unwrap_or(0)
}
fn cached(endpoint: &str, key: &str, ttl: u64) -> Result<CachedClient> {
    CachedClient::connect(
        endpoint,
        key,
        CacheConfig {
            cache_ttl_ms: ttl,
            write_delay_ms: 1000,
            ..Default::default()
        },
    )
}

pub(super) fn contracts(endpoint: &str, key: &str, tenant: &Tenant, state: &State) -> Result<()> {
    let observer = BlockingClient::connect(endpoint, key)?;
    let directory = observer
        .create(create(&tenant.root_id, "refresh", true))?
        .object
        .context("directory")?;
    independent_ttl(endpoint, key, &directory.id, &observer)?;
    queued_rebase(endpoint, key, &directory.id, &observer)?;
    for committed in [false, true] {
        inflight_append(endpoint, key, &directory.id, &observer, state, committed)?;
    }
    revoked_creation(endpoint, tenant, &directory.id, &observer)?;
    Ok(())
}

fn revoked_creation(
    endpoint: &str,
    tenant: &Tenant,
    parent: &str,
    observer: &BlockingClient,
) -> Result<()> {
    let admin = BlockingClient::connect(endpoint, &tenant.tenant_key)?;
    let grant = |attached| UpdateGrantsRequest {
        tenant_id: tenant.tenant_id.clone(),
        object_id: parent.into(),
        changes: vec![GrantChange {
            grant: "optimistic-writer".into(),
            attached,
        }],
    };
    admin.update_grants(grant(true))?;
    let session = admin.create_session(CreateSessionRequest {
        tenant_id: tenant.tenant_id.clone(),
        grants: vec!["optimistic-writer".into()],
    })?;
    let client = cached(endpoint, &session.session_key, 50)?;
    let file = client
        .create(create(parent, "revoked", false))?
        .object
        .context("file")?;
    admin.update_grants(grant(false))?;
    // Optimistic RAM acceptance is allowed within the child's validity, but never authorizes FDB.
    client.write(write(&file.id, 0, b"tentative", false))?;
    std::thread::sleep(Duration::from_millis(75));
    assert_eq!(
        code(
            &client
                .read(read(&file.id))
                .err()
                .context("expected rejection")?
        ),
        ErrorCode::NotFound
    );
    assert_eq!(calls(&client, "rpc.mutate_batch"), 0);
    assert_eq!(
        code(
            &client
                .fsync(object(&file.id))
                .err()
                .context("expected rejection")?
        ),
        ErrorCode::NotFound
    );
    assert_eq!(
        code(
            &observer
                .stat(object(&file.id))
                .err()
                .context("expected rejection")?
        ),
        ErrorCode::NotFound
    );
    assert!(client.drain().is_err());
    Ok(())
}

fn independent_ttl(
    endpoint: &str,
    key: &str,
    parent: &str,
    observer: &BlockingClient,
) -> Result<()> {
    let client = cached(endpoint, key, 200)?;
    client.stat(object(parent))?;
    std::thread::sleep(Duration::from_millis(150));
    let folder = client
        .create(create(parent, "local-folder", true))?
        .object
        .context("folder")?;
    let child = client
        .create(create(&folder.id, "child", false))?
        .object
        .context("child")?;
    let stats = calls(&client, "rpc.stat");
    std::thread::sleep(Duration::from_millis(80));
    // The parent's original deadline has elapsed; each tentative child owns a full C.
    client.write(write(&child.id, 0, b"local", false))?;
    assert_eq!(client.read(read(&child.id))?.data, b"local");
    assert_eq!(calls(&client, "rpc.stat"), stats);
    // Local writes did not renew the child's original deadline. Refresh the existing ancestor,
    // retaining two levels of tentative namespace and content without publishing either.
    std::thread::sleep(Duration::from_millis(140));
    assert_eq!(client.read(read(&child.id))?.data, b"local");
    assert!(calls(&client, "refresh.tentative") > 0);
    assert_eq!(calls(&client, "rpc.mutate_batch"), 0);
    assert_eq!(
        code(
            &observer
                .stat(object(&child.id))
                .err()
                .context("expected rejection")?
        ),
        ErrorCode::NotFound
    );
    client.fsync(object(&child.id))?;
    assert_eq!(observer.read(read(&child.id))?.data, b"local");
    let stats = calls(&client, "rpc.stat");
    std::thread::sleep(Duration::from_millis(80));
    // Publication renews target AND returned parents. No follow-up metadata RPC is necessary.
    assert_eq!(client.stat(object(&child.id))?.size, 5);
    assert!(client.stat(object(&folder.id))?.directory);
    assert!(client.stat(object(parent))?.directory);
    assert_eq!(calls(&client, "rpc.stat"), stats);
    let lookups = calls(&client, "rpc.lookup");
    assert_eq!(
        client
            .lookup(LookupRequest {
                parent_id: folder.id,
                name: "child".into()
            })?
            .id,
        child.id
    );
    assert_eq!(calls(&client, "rpc.lookup"), lookups);
    client.drain()?;
    Ok(())
}

fn queued_rebase(endpoint: &str, key: &str, parent: &str, observer: &BlockingClient) -> Result<()> {
    let file = observer
        .create(create(parent, "rebase", false))?
        .object
        .context("file")?;
    observer.write(write(&file.id, 0, b"abcd", false))?;
    let client = cached(endpoint, key, 50)?;
    assert_eq!(client.read(read(&file.id))?.data, b"abcd");
    client.write(write(&file.id, 1, b"X", false))?;
    observer.write(write(&file.id, 3, b"Y", false))?;
    std::thread::sleep(Duration::from_millis(75));
    assert_eq!(client.read(read(&file.id))?.data, b"aXcY");
    assert_eq!(observer.read(read(&file.id))?.data, b"abcY");
    assert_eq!(calls(&client, "rpc.mutate_batch"), 0);
    for size in [2, 8] {
        client.update(UpdateRequest {
            object_id: file.id.clone(),
            size: Some(size),
            ..Default::default()
        })?;
    }
    client.write(write(&file.id, 7, b"Z", false))?;
    observer.write(write(&file.id, 0, b"Q", false))?;
    std::thread::sleep(Duration::from_millis(75));
    assert_eq!(client.read(read(&file.id))?.data, b"QX\0\0\0\0\0Z");
    assert_eq!(calls(&client, "rpc.mutate_batch"), 0);
    client.fsync(object(&file.id))?;
    assert_eq!(observer.read(read(&file.id))?.data, b"QX\0\0\0\0\0Z");
    let stats = calls(&client, "rpc.stat");
    assert_eq!(client.stat(object(&file.id))?.size, 8);
    assert_eq!(calls(&client, "rpc.stat"), stats);

    // A refresh must not turn an externally deleted, previously published object into a new file.
    client.write(write(&file.id, 0, b"lost", false))?;
    observer.remove(RemoveRequest {
        object_id: file.id.clone(),
        directory: false,
    })?;
    std::thread::sleep(Duration::from_millis(75));
    assert_eq!(
        code(
            &client
                .read(read(&file.id))
                .err()
                .context("expected rejection")?
        ),
        ErrorCode::NotFound
    );
    assert_eq!(
        code(
            &client
                .fsync(object(&file.id))
                .err()
                .context("expected rejection")?
        ),
        ErrorCode::NotFound
    );
    assert!(client.drain().is_err());
    Ok(())
}

fn inflight_append(
    endpoint: &str,
    key: &str,
    parent: &str,
    observer: &BlockingClient,
    state: &State,
    committed: bool,
) -> Result<()> {
    let file = observer
        .create(create(
            parent,
            if committed { "committed" } else { "inflight" },
            false,
        ))?
        .object
        .context("file")?;
    observer.write(write(&file.id, 0, b"abc", false))?;
    let client = cached(endpoint, key, 100)?;
    client.stat(object(&file.id))?;
    let paused = Arc::new(Pause {
        entered: Default::default(),
        release: Semaphore::new(0),
    });
    let pauses = if committed {
        &state.reply_pauses
    } else {
        &state.pauses
    };
    pauses.lock().insert(file.id.clone(), paused.clone());
    client.write(write(&file.id, 0, b"X", true))?;
    let syncing = client.clone();
    let target = file.id.clone();
    let sync = std::thread::spawn(move || syncing.fsync(object(&target)));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    let entered = runtime.block_on(async {
        tokio::time::timeout(Duration::from_secs(3), paused.entered.notified()).await
    });
    let outcome = (|| -> Result<()> {
        entered?;
        // This edit is outside the captured fsync prefix and must remain queued during refresh.
        client.write(write(&file.id, 0, b"Y", true))?;
        std::thread::sleep(Duration::from_millis(125));
        let reading = client.clone();
        let target = file.id.clone();
        let (sent, received) = std::sync::mpsc::channel();
        let reading = std::thread::spawn(move || {
            let _ = sent.send(reading.read(read(&target)));
        });
        if committed {
            // FDB already includes X, but its result is withheld: the refresh must not replay X.
            assert!(matches!(
                received.recv_timeout(Duration::from_millis(50)),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout)
            ));
            pauses.lock().remove(&file.id);
            paused.release.add_permits(1);
        }
        let result = received.recv_timeout(Duration::from_millis(500));
        // Always release the stall before reporting a failure, including the old forced-flush path.
        pauses.lock().remove(&file.id);
        paused.release.add_permits(1);
        assert_eq!(result??.data, b"abcXY");
        reading
            .join()
            .map_err(|_| anyhow::anyhow!("read panicked"))?;
        Ok(())
    })();
    pauses.lock().remove(&file.id);
    paused.release.add_permits(1);
    sync.join()
        .map_err(|_| anyhow::anyhow!("fsync panicked"))??;
    outcome?;
    assert_eq!(observer.read(read(&file.id))?.data, b"abcX");
    assert_eq!(client.read(read(&file.id))?.data, b"abcXY");
    client.fsync(object(&file.id))?;
    assert_eq!(observer.read(read(&file.id))?.data, b"abcXY");
    client.drain()?;
    Ok(())
}
