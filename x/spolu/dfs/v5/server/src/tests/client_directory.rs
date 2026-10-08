use super::*;
use ::dfs_client::{BlockingClient, CacheConfig, CachedClient};
use dfs_protocol::ObjectRef;
use std::time::{Duration, Instant};

fn create(parent: &ObjectRef, name: &str, directory: bool) -> CreateRequest {
    CreateRequest {
        parent_id: parent.into(),
        name: name.into(),
        directory,
        mode: 0o755,
        ..Default::default()
    }
}
fn listing(id: &ObjectRef) -> ListRequest {
    ListRequest {
        directory_id: id.into(),
        after: None,
        limit: dfs_protocol::MAX_LIST,
    }
}
fn lookup(id: &ObjectRef, name: &str) -> LookupRequest {
    LookupRequest {
        parent_id: id.into(),
        name: name.into(),
    }
}
fn object(id: &ObjectRef) -> ObjectRequest {
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
    assert_eq!(initial.listing_token.len(), 24);
    let parent_revision = observer.stat_one(object(&folder.id))?.revision;
    let before = calls(&client, "rpc.list");
    observer.write(WriteRequest {
        object_id: file.id,
        data: b"changed".to_vec(),
        ..Default::default()
    })?;
    observer.update(UpdateRequest {
        object_id: file.id,
        mime_type: Some("text/plain".into()),
        xattrs: vec![XattrChange {
            name: "user.test".into(),
            value: Some(b"value".to_vec()),
        }],
        ..Default::default()
    })?;
    BlockingClient::connect(endpoint, &tenant.tenant_key)?.update_grants(UpdateGrantsRequest {
        tenant_id: tenant.tenant_id.clone(),
        object_id: file.id,
        changes: vec![GrantChange {
            grant: "child-only".into(),
            attached: true,
        }],
    })?;
    assert_eq!(
        observer.stat_one(object(&folder.id))?.revision,
        parent_revision,
        "child content/attributes must not update the parent revision"
    );
    std::thread::sleep(Duration::from_millis(150));
    let updated = client.list(listing(&folder.id))?;
    let attr = updated.entries[0].object.as_ref().context("attributes")?;
    assert_eq!(attr.size, 7);
    let metadata = client.get_metadata(object(&file.id))?;
    assert_eq!(metadata.mime_type, "text/plain");
    assert_eq!(metadata.xattrs["user.test"], b"value");
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
        before + 1,
        "child attribute edits invalidate the listing"
    );
    assert_eq!(calls(&client, "rpc.validate"), 1);
    assert_eq!(calls(&client, "cache.page_revalidated"), 0);

    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(client.lookup(lookup(&folder.id, "a"))?.size, 7);
    assert_eq!(
        calls(&client, "rpc.lookup"),
        0,
        "expired listed names validate through their parent"
    );
    assert_eq!(calls(&client, "rpc.list"), before + 1);
    assert_eq!(calls(&client, "rpc.validate"), 2);
    assert_eq!(calls(&client, "cache.page_revalidated"), 1);

    observer.rename(RenameRequest {
        object_id: file.id,
        parent_id: folder.id,
        name: "renamed".into(),
        replace: false,
    })?;
    std::thread::sleep(Duration::from_millis(150));
    let renamed = client.list(listing(&folder.id))?;
    assert_ne!(renamed.listing_token, initial.listing_token);
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
    assert_eq!(calls(&client, "rpc.list"), before + 2);
    observer.remove(RemoveRequest {
        object_id: file.id,
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
    let client = cached(endpoint, key, 800)?;
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
    for (concurrency, blocked) in [(2, 2), (128, 16)] {
        deletion_admission(
            endpoint,
            key,
            &observer,
            &tenant.root_id,
            state,
            concurrency,
            blocked,
        )?;
    }
    for related in [false, true] {
        listing_commit_fences(endpoint, key, &observer, &tenant.root_id, state, related)?;
    }
    Ok(())
}

fn deletion_admission(
    endpoint: &str,
    key: &str,
    observer: &BlockingClient,
    root: &ObjectRef,
    state: &State,
    concurrency: usize,
    blocked: usize,
) -> Result<()> {
    let directory = observer
        .create(create(
            root,
            &format!("deletion-admission-{concurrency}"),
            true,
        ))?
        .object
        .context("directory")?;
    let files = (0..=blocked)
        .map(|index| {
            let name = format!("file-{index}");
            observer
                .create(create(&directory.id, &name, false))?
                .object
                .context("file")
                .map(|attr| (name, attr.id))
        })
        .collect::<Result<Vec<_>>>()?;
    let client = CachedClient::connect(
        endpoint,
        key,
        CacheConfig {
            write_concurrency: concurrency,
            ..Default::default()
        },
    )?;
    client.list(listing(&directory.id))?;
    let pause = Arc::new(Pause {
        entered: Default::default(),
        release: Semaphore::new(0),
    });
    for (_, id) in &files[..blocked] {
        state.pauses.lock().insert(*id, pause.clone());
    }
    let remove = |index: usize| {
        client.remove_at(
            directory.id,
            files[index].0.clone(),
            RemoveRequest {
                object_id: files[index].1,
                directory: false,
            },
        )
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    for index in 0..blocked {
        remove(index)?;
        // Wait for each request separately so the envelope case occupies all sixteen streams.
        runtime.block_on(async {
            tokio::time::timeout(Duration::from_secs(3), pause.entered.notified()).await
        })?;
    }
    let probe = ::dfs_client::inline::probe(|| remove(blocked));
    assert!(::dfs_client::inline::is_deferred(
        &probe.err().context("defer admission")?
    ));
    std::thread::scope(|scope| -> Result<()> {
        let third = scope.spawn(|| remove(blocked));
        // Network stalls may exceed W; the next unlink must wait before RAM acknowledgment.
        std::thread::sleep(Duration::from_millis(300));
        let held = !third.is_finished();
        let visible = observer.stat_one(object(&files[blocked].1));
        for (_, id) in &files[..blocked] {
            state.pauses.lock().remove(id);
        }
        pause.release.add_permits(blocked);
        third
            .join()
            .map_err(|_| anyhow::anyhow!("unlink panicked"))??;
        assert!(
            held,
            "saturated dispatch must apply backpressure before acknowledgment"
        );
        visible?;
        Ok(())
    })?;
    client.fsync(object(&directory.id))?;
    assert!(observer.list(listing(&directory.id))?.entries.is_empty());
    assert_eq!(calls(&client, "writeback.dispatch_expired"), 0);
    assert_eq!(calls(&client, "writeback.error.unavailable"), 0);
    Ok(())
}

fn listing_during_publication(
    endpoint: &str,
    key: &str,
    observer: &BlockingClient,
    root: &ObjectRef,
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
            write_delay_ms: 125,
            ..Default::default()
        },
    )?;
    for (name, id) in &files {
        client.remove_at(
            directory.id,
            (*name).into(),
            RemoveRequest {
                object_id: *id,
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
        .insert(directory.id, pause.clone());
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
        // A retry slower than W must not hold accepted deletions behind its response.
        let writer = scope.spawn(|| client.fsync(object(&files[1].1)));
        client.write(WriteRequest {
            object_id: unrelated.id,
            data: b"independent".to_vec(),
            ..Default::default()
        })?;
        let independent = client.fsync(object(&unrelated.id));
        std::thread::sleep(Duration::from_millis(300));
        let writer_finished = writer.is_finished();
        let visible_on_server = observer.stat_one(object(&files[1].1));
        state.list_reply_pauses.lock().remove(&directory.id);
        pause.release.add_permits(16);
        let page = reader
            .join()
            .map_err(|_| anyhow::anyhow!("list panicked"))??;
        let deletion = writer
            .join()
            .map_err(|_| anyhow::anyhow!("fsync panicked"))?;
        independent?;
        assert_eq!(
            calls(&client, "writeback.error.unavailable"),
            0,
            "a slow listing must not expire already accepted unlinks"
        );
        deletion?;
        assert!(
            writer_finished,
            "deletion must finish before the listing reply"
        );
        assert_eq!(
            code(&visible_on_server.err().context("deleted file")?),
            ErrorCode::NotFound
        );
        assert!(
            page.entries.is_empty(),
            "committed unlinks must remain hidden"
        );
        Ok(())
    })?;
    assert_eq!(calls(&client, "cache.page_raced"), 1);
    assert_eq!(calls(&client, "cache.page_retry_exhausted"), 0);
    client.drain()?;
    assert!(observer.list(listing(&directory.id))?.entries.is_empty());
    Ok(())
}

fn page_ahead(
    endpoint: &str,
    key: &str,
    observer: &BlockingClient,
    root: &ObjectRef,
) -> Result<()> {
    let directory = observer
        .create(create(root, "page-ahead", true))?
        .object
        .context("directory")?;
    for i in 0..256 {
        observer.create(create(&directory.id, &format!("file-{i:03}"), false))?;
    }
    let client = CachedClient::connect(
        endpoint,
        key,
        CacheConfig {
            directory_page_entries: 64,
            ..Default::default()
        },
    )?;
    assert_eq!(
        client
            .list(ListRequest {
                limit: 64,
                ..listing(&directory.id)
            })?
            .entries
            .len(),
        64
    );
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
    let client = cached(endpoint, key, 80)?;
    client.list(listing(&directory.id))?;
    for (after, remaining) in [("file-010", 245), ("file-064", 191), ("file-255", 0)] {
        let page = ::dfs_client::inline::probe(|| {
            client.list(ListRequest {
                after: Some(after.into()),
                ..listing(&directory.id)
            })
        })?;
        assert_eq!(page.entries.len(), remaining);
        assert!(page.next_after.is_none());
        assert!(page.entries.iter().all(|entry| entry.name.as_str() > after));
    }
    assert_eq!(
        calls(&client, "rpc.list"),
        1,
        "readdir cursors reuse a complete cached page"
    );
    observer.create(create(&directory.id, "file-256", false))?;
    std::thread::sleep(Duration::from_millis(120));
    let page = client.list(ListRequest {
        after: Some("file-255".into()),
        ..listing(&directory.id)
    })?;
    assert_eq!(page.entries.len(), 1, "expired EOF must see new names");
    assert_eq!(page.entries[0].name, "file-256");
    assert_eq!(calls(&client, "rpc.list"), 2);
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
        object_id: ancestor.id,
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
    assert!(
        client
            .list(listing(&ObjectRef::Root))?
            .listing_token
            .is_empty()
    );
    assert!(
        client
            .list(listing(&ObjectRef::Shared))?
            .listing_token
            .is_empty()
    );
    let page = client.list(listing(&directory.id))?;
    let revision = observer.stat_one(object(&directory.id))?.revision;
    admin.update_grants(grant(false))?;
    assert_ne!(
        observer.list(listing(&directory.id))?.listing_token,
        page.listing_token
    );
    assert_eq!(
        observer.stat_one(object(&directory.id))?.revision,
        revision,
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
            .list(listing(&ObjectRef::Root))?
            .entries
            .iter()
            .all(|e| e.name != "granted-directory")
    );
    assert!(client.list(listing(&ObjectRef::Shared))?.entries.is_empty());
    Ok(())
}

fn listing_commit_fences(
    endpoint: &str,
    key: &str,
    observer: &BlockingClient,
    root: &ObjectRef,
    state: &State,
    related: bool,
) -> Result<()> {
    let folder = observer
        .create(create(
            root,
            &format!("listing-file-commit-{related}"),
            true,
        ))?
        .object
        .context("directory")?;
    let file = observer
        .create(create(&folder.id, "file", false))?
        .object
        .context("file")?;
    let edited = if related {
        file.id
    } else {
        observer
            .create(create(root, "listing-unrelated-commit", false))?
            .object
            .context("unrelated file")?
            .id
    };
    let client = cached(endpoint, key, 800)?;
    client.stat_one(object(&edited))?;
    let pause = Arc::new(Pause {
        entered: Default::default(),
        release: Semaphore::new(0),
    });
    state
        .list_reply_pauses
        .lock()
        .insert(folder.id, pause.clone());
    let listing_client = client.clone();
    let task = std::thread::spawn(move || listing_client.list(listing(&folder.id)));
    let result = (|| -> Result<()> {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?
            .block_on(async {
                tokio::time::timeout(Duration::from_secs(2), pause.entered.notified()).await
            })?;
        client.write(WriteRequest {
            object_id: edited,
            data: b"committed".to_vec(),
            ..Default::default()
        })?;
        client.fsync(object(&edited))?;
        Ok(())
    })();
    state.list_reply_pauses.lock().remove(&folder.id);
    pause.release.add_permits(1);
    let page = task
        .join()
        .map_err(|_| anyhow::anyhow!("listing worker panicked"))??;
    result?;
    assert_eq!(
        page.entries[0].object.as_ref().context("file attr")?.size,
        if related { 9 } else { 0 }
    );
    assert_eq!(
        calls(&client, "cache.page_version_retry"),
        u64::from(related)
    );
    assert_eq!(calls(&client, "rpc.list"), 1 + u64::from(related));
    client.update(UpdateRequest {
        object_id: edited,
        size: Some(3),
        ..Default::default()
    })?;
    client.fsync(object(&edited))?;
    assert_eq!(
        client.list(listing(&folder.id))?.entries[0]
            .object
            .as_ref()
            .context("truncated attr")?
            .size,
        if related { 3 } else { 0 }
    );
    Ok(())
}
