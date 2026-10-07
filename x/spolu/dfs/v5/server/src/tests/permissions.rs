use super::*;
use dfs_core::{
    grants,
    tree::{GrantId, TenantTree},
};
use std::time::{Duration, Instant};

fn config() -> crate::permissions::Config {
    crate::permissions::Config {
        permission_max_age_ms: 2000,
        tree_poll_ms: 20,
        tree_idle_ms: 40,
        tree_memory_bytes: 2 * 1024 * 1024,
        tree_tenant_peak_bytes: 1024 * 1024,
        tree_staging_bytes: 64 * 1024,
        tree_base_page_nodes: 2,
        tree_io_concurrency: 2,
    }
}
async fn wait_for(mut predicate: impl FnMut() -> bool) -> Result<()> {
    tokio::time::timeout(Duration::from_secs(5), async {
        while !predicate() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .context("permission tree readiness")?;
    Ok(())
}
async fn ids(f: &Fixture, names: &[&str]) -> Result<Vec<GrantId>> {
    let snapshot = f.api.0.storage.snapshot().await?;
    Ok(grants::resolve(
        &snapshot,
        &keys::Keys::new(&f.tenant.tenant_id)?,
        &names.iter().map(|s| s.to_string()).collect(),
    )
    .await?)
}
async fn warm(
    f: &Fixture,
    candidates: &[dfs_protocol::ObjectId],
    grants: &[GrantId],
    expected: &[bool],
) -> Result<Arc<TenantTree>> {
    wait_for(|| {
        f.api
            .0
            .permissions
            .tree(&f.tenant.tenant_id)
            .is_some_and(|tree| {
                tree.authorize(candidates, grants, Instant::now())
                    .is_ok_and(|(_, allowed)| allowed == expected)
            })
    })
    .await?;
    f.api
        .0
        .permissions
        .tree(&f.tenant.tenant_id)
        .context("resident tree")
}
async fn grant(
    api: &api::Api,
    tenant: &Tenant,
    object_id: ObjectRef,
    attached: bool,
) -> Result<()> {
    api.update_grants(request(
        &tenant.tenant_key,
        UpdateGrantsRequest {
            tenant_id: tenant.tenant_id.clone(),
            object_id,
            changes: vec![GrantChange {
                grant: "reader".into(),
                attached,
            }],
        },
    )?)
    .await?;
    Ok(())
}
pub(super) async fn contracts() -> Result<()> {
    stale_grants_and_whole_operation_fallback().await?;
    generation_change_retries_the_entire_read().await?;
    generation_change_discards_prepared_mutations().await?;
    eviction_retains_reservations_until_readers_release().await?;
    Ok(())
}
async fn stale_grants_and_whole_operation_fallback() -> Result<()> {
    let f = Fixture::with_permissions(config()).await?;
    let folder = f.create(&f.tenant.root_id, "folder", true).await?;
    let file = f.create(&folder.id, "file", false).await?;
    let hidden = f.create(&f.tenant.root_id, "hidden", false).await?;
    grant(&f.api, &f.tenant, folder.id, true).await?;
    let reader = Fixture::session(&f.api, &f.tenant, &["reader"]).await?;
    let grants = ids(&f, &["reader"]).await?;
    let tree = warm(
        &f,
        &[file.id.real()?, hidden.id.real()?],
        &grants,
        &[true, false],
    )
    .await?;
    f.api.0.permissions.pause(true).await;
    let proof = tree.proof();
    let (peer, owner) = f.peer().await?;
    grant(&peer, &f.tenant, folder.id, false).await?;
    let read = || request(&reader.session_key, ObjectRequest { object_id: file.id });
    f.api.stat_one(read()?).await?;
    let candidates = vec![
        file.id.real()?,
        hidden.id.real()?,
        dfs_protocol::ObjectId::new_v4(),
    ];
    assert_eq!(
        f.api
            .filter_search_candidates(request(&reader.session_key, candidates)?)
            .await?
            .into_inner(),
        [file.id.real()?]
    );
    let created = ObjectRef::new_v4();
    let groups = vec![MutationGroup {
        id: 1,
        edits: vec![
            edit(edit::Operation::Create(CreateRequest {
                parent_id: folder.id,
                object_id: created,
                name: "created-with-cached-authority".into(),
                mode: 0o644,
                ..Default::default()
            })),
            edit(edit::Operation::Write(WriteRequest {
                object_id: created,
                data: b"private overlay".to_vec(),
                ..Default::default()
            })),
        ],
    }];
    let results: Vec<_> = f
        .api
        .mutate_batch(request(&reader.session_key, MutateBatchRequest { groups })?)
        .await?
        .into_inner()
        .try_collect()
        .await?;
    assert!(
        results[0].error.is_none(),
        "creation overlays retain the parent's pinned authority"
    );
    for (parent_id, allowed) in [(f.tenant.root_id, false), (folder.id, true)] {
        peer.rename(request(
            &owner.session_key,
            RenameRequest {
                object_id: file.id,
                parent_id,
                name: "moved-file".into(),
                replace: false,
            },
        )?)
        .await?;
        assert_eq!(
            f.api.stat_one(read()?).await.is_ok(),
            allowed,
            "a current parent mismatch requires the full FDB proof"
        );
    }
    let new = peer
        .create(request(
            &owner.session_key,
            CreateRequest {
                parent_id: folder.id,
                name: "remote-new".into(),
                mode: 0o644,
                ..Default::default()
            },
        )?)
        .await?
        .into_inner()
        .object
        .context("remote file")?;
    let batch = f
        .api
        .stat(request(
            &reader.session_key,
            StatRequest {
                object_ids: vec![file.id, new.id],
            },
        )?)
        .await?
        .into_inner();
    assert!(
        batch
            .results
            .iter()
            .all(|r| r.object.is_none() && r.error.is_some()),
        "an unknown object makes the whole batch use current FDB authority"
    );
    let before_deadline =
        proof.poll_started + Duration::from_millis(config().permission_max_age_ms + 5);
    tokio::time::sleep(before_deadline.saturating_duration_since(Instant::now())).await;
    assert!(
        f.api.stat_one(read()?).await.is_err(),
        "expired trees cannot authorize revoked grants"
    );
    f.api.0.permissions.pause(false).await;
    warm(&f, &[file.id.real()?], &grants, &[false]).await?;
    assert!(tree.check_proof(proof, Instant::now()).is_err());
    Ok(())
}

async fn generation_change_retries_the_entire_read() -> Result<()> {
    let f = Fixture::with_permissions(config()).await?;
    let first = f.create(&f.tenant.root_id, "first", false).await?;
    let second = f.create(&f.tenant.root_id, "second", false).await?;
    grant(&f.api, &f.tenant, first.id, true).await?;
    let reader = Fixture::session(&f.api, &f.tenant, &["reader"]).await?;
    let grants = ids(&f, &["reader"]).await?;
    warm(
        &f,
        &[first.id.real()?, second.id.real()?],
        &grants,
        &[true, false],
    )
    .await?;
    let entered = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let once = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let call = f
        .api
        .read_call(request(&reader.session_key, vec![first.id, second.id])?, {
            let (entered, release, once) = (entered.clone(), release.clone(), once.clone());
            move |view, ids| {
                let (entered, release, once) = (entered.clone(), release.clone(), once.clone());
                async move {
                    let first = view.session_stat(&ids[0]).await.is_ok();
                    if !once.swap(true, std::sync::atomic::Ordering::AcqRel) {
                        entered.notify_one();
                        release.notified().await;
                    }
                    let second = view.session_stat(&ids[1]).await.is_ok();
                    Ok(vec![first, second])
                }
            }
        });
    let change = async {
        entered.notified().await;
        grant(&f.api, &f.tenant, first.id, false).await?;
        grant(&f.api, &f.tenant, second.id, true).await?;
        warm(
            &f,
            &[first.id.real()?, second.id.real()?],
            &grants,
            &[false, true],
        )
        .await?;
        release.notify_one();
        Ok::<_, anyhow::Error>(())
    };
    let (result, changed) = tokio::time::timeout(Duration::from_secs(10), async {
        tokio::join!(call, change)
    })
    .await?;
    changed?;
    assert_eq!(
        result?.into_inner(),
        [false, true],
        "no mixed-generation permission result escapes"
    );
    Ok(())
}

async fn generation_change_discards_prepared_mutations() -> Result<()> {
    let f = Fixture::with_permissions(config()).await?;
    let folder = f.create(&f.tenant.root_id, "folder", true).await?;
    let file = f.create(&folder.id, "file", false).await?;
    grant(&f.api, &f.tenant, folder.id, true).await?;
    let reader = Fixture::session(&f.api, &f.tenant, &["reader"]).await?;
    let grants = ids(&f, &["reader"]).await?;
    warm(&f, &[file.id.real()?], &grants, &[true]).await?;
    let pause = Arc::new(Pause {
        entered: tokio::sync::Notify::new(),
        release: tokio::sync::Semaphore::new(0),
    });
    f.api.0.prepare_pauses.lock().insert(file.id, pause.clone());
    let write = f.api.write(request(
        &reader.session_key,
        WriteRequest {
            object_id: file.id,
            data: b"must not commit".to_vec(),
            ..Default::default()
        },
    )?);
    let change = async {
        pause.entered.notified().await;
        grant(&f.api, &f.tenant, folder.id, false).await?;
        warm(&f, &[file.id.real()?], &grants, &[false]).await?;
        f.api.0.prepare_pauses.lock().remove(&file.id);
        pause.release.add_permits(1);
        Ok::<_, anyhow::Error>(())
    };
    let (write, changed) = tokio::time::timeout(Duration::from_secs(10), async {
        tokio::join!(write, change)
    })
    .await?;
    changed?;
    assert_eq!(
        code(&write.err().context("changed authority")?),
        ErrorCode::NotFound
    );
    assert!(
        f.read(&file.id).await?.data.is_empty(),
        "discard the private write before retrying with FDB authority"
    );
    Ok(())
}

async fn eviction_retains_reservations_until_readers_release() -> Result<()> {
    let f = Fixture::with_permissions(config()).await?;
    let owner = ids(&f, &["owner"]).await?;
    drop(warm(&f, &[f.tenant.root_id.real()?], &owner, &[true]).await?);
    let pinned = f
        .api
        .0
        .permissions
        .pin(&f.tenant.tenant_id)
        .context("pinned authority")?;
    let second = f
        .api
        .create_tenant(request(
            &"ab".repeat(32),
            CreateTenantRequest {
                tenant_id: "second".into(),
                root_grants: vec!["owner".into()],
            },
        )?)
        .await?
        .into_inner();
    let reader = Fixture::session(&f.api, &second, &["owner"]).await?;
    f.api
        .stat_one(request(
            &reader.session_key,
            ObjectRequest {
                object_id: second.root_id,
            },
        )?)
        .await?;
    assert!(
        f.api.0.permissions.pin(&second.tenant_id).is_none(),
        "a second peak cannot bypass the aggregate budget"
    );
    f.api
        .close_session(request(&f.owner.session_key, Empty {})?)
        .await?;
    wait_for(|| f.api.0.permissions.tree(&f.tenant.tenant_id).is_none()).await?;
    assert_eq!(
        f.api.0.permissions.reserved_bytes(),
        config().tree_tenant_peak_bytes
    );
    assert!(
        f.api.0.permissions.pin(&second.tenant_id).is_none(),
        "an in-flight authority keeps its reservation after eviction"
    );
    drop(pinned);
    wait_for(|| f.api.0.permissions.pin(&second.tenant_id).is_some()).await?;
    assert_eq!(
        f.api.0.permissions.reserved_bytes(),
        config().tree_tenant_peak_bytes
    );
    f.api
        .close_session(request(&reader.session_key, Empty {})?)
        .await?;
    wait_for(|| f.api.0.permissions.reserved_bytes() == 0).await?;
    Ok(())
}
