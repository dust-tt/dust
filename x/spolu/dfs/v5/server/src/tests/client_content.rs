use super::*;
use ::dfs_client::{BlockingClient, CacheConfig, CachedClient};
use std::time::Duration;

fn object(id: ObjectRef) -> ObjectRequest {
    ObjectRequest { object_id: id }
}
fn read(id: ObjectRef, offset: u64, length: u32) -> ReadRequest {
    ReadRequest {
        object_id: id,
        offset,
        length,
        ..Default::default()
    }
}
fn calls(client: &CachedClient, name: &str) -> u64 {
    client.metrics()["dfs_client_metrics"][name]["calls"]
        .as_u64()
        .unwrap_or(0)
}
fn metric(client: &CachedClient, name: &str) -> u64 {
    client.metrics()["dfs_content_metrics"][name]
        .as_u64()
        .unwrap_or(0)
}
fn cached(endpoint: &str, key: &str, cache_ttl_ms: u64) -> Result<CachedClient> {
    CachedClient::connect(
        endpoint,
        key,
        CacheConfig {
            cache_ttl_ms,
            ..Default::default()
        },
    )
}
fn listing(id: ObjectRef) -> ListRequest {
    ListRequest {
        directory_id: id,
        limit: dfs_protocol::MAX_LIST,
        after: None,
    }
}

