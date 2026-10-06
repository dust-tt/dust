use super::*;
use ::dfs_client::{BlockingClient, CacheConfig, CachedClient};
use std::time::{Duration, Instant};

fn create(parent: &str, name: &str, directory: bool) -> CreateRequest {
    CreateRequest {
        parent_id: parent.into(),
        name: name.into(),
        directory,
        mode: 0o755,
        ..Default::default()
    }
}
fn listing(id: &str) -> ListRequest {
    ListRequest {
        directory_id: id.into(),
        after: None,
        limit: 64,
    }
}
fn lookup(id: &str, name: &str) -> LookupRequest {
    LookupRequest {
        parent_id: id.into(),
        name: name.into(),
    }
}
fn object(id: &str) -> ObjectRequest {
    ObjectRequest {
        object_id: id.into(),
    }
}
fn calls(client: &CachedClient, name: &str) -> u64 {
    client.metrics()["dfs_client_metrics"][name]["calls"]
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
fn wait_calls(client: &CachedClient, name: &str, count: u64) {
    let deadline = Instant::now() + Duration::from_secs(2);
    while calls(client, name) < count {
        assert!(Instant::now() < deadline, "missing {name} completion");
        std::thread::sleep(Duration::from_millis(2));
    }
}

pub(super) fn contracts(endpoint: &str, key: &str, tenant: &Tenant, state: &State) -> Result<()> {
    let observer = BlockingClient::connect(endpoint, key)?;
    let folder = observer
        .create(create(&tenant.root_id, "directory-cache", true))?
        .object
        .context("directory")?;
    let file = observer
        .create(create(&folder.id, "a", false))?
        .object
        .context("file")?;
    let client = cached(endpoint, key, 100)?;
    let initial = client.list(listing(&folder.id))?;
    assert_eq!(
        initial.directory_revision,
        observer.stat(object(&folder.id))?.revision
    );
    let before = calls(&client, "rpc.list");
    observer.write(WriteRequest {
        object_id: file.id.clone(),
        data: b"changed".to_vec(),
        ..Default::default()
    })?;
    observer.update(UpdateRequest {
        object_id: file.id.clone(),
        mime_type: Some("text/plain".into()),
        xattrs: vec![XattrChange {
            name: "user.test".into(),
            value: Some(b"value".to_vec()),
        }],
        ..Default::default()
    })?;
    BlockingClient::connect(endpoint, &tenant.tenant_key)?.update_grants(UpdateGrantsRequest {
        tenant_id: tenant.tenant_id.clone(),
        object_id: file.id.clone(),
        changes: vec![GrantChange {
            grant: "child-only".into(),
            attached: true,
        }],
    })?;
    assert_eq!(
        observer.stat(object(&folder.id))?.revision,
        initial.directory_revision,
        "child content/attributes must not update the parent revision"
    );
    std::thread::sleep(Duration::from_millis(150));
    let updated = client.list(listing(&folder.id))?;
    let attr = updated.entries[0].object.as_ref().context("attributes")?;
    assert_eq!(attr.size, 7);
    assert_eq!(attr.mime_type, "text/plain");
    assert_eq!(attr.xattrs["user.test"], b"value");
    assert_ne!(
        attr.revision,
        initial.entries[0]
            .object
            .as_ref()
            .context("initial")?
            .revision
    );
    assert_eq!(
        calls(&client, "rpc.list"),
        before,
        "reuse the retained namespace"
    );
    assert_eq!(calls(&client, "rpc.stat_many"), 1);
    assert_eq!(calls(&client, "cache.page_revalidated"), 1);

    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(client.lookup(lookup(&folder.id, "a"))?.size, 7);
    assert_eq!(
        calls(&client, "rpc.lookup"),
        0,
        "expired listed names validate through their parent"
    );
    assert_eq!(calls(&client, "rpc.list"), before);
    assert_eq!(calls(&client, "rpc.stat_many"), 2);

    observer.rename(RenameRequest {
        object_id: file.id.clone(),
        parent_id: folder.id.clone(),
        name: "renamed".into(),
        replace: false,
    })?;
    std::thread::sleep(Duration::from_millis(150));
    let renamed = client.list(listing(&folder.id))?;
    assert_ne!(renamed.directory_revision, initial.directory_revision);
    assert_eq!(renamed.entries[0].name, "renamed");
    assert_eq!(
        code(
            &client
                .lookup(lookup(&folder.id, "a"))
                .err()
                .context("old name")?
        ),
        ErrorCode::NotFound
    );
    assert_eq!(calls(&client, "rpc.list"), before + 1);
    observer.remove(RemoveRequest {
        object_id: file.id.clone(),
        directory: false,
    })?;
    let replacement = observer
        .create(create(&folder.id, "renamed", false))?
        .object
        .context("replacement")?;
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(
        client.lookup(lookup(&folder.id, "renamed"))?.id,
        replacement.id
    );

    // A cold page requested concurrently must be fetched only once, then rechecked by waiters.
    let client = cached(endpoint, key, 1000)?;
    let barrier = std::sync::Barrier::new(8);
    std::thread::scope(|scope| -> Result<()> {
        let mut tasks = Vec::new();
        for _ in 0..8 {
            tasks.push(scope.spawn(|| {
                barrier.wait();
                client.list(listing(&folder.id))
            }));
        }
        for task in tasks {
            assert_eq!(
                task.join()
                    .map_err(|_| anyhow::anyhow!("list worker panicked"))??
                    .entries
                    .len(),
                1
            );
        }
        Ok(())
    })?;
    assert_eq!(calls(&client, "rpc.list"), 1);
    page_ahead(endpoint, key, &observer, &tenant.root_id)?;
    revoked_ancestor(endpoint, &observer, tenant)?;
    listing_during_publication(endpoint, key, &observer, &tenant.root_id, state)?;
    Ok(())
}

fn listing_during_publication(
    endpoint: &str,
    key: &str,
    observer: &BlockingClient,
    root: &str,
    state: &State,
) -> Result<()> {
    let directory = observer
        .create(create(root, "listing-publication", true))?
        .object
        .context("directory")?;
    let mut files = Vec::new();
    for name in ["a", "b", "c"] {
        let file = observer
            .create(create(&directory.id, name, false))?
            .object
            .context("file")?;
        files.push((name, file.id));
    }
    let unrelated = observer
        .create(create(root, "listing-unrelated", false))?
        .object
        .context("unrelated")?;
    let client = CachedClient::connect(
        endpoint,
        key,
        CacheConfig {
            write_delay_ms: 1000,
            ..Default::default()
        },
    )?;
    for (name, id) in &files {
        client.remove_at(
            directory.id.clone(),
            (*name).into(),
            RemoveRequest {
                object_id: id.clone(),
                directory: false,
            },
        )?;
    }
    let pause = Arc::new(Pause {
        entered: Default::default(),
        release: Semaphore::new(0),
    });
    state
        .list_reply_pauses
        .lock()
        .insert(directory.id.clone(), pause.clone());
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    let entered = || -> Result<()> {
        runtime.block_on(async {
            tokio::time::timeout(Duration::from_secs(3), pause.entered.notified()).await
        })?;
        Ok(())
    };
    std::thread::scope(|scope| -> Result<()> {
        let reader = scope.spawn(|| client.list(listing(&directory.id)));
        entered()?;
        // Complete one unlink after the listing snapshot; its response must be discarded.
        client.fsync(object(&files[0].1))?;
        pause.release.add_permits(1);
        entered()?;
        // The retry must pause only this directory, leaving other objects free to publish.
        let writer = scope.spawn(|| client.fsync(object(&files[1].1)));
        client.write(WriteRequest {
            object_id: unrelated.id.clone(),
            data: b"independent".to_vec(),
            ..Default::default()
        })?;
        let independent = client.fsync(object(&unrelated.id));
        std::thread::sleep(Duration::from_millis(50));
        let still_queued = !writer.is_finished();
        let visible_on_server = observer.stat(object(&files[1].1));
        state.list_reply_pauses.lock().remove(&directory.id);
        pause.release.add_permits(16);
        let page = reader
            .join()
            .map_err(|_| anyhow::anyhow!("list panicked"))??;
        writer
            .join()
            .map_err(|_| anyhow::anyhow!("fsync panicked"))??;
        independent?;
        assert!(still_queued && visible_on_server.is_ok());
        assert!(page.entries.is_empty(), "queued unlinks must remain hidden");
        Ok(())
    })?;
    assert_eq!(calls(&client, "cache.page_raced"), 1);
    assert_eq!(calls(&client, "cache.page_retry_exhausted"), 0);
    client.drain()?;
    assert!(observer.list(listing(&directory.id))?.entries.is_empty());
    Ok(())
}

fn page_ahead(endpoint: &str, key: &str, observer: &BlockingClient, root: &str) -> Result<()> {
    let directory = observer
        .create(create(root, "page-ahead", true))?
        .object
        .context("directory")?;
    for i in 0..256 {
        observer.create(create(&directory.id, &format!("file-{i:03}"), false))?;
    }
    let client = cached(endpoint, key, 1000)?;
    assert_eq!(client.list(listing(&directory.id))?.entries.len(), 64);
    wait_calls(&client, "rpc.list", 2);
    std::thread::sleep(Duration::from_millis(50));
    assert_eq!(
        calls(&client, "rpc.list"),
        2,
        "completion must not crawl the directory"
    );
    client.lookup(lookup(&directory.id, "file-064"))?;
    wait_calls(&client, "rpc.list", 3);
    std::thread::sleep(Duration::from_millis(50));
    assert_eq!(
        calls(&client, "rpc.list"),
        3,
        "only one page ahead of application access"
    );
    assert_eq!(calls(&client, "rpc.lookup"), 0);
    for i in 0..256 {
        assert!(
            !client
                .lookup(lookup(&directory.id, &format!("file-{i:03}")))?
                .directory
        );
    }
    assert!(
        calls(&client, "rpc.lookup") <= 2,
        "page boundaries must not become individual lookups"
    );
    assert_eq!(calls(&client, "rpc.list"), 4);
    Ok(())
}

fn revoked_ancestor(endpoint: &str, observer: &BlockingClient, tenant: &Tenant) -> Result<()> {
    let ancestor = observer
        .create(create(&tenant.root_id, "granted-directory", true))?
        .object
        .context("ancestor")?;
    let directory = observer
        .create(create(&ancestor.id, "descendant", true))?
        .object
        .context("directory")?;
    observer.create(create(&directory.id, "file", false))?;
    let admin = BlockingClient::connect(endpoint, &tenant.tenant_key)?;
    let grant = |attached| UpdateGrantsRequest {
        tenant_id: tenant.tenant_id.clone(),
        object_id: ancestor.id.clone(),
        changes: vec![GrantChange {
            grant: "directory-reader".into(),
            attached,
        }],
    };
    admin.update_grants(grant(true))?;
    let reader = admin.create_session(CreateSessionRequest {
        tenant_id: tenant.tenant_id.clone(),
        grants: vec!["directory-reader".into()],
    })?;
    let client = cached(endpoint, &reader.session_key, 100)?;
    assert!(client.list(listing("root"))?.directory_revision.is_empty());
    assert!(
        client
            .list(listing("shared"))?
            .directory_revision
            .is_empty()
    );
    let page = client.list(listing(&directory.id))?;
    admin.update_grants(grant(false))?;
    assert_eq!(
        observer.stat(object(&directory.id))?.revision,
        page.directory_revision,
        "ancestor grant edits do not fan out to descendant revisions"
    );
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(
        code(
            &client
                .lookup(lookup(&directory.id, "file"))
                .err()
                .context("revoked name")?
        ),
        ErrorCode::NotFound
    );
    assert_eq!(
        code(
            &client
                .list(listing(&directory.id))
                .err()
                .context("revoked page")?
        ),
        ErrorCode::NotFound
    );
    assert!(
        client
            .list(listing("root"))?
            .entries
            .iter()
            .all(|e| e.name != "granted-directory")
    );
    assert!(client.list(listing("shared"))?.entries.is_empty());
    Ok(())
}
