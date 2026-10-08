use super::*;
use dfs_core::tree_log::{self as log, Head};

async fn head(f: &Fixture, id: ObjectRef) -> Result<Head> {
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    Ok(Head::decode(
        &f.api
            .0
            .storage
            .get(keys.tree_node(id.real()?))
            .await?
            .context("head")?,
    )?)
}
pub(super) async fn contracts() -> Result<()> {
    let f = Fixture::new().await?;
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    let root = head(&f, f.tenant.root_id).await?;
    assert!(root.node.directory && root.node.has_grants && root.node.parent.is_none());
    let a = f.create(&f.tenant.root_id, "a", true).await?;
    let b = f.create(&f.tenant.root_id, "b", true).await?;
    let file = f.create(&a.id, "file", false).await?;
    let original = head(&f, file.id).await?;
    f.api
        .write(request(
            &f.owner.session_key,
            WriteRequest {
                object_id: file.id,
                data: b"content".to_vec(),
                ..Default::default()
            },
        )?)
        .await?;
    assert_eq!(
        head(&f, file.id).await?,
        original,
        "content edits do not emit tree updates"
    );
    f.api
        .rename(request(
            &f.owner.session_key,
            RenameRequest {
                object_id: file.id,
                parent_id: a.id,
                name: "renamed".into(),
                replace: false,
            },
        )?)
        .await?;
    assert_eq!(
        head(&f, file.id).await?,
        original,
        "same-parent names are absent from the tree"
    );
    let old = f.api.0.storage.snapshot().await?;
    let old_version = old.read_version;
    for i in 0..4 {
        let parent_id = if i % 2 == 0 { b.id } else { a.id };
        f.api
            .rename(request(
                &f.owner.session_key,
                RenameRequest {
                    object_id: file.id,
                    parent_id,
                    name: "file".into(),
                    replace: false,
                },
            )?)
            .await?;
    }
    let moved = head(&f, file.id).await?;
    assert!(moved.stamp > original.stamp);
    assert_eq!(moved.node.parent, Some(a.id.real()?));
    let old_rows = log::interval(&old, &keys, 0, 1024 * 1024).await?;
    assert!(old_rows.updates.iter().any(|r| r.stamp == original.stamp));
    let fixed = f.api.0.storage.snapshot_at(Some(old_version)).await?;
    assert_eq!(
        Head::decode(
            &fixed
                .get(keys.tree_node(file.id.real()?))
                .await?
                .context("fixed head")?
        )?,
        original
    );
    let current = f.api.0.storage.snapshot().await?;
    let updates = log::interval(&current, &keys, old_version, 1024 * 1024).await?;
    assert_eq!(
        updates.updates.len(),
        1,
        "repeated moves coalesce to one final row"
    );
    assert_eq!(updates.updates[0].stamp, moved.stamp);
    let all = log::interval(&current, &keys, 0, 1024 * 1024).await?;
    assert_eq!(all.updates.len(), 4, "one row per live object");
    assert!(
        log::interval(&current, &keys, 0, 1).await.is_err(),
        "partial intervals cannot publish"
    );
    let empty = log::interval(&current, &keys, current.read_version, 1).await?;
    assert!(empty.updates.is_empty());
    assert_eq!(empty.version, current.read_version);
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: file.id,
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached: true,
                }],
            },
        )?)
        .await?;
    let snapshot = f.api.0.storage.snapshot().await?;
    let updates = log::interval(&snapshot, &keys, current.read_version, 1024 * 1024).await?;
    assert_eq!(updates.updates.len(), 1);
    let dfs_core::tree::Update::Live(image) = &updates.updates[0].update else {
        anyhow::bail!("live grant image")
    };
    assert_eq!(image.grants.len(), 1);
    assert!(head(&f, file.id).await?.node.has_grants);
    f.api
        .remove(request(
            &f.owner.session_key,
            RemoveRequest {
                object_id: file.id,
                directory: false,
            },
        )?)
        .await?;
    let deleted = head(&f, file.id).await?;
    assert!(deleted.node.deleted && !deleted.node.has_grants);
    let before_gc = f.api.0.storage.snapshot().await?;
    assert_eq!(log::deleted_count(&before_gc, &keys).await?, 1);
    let old_control = log::control(&before_gc, &keys).await?;
    assert_eq!(old_control.resume_floor, 0);
    let kept = log::collect(&before_gc, &keys, 0, 10, 1024 * 1024, 64).await?;
    assert!(
        kept.0.is_empty(),
        "young tombstones below the ceiling remain"
    );
    f.api
        .0
        .storage
        .transact(|snapshot| {
            let keys = &keys;
            async move { Ok((log::collect(&snapshot, keys, 0, 0, 0, 64).await?, ())) }
        })
        .await?;
    let after_gc = f.api.0.storage.snapshot().await?;
    assert_eq!(log::deleted_count(&after_gc, &keys).await?, 0);
    let control = log::control(&after_gc, &keys).await?;
    assert_eq!(control.incarnation, old_control.incarnation);
    assert_eq!(control.resume_floor, deleted.stamp.version());
    assert!(
        log::interval(&after_gc, &keys, 0, 1024 * 1024)
            .await
            .is_err(),
        "lagging consumers must rebuild"
    );
    assert_eq!(
        log::interval(&before_gc, &keys, 0, 1024 * 1024)
            .await?
            .updates
            .len(),
        4
    );
    let prefix = keys.tree_updates();
    assert_eq!(
        after_gc
            .range(&prefix, &keys::prefix_end(&prefix), 10)
            .await?
            .0
            .len(),
        3,
        "GC retains every live row regardless of age"
    );
    assert!(
        after_gc
            .get(keys.tree_node(file.id.real()?))
            .await?
            .is_none()
    );
    replacement_is_one_interval().await?;
    bootstrap_across_expired_base_snapshot().await?;
    disconnected_collection_restores_delete_capacity().await?;
    Ok(())
}