pub(super) fn contracts(endpoint: &str, key: &str, tenant: &Tenant, state: &State) -> Result<()> {
    let observer = BlockingClient::connect(endpoint, key)?;
    let folder = observer
        .create(CreateRequest {
            parent_id: tenant.root_id,
            name: "content-cache".into(),
            directory: true,
            mode: 0o755,
            ..Default::default()
        })?
        .object
        .context("folder")?;
    let mut files = Vec::new();
    for n in 0..64u8 {
        let file = observer
            .create(CreateRequest {
                parent_id: folder.id,
                name: format!("file-{n:03}"),
                mode: 0o644,
                ..Default::default()
            })?
            .object
            .context("file")?;
        observer.write(WriteRequest {
            object_id: file.id,
            data: vec![n; 4096],
            ..Default::default()
        })?;
        files.push(file.id);
    }
    let client = cached(endpoint, key, 800)?;
    client.list(listing(folder.id))?;
    assert_eq!(client.read(read(files[0], 0, 4096))?.data, vec![0; 4096]);
    assert_eq!(calls(&client, "rpc.read_files"), 1);
    assert_eq!(metric(&client, "prefetched_bytes"), 15 * 4096);
    for (n, id) in files.iter().enumerate().skip(1) {
        assert_eq!(client.read(read(*id, 0, 4096))?.data, vec![n as u8; 4096]);
    }
    assert_eq!(
        calls(&client, "rpc.read_files"),
        2,
        "consumption grows the next sibling batch"
    );
    assert_eq!(calls(&client, "rpc.read"), 0);
    assert_eq!(
        metric(&client, "prefetched_block_bytes_consumed"),
        62 * 4096
    );

    let client = cached(endpoint, key, 800)?;
    client.list(listing(folder.id))?;
    let barrier = std::sync::Barrier::new(8);
    std::thread::scope(|scope| -> Result<()> {
        let tasks: Vec<_> = (0..8)
            .map(|_| {
                scope.spawn(|| {
                    barrier.wait();
                    client.read(read(files[0], 0, 4096))
                })
            })
            .collect();
        for task in tasks {
            assert_eq!(
                task.join()
                    .map_err(|_| anyhow::anyhow!("content worker panicked"))??
                    .data,
                vec![0; 4096]
            );
        }
        Ok(())
    })?;
    assert_eq!(
        calls(&client, "rpc.read_files"),
        1,
        "concurrent demand shares one fetch"
    );
    let client = cached(endpoint, key, 800)?;
    client.list(listing(folder.id))?;
    let _pressure = client.reserve_bookkeeping((512 - 96 - 2 - 2) * 1024 * 1024)?;
    assert_eq!(client.read(read(files[0], 0, 4096))?.data, vec![0; 4096]);
    assert_eq!(
        metric(&client, "prefetched_bytes"),
        0,
        "pressure disables siblings before fetching"
    );
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
    client.write(WriteRequest {
        object_id: files[0],
        data: vec![9; 4096],
        ..Default::default()
    })?;
    assert_eq!(client.read(read(files[0], 0, 4096))?.data, vec![9; 4096]);
    assert_eq!(
        calls(&client, "rpc.read") + calls(&client, "rpc.read_files"),
        0,
        "fully covered dirty reads need no base download"
    );
    client.write(WriteRequest {
        object_id: files[1],
        offset: 100,
        data: vec![9; 2],
        ..Default::default()
    })?;
    let mut expected = vec![1; 4096];
    expected[100..102].fill(9);
    assert_eq!(client.read(read(files[1], 0, 4096))?.data, expected);
    assert_eq!(
        calls(&client, "rpc.read"),
        1,
        "uncovered ranges reuse their common base block"
    );
    assert_eq!(
        calls(&client, "rpc.read_files"),
        0,
        "dirty bases retain expected-revision range reads"
    );
    assert_eq!(calls(&client, "rpc.mutate_batch"), 0);
    client.drain()?;
    // Restore the fixture bytes used by the expiry tests below.
    for (n, id) in files.iter().enumerate().take(2) {
        observer.write(WriteRequest {
            object_id: *id,
            data: vec![n as u8; 4096],
            ..Default::default()
        })?;
    }

    let large = observer
        .create(CreateRequest {
            parent_id: folder.id,
            name: "large".into(),
            mode: 0o644,
            ..Default::default()
        })?
        .object
        .context("large")?;
    for n in 0..12 {
        observer.write(WriteRequest {
            object_id: large.id,
            offset: n * 256 * 1024,
            data: vec![(n / 4) as u8 + 1; 256 * 1024],
            ..Default::default()
        })?;
    }
    let client = cached(endpoint, key, 800)?;
    for block in 0..48 {
        assert_eq!(
            client
                .read(read(large.id, block * BLOCK_SIZE as u64, BLOCK_SIZE as u32))?
                .data,
            vec![(block / 16) as u8 + 1; BLOCK_SIZE]
        );
    }
    assert!(
        calls(&client, "rpc.read") <= 7,
        "sequential windows reach 1 MiB"
    );
    assert_eq!(calls(&client, "rpc.read_files"), 0);
    assert!(metric(&client, "prefetched_block_bytes_consumed") > 0);
    let client = cached(endpoint, key, 800)?;
    for block in [32, 7, 20, 5] {
        assert_eq!(
            client
                .read(read(large.id, block * BLOCK_SIZE as u64, 1))?
                .data,
            vec![(block / 16) as u8 + 1]
        );
    }
    assert_eq!(calls(&client, "rpc.read"), 4);
    assert_eq!(
        metric(&client, "prefetched_bytes"),
        0,
        "random reads do not speculate"
    );

    // A held reply cannot renew the deadline from its arrival time or retain revoked access.
    let admin = BlockingClient::connect(endpoint, &tenant.tenant_key)?;
    let grant = |attached| UpdateGrantsRequest {
        tenant_id: tenant.tenant_id.clone(),
        object_id: folder.id,
        changes: vec![GrantChange {
            grant: "content-reader".into(),
            attached,
        }],
    };
    admin.update_grants(grant(true))?;
    let reader = admin.create_session(CreateSessionRequest {
        tenant_id: tenant.tenant_id.clone(),
        grants: vec!["content-reader".into()],
    })?;
    let client = cached(endpoint, &reader.session_key, 50)?;
    client.stat_one(object(files[0]))?;
    let pause = Arc::new(Pause {
        entered: Default::default(),
        release: Semaphore::new(0),
    });
    state
        .content_reply_pauses
        .lock()
        .insert(files[0], pause.clone());
    std::thread::scope(|scope| -> Result<()> {
        let task = scope.spawn(|| client.read(read(files[0], 0, 4096)));
        let entered = tokio::runtime::Handle::current().block_on(async {
            tokio::time::timeout(Duration::from_secs(3), pause.entered.notified()).await
        });
        let revoked = if entered.is_ok() {
            let result = admin.update_grants(grant(false));
            std::thread::sleep(Duration::from_millis(75));
            Some(result)
        } else {
            None
        };
        state.content_reply_pauses.lock().remove(&files[0]);
        pause.release.add_permits(1);
        entered.context("content reply did not pause")?;
        revoked.transpose()?;
        assert_eq!(
            task.join()
                .map_err(|_| anyhow::anyhow!("late read panicked"))??
                .data,
            vec![0; 4096]
        );
        Ok(())
    })?;
    assert_eq!(
        code(
            &client
                .read(read(files[0], 0, 4096))
                .err()
                .context("revoked content")?
        ),
        ErrorCode::NotFound
    );
    admin.update_grants(grant(true))?;
    let client = cached(endpoint, &reader.session_key, 200)?;
    client.stat_one(object(files[1]))?;
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(client.read(read(files[1], 0, 4096))?.data, vec![1; 4096]);
    admin.update_grants(grant(false))?;
    std::thread::sleep(Duration::from_millis(75));
    assert_eq!(
        code(
            &client
                .read(read(files[1], 0, 4096))
                .err()
                .context("a content fill must not renew metadata")?
        ),
        ErrorCode::NotFound
    );
    Ok(())
}