async fn disconnected_collection_restores_delete_capacity() -> Result<()> {
    let f = Fixture::new().await?;
    let first = f.create(&f.tenant.root_id, "first", false).await?;
    let second = f.create(&f.tenant.root_id, "second", false).await?;
    let config = crate::tree_gc::Config {
        tree_tombstone_max_count: 1,
        ..Default::default()
    };
    let capped = api::Api(State::with_tree_log_limits(
        f.api.0.storage.clone(),
        &"ab".repeat(32),
        config.limits(),
    )?);
    let owner = Fixture::session(&capped, &f.tenant, &["owner"]).await?;
    let remove = |id| {
        request(
            &owner.session_key,
            RemoveRequest {
                object_id: id,
                directory: false,
            },
        )
    };
    capped.remove(remove(first.id)?).await?;
    let error = capped
        .remove(remove(second.id)?)
        .await
        .err()
        .context("hard tombstone limit")?;
    assert_eq!(dfs_protocol::error::code(&error), ErrorCode::Capacity);
    f.api
        .stat_one(request(
            &f.owner.session_key,
            ObjectRequest {
                object_id: second.id,
            },
        )?)
        .await?;
    capped
        .close_session(request(&owner.session_key, Empty {})?)
        .await?;
    f.api
        .close_session(request(&f.owner.session_key, Empty {})?)
        .await?;
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    let storage = &f.api.0.storage;
    let a = storage.snapshot().await?;
    let b = storage.snapshot().await?;
    let left = log::collect(&a, &keys, 0, 0, 0, 64).await?;
    let right = log::collect(&b, &keys, 0, 0, 0, 64).await?;
    left.apply(&a)?;
    right.apply(&b)?;
    storage::commit(a).await?;
    assert!(
        storage::commit(b)
            .await
            .err()
            .context("concurrent GC")?
            .is_retryable_not_committed()
    );
    let owner = Fixture::session(&capped, &f.tenant, &["owner"]).await?;
    capped
        .remove(request(
            &owner.session_key,
            RemoveRequest {
                object_id: second.id,
                directory: false,
            },
        )?)
        .await?;
    capped
        .close_session(request(&owner.session_key, Empty {})?)
        .await?;
    let mut collector = crate::tree_gc::Collector::new(storage.clone(), config)?;
    collector.tick().await?;
    let snapshot = storage.snapshot().await?;
    assert_eq!(
        log::deleted_count(&snapshot, &keys).await?,
        0,
        "disconnected tenants are discovered durably"
    );
    assert!(log::control(&snapshot, &keys).await?.resume_floor > 0);
    assert!(
        snapshot
            .get(keys.tree_node(f.tenant.root_id.real()?))
            .await?
            .is_some(),
        "live root is retained"
    );
    Ok(())
}

async fn bootstrap_across_expired_base_snapshot() -> Result<()> {
    let f = Fixture::new().await?;
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    let a = f.create(&f.tenant.root_id, "a", true).await?;
    let b = f.create(&f.tenant.root_id, "b", true).await?;
    let removed = f.create(&a.id, "removed", false).await?;
    let moving = f.create(&a.id, "moving", false).await?;
    let pause = Arc::new(crate::tree_feed::BootstrapPause {
        entered: tokio::sync::Notify::new(),
        release: tokio::sync::Semaphore::new(0),
    });
    let bootstrap = crate::tree_feed::Replica::bootstrap(
        f.api.0.storage.clone(),
        &f.tenant.tenant_id,
        f.tenant.root_id.real()?,
        crate::tree_feed::Config {
            base_page_nodes: 1,
            bootstrap_pause: Some(pause.clone()),
            ..Default::default()
        },
    );
    let mutate = async {
        pause.entered.notified().await;
        f.api
            .rename(request(
                &f.owner.session_key,
                RenameRequest {
                    object_id: moving.id,
                    parent_id: b.id,
                    name: "moved".into(),
                    replace: false,
                },
            )?)
            .await?;
        f.api
            .remove(request(
                &f.owner.session_key,
                RemoveRequest {
                    object_id: removed.id,
                    directory: false,
                },
            )?)
            .await?;
        let created = f.create(&b.id, "new-during-bootstrap", false).await?;
        f.api
            .update_grants(request(
                &f.tenant.tenant_key,
                UpdateGrantsRequest {
                    tenant_id: f.tenant.tenant_id.clone(),
                    object_id: b.id,
                    changes: vec![GrantChange {
                        grant: "reader".into(),
                        attached: true,
                    }],
                },
            )?)
            .await?;
        tokio::time::sleep(std::time::Duration::from_millis(5200)).await;
        pause.release.add_permits(1);
        Ok::<_, anyhow::Error>(created)
    };
    let (replica, created) = tokio::join!(bootstrap, mutate);
    let mut replica = replica?;
    let created = created?;
    let snapshot = f.api.0.storage.snapshot().await?;
    let grants = dfs_core::grants::resolve(&snapshot, &keys, &["reader".into()].into()).await?;
    let ids = [
        moving.id.real()?,
        created.id.real()?,
        removed.id.real()?,
        a.id.real()?,
    ];
    let (proof, allowed) = replica
        .tree
        .authorize(&ids, &grants, std::time::Instant::now())?;
    assert_eq!(allowed, [true, true, false, false]);
    let empty = replica.poll().await?;
    assert_eq!(empty.generation, proof.generation);
    assert!(empty.read_version >= proof.read_version && empty.poll_started >= proof.poll_started);
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: b.id,
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached: false,
                }],
            },
        )?)
        .await?;
    let changed = replica.poll().await?;
    assert!(changed.generation > empty.generation);
    assert_eq!(
        replica
            .tree
            .authorize(&ids, &grants, std::time::Instant::now())?
            .1,
        [false; 4]
    );
    let before = replica.tree.proof();
    f.api
        .0
        .storage
        .transact(|_| {
            let keys = &keys;
            async move {
                let mut batch = storage::WriteBatch::new();
                batch.put(
                    keys.tree_incarnation(),
                    dfs_protocol::ObjectId::new_v4().as_bytes(),
                );
                Ok((batch, ()))
            }
        })
        .await?;
    assert!(replica.poll().await.is_err());
    assert_eq!(
        replica.tree.proof(),
        before,
        "a failed control fence cannot refresh the proof"
    );
    Ok(())
}

async fn replacement_is_one_interval() -> Result<()> {
    let f = Fixture::new().await?;
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    let a = f.create(&f.tenant.root_id, "a", true).await?;
    let b = f.create(&f.tenant.root_id, "b", true).await?;
    let source = f.create(&a.id, "source", false).await?;
    let target = f.create(&b.id, "target", false).await?;
    let before = f.api.0.storage.snapshot().await?.read_version;
    let response = f
        .api
        .rename(request(
            &f.owner.session_key,
            RenameRequest {
                object_id: source.id,
                parent_id: b.id,
                name: "target".into(),
                replace: true,
            },
        )?)
        .await?
        .into_inner();
    let snapshot = f.api.0.storage.snapshot().await?;
    let interval = log::interval(&snapshot, &keys, before, 1024 * 1024).await?;
    assert_eq!(interval.updates.len(), 2);
    assert_eq!(
        interval.updates[0].stamp, interval.updates[1].stamp,
        "replacement shares one FDB commit stamp"
    );
    assert_eq!(interval.updates[0].stamp.version(), response.commit_version);
    let (source, target, parent) = (source.id.real()?, target.id.real()?, b.id.real()?);
    assert!(
        interval
            .updates
            .iter()
            .any(|u| u.update == dfs_core::tree::Update::Deleted(target))
    );
    assert!(interval.updates.iter().any(|u| matches!(&u.update, dfs_core::tree::Update::Live(image) if image.id == source && image.parent == Some(parent))));
    Ok(())
}
