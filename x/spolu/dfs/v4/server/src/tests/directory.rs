use super::*;
use mutation::Change;
use storage::Snapshot;

struct Prepared {
    snapshot: Arc<Snapshot>,
    response: Mutation,
}

// Pin two independent server transactions before either commit, including canonical response reads.
async fn prepare(
    f: &Fixture,
    api: &api::Api,
    grants: &[&str],
    changes: &[Change],
) -> std::result::Result<Prepared, tonic::Status> {
    let snapshot = api.0.storage.snapshot().await?;
    let first = changes
        .first()
        .ok_or_else(|| dfs_protocol::error::status(ErrorCode::InvalidInput))?;
    let view = read::View::prefetch(
        snapshot.clone(),
        &f.tenant.tenant_id,
        grants.iter().map(|s| s.to_string()).collect(),
        first.primary_id(),
        first.child_name(),
        api.0.ancestry.clone(),
    )
    .await?;
    let response = api::prepare_group(&view, changes).await?;
    Ok(Prepared { snapshot, response })
}
async fn commit(prepared: Prepared) -> Result<Mutation> {
    storage::commit(prepared.snapshot).await?;
    Ok(prepared.response)
}
async fn conflicts(prepared: Prepared) -> Result<()> {
    let error = storage::commit(prepared.snapshot)
        .await
        .err()
        .context("expected commit conflict")?;
    assert!(error.is_retryable_not_committed());
    Ok(())
}
fn creating(parent: &str, name: &str) -> Change {
    Change::Create(CreateRequest {
        parent_id: parent.into(),
        name: name.into(),
        object_id: uuid::Uuid::new_v4().simple().to_string(),
        mode: 0o644,
        ..Default::default()
    })
}
fn moving(id: &str, parent: &str, name: &str, replace: bool) -> Change {
    Change::Rename(RenameRequest {
        object_id: id.into(),
        parent_id: parent.into(),
        name: name.into(),
        replace,
    })
}
async fn stat(f: &Fixture, id: &str) -> Result<Object> {
    Ok(f.api
        .stat(request(
            &f.owner.session_key,
            ObjectRequest {
                object_id: id.into(),
            },
        )?)
        .await?
        .into_inner())
}
async fn grant(f: &Fixture, id: &str, attached: bool) -> Result<()> {
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: id.into(),
                changes: vec![GrantChange {
                    grant: "writer".into(),
                    attached,
                }],
            },
        )?)
        .await?;
    Ok(())
}
fn status<T>(result: std::result::Result<T, tonic::Status>, expected: ErrorCode) -> Result<()> {
    assert_eq!(code(&result.err().context("expected rejection")?), expected);
    Ok(())
}

pub(super) async fn contracts() -> Result<()> {
    independent_membership().await?;
    deletion_and_replacement().await?;
    moved_authority().await?;
    attributes_and_grants().await?;
    opposing_moves().await?;
    lost_replies_and_format().await?;
    Ok(())
}

async fn independent_membership() -> Result<()> {
    let f = Fixture::new().await?;
    let (peer, _) = f.peer().await?;
    let parent = f.create(&f.tenant.root_id, "deep", true).await?;
    let parent = f.create(&parent.id, "work", true).await?;
    let before = stat(&f, &parent.id).await?;
    let old = read::View::from_snapshot(
        f.api.0.storage.snapshot().await?,
        &f.tenant.tenant_id,
        ["owner".into()].into(),
    )
    .await?;
    let create_a = creating(&parent.id, "a");
    let create_b = creating(&parent.id, "b");
    let a = prepare(&f, &f.api, &["owner"], &[create_a]).await?;
    let b = prepare(&f, &peer, &["owner"], &[create_b]).await?;
    let a = commit(a).await?;
    let b = commit(b).await?;
    let after = stat(&f, &parent.id).await?;
    assert_ne!(before.revision, after.revision);
    assert_eq!(after, b.related[0]);
    assert_ne!(a.related[0].revision, b.related[0].revision);
    assert!(after.mtime.is_some() && after.ctime.is_some());
    assert_eq!(old.object(&parent.id).await?.object, before);
    let old_page = old.list(&parent.id, None, 64).await?;
    assert!(old_page.entries.is_empty());
    assert_eq!(
        old_page.directory_revision, before.revision,
        "page revision must come from its own snapshot, not a later stat"
    );
    let a = a.object.context("a")?;
    let b = b.object.context("b")?;
    // A sibling membership update must not invalidate the file writer's ancestry proof.
    let writing = prepare(
        &f,
        &f.api,
        &["owner"],
        &[Change::Write(WriteRequest {
            object_id: a.id.clone(),
            data: b"content".to_vec(),
            ..Default::default()
        })],
    )
    .await?;
    commit(prepare(&f, &peer, &["owner"], &[creating(&parent.id, "c")]).await?).await?;
    commit(writing).await?;
    assert_eq!(f.read(&a.id).await?.data, b"content");
    // Two different sibling renames also retain independent binding changes and parent timestamps.
    let left = prepare(
        &f,
        &f.api,
        &["owner"],
        &[moving(&a.id, &parent.id, "aa", false)],
    )
    .await?;
    let right = prepare(
        &f,
        &peer,
        &["owner"],
        &[moving(&b.id, &parent.id, "bb", false)],
    )
    .await?;
    commit(left).await?;
    commit(right).await?;
    let left = prepare(&f, &f.api, &["owner"], &[creating(&parent.id, "same")]).await?;
    let right = prepare(&f, &peer, &["owner"], &[creating(&parent.id, "same")]).await?;
    commit(left).await?;
    conflicts(right).await?;
    let left = prepare(
        &f,
        &f.api,
        &["owner"],
        &[Change::Remove(RemoveRequest {
            object_id: a.id.clone(),
            directory: false,
        })],
    )
    .await?;
    let right = prepare(
        &f,
        &peer,
        &["owner"],
        &[Change::Remove(RemoveRequest {
            object_id: b.id.clone(),
            directory: false,
        })],
    )
    .await?;
    commit(left).await?;
    commit(right).await?;
    let page = f
        .api
        .list(request(
            &f.owner.session_key,
            ListRequest {
                directory_id: parent.id,
                limit: 64,
                after: None,
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(
        page.entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>(),
        ["c", "same"]
    );
    Ok(())
}

async fn deletion_and_replacement() -> Result<()> {
    for replace in [false, true] {
        for create_first in [false, true] {
            let f = Fixture::new().await?;
            let (peer, _) = f.peer().await?;
            let parent = f.create(&f.tenant.root_id, "parent", true).await?;
            let directory = f.create(&parent.id, "destination", true).await?;
            let change = if replace {
                let source = f.create(&parent.id, "source", true).await?;
                moving(&source.id, &parent.id, "destination", true)
            } else {
                Change::Remove(RemoveRequest {
                    object_id: directory.id.clone(),
                    directory: true,
                })
            };
            let creation = creating(&directory.id, "child");
            let a = prepare(&f, &f.api, &["owner"], std::slice::from_ref(&creation)).await?;
            let b = prepare(&f, &peer, &["owner"], std::slice::from_ref(&change)).await?;
            if create_first {
                commit(a).await?;
                conflicts(b).await?;
                status(
                    prepare(&f, &peer, &["owner"], &[change]).await,
                    ErrorCode::NotEmpty,
                )?;
            } else {
                commit(b).await?;
                conflicts(a).await?;
                status(
                    prepare(&f, &f.api, &["owner"], &[creation]).await,
                    ErrorCode::NotFound,
                )?;
                let snapshot = f.api.0.storage.snapshot().await?;
                let keys = keys::Keys::new(&f.tenant.tenant_id)?;
                assert!(
                    snapshot
                        .get(keys.directory_state(&directory.id)?)
                        .await?
                        .is_none()
                );
            }
        }
    }
    Ok(())
}

async fn moved_authority() -> Result<()> {
    for create_first in [false, true] {
        let f = Fixture::new().await?;
        let (peer, _) = f.peer().await?;
        let allowed = f.create(&f.tenant.root_id, "allowed", true).await?;
        let hidden = f.create(&f.tenant.root_id, "hidden", true).await?;
        let parent = f.create(&allowed.id, "parent", true).await?;
        grant(&f, &allowed.id, true).await?;
        let creation = creating(&parent.id, "child");
        let movement = moving(&parent.id, &hidden.id, "parent", false);
        let a = prepare(&f, &f.api, &["writer"], std::slice::from_ref(&creation)).await?;
        let b = prepare(&f, &peer, &["owner"], std::slice::from_ref(&movement)).await?;
        if create_first {
            commit(a).await?;
            conflicts(b).await?;
            commit(prepare(&f, &peer, &["owner"], &[movement]).await?).await?;
        } else {
            commit(b).await?;
            conflicts(a).await?;
        }
        // The first server retains its old ancestry hint; it must follow the fresh parent link.
        status(
            prepare(&f, &f.api, &["writer"], &[creating(&parent.id, "denied")]).await,
            ErrorCode::NotFound,
        )?;
        grant(&f, &hidden.id, true).await?;
        commit(
            prepare(
                &f,
                &f.api,
                &["writer"],
                &[creating(&parent.id, "allowed-now")],
            )
            .await?,
        )
        .await?;
    }
    Ok(())
}

async fn attributes_and_grants() -> Result<()> {
    for create_first in [false, true] {
        let f = Fixture::new().await?;
        let (peer, _) = f.peer().await?;
        let parent = f.create(&f.tenant.root_id, "parent", true).await?;
        let creation = creating(&parent.id, "child");
        let attribute = Change::Update(UpdateRequest {
            object_id: parent.id.clone(),
            mode: Some(0o700),
            ..Default::default()
        });
        let a = prepare(&f, &f.api, &["owner"], std::slice::from_ref(&creation)).await?;
        let b = prepare(&f, &peer, &["owner"], std::slice::from_ref(&attribute)).await?;
        if create_first {
            let created = commit(a).await?;
            conflicts(b).await?;
            let updated = commit(prepare(&f, &peer, &["owner"], &[attribute]).await?).await?;
            assert_eq!(
                updated.object.context("updated parent")?.mtime,
                created.related[0].mtime
            );
        } else {
            commit(b).await?;
            conflicts(a).await?;
            let created = commit(prepare(&f, &f.api, &["owner"], &[creation]).await?).await?;
            assert_eq!(created.related[0].mode, 0o700);
        }
        grant(&f, &parent.id, true).await?;
        let a = prepare(&f, &f.api, &["writer"], &[creating(&parent.id, "revoked")]).await?;
        if create_first {
            commit(a).await?;
            grant(&f, &parent.id, false).await?;
        } else {
            grant(&f, &parent.id, false).await?;
            conflicts(a).await?;
        }
        status(
            prepare(&f, &f.api, &["writer"], &[creating(&parent.id, "denied")]).await,
            ErrorCode::NotFound,
        )?;
    }
    Ok(())
}

async fn opposing_moves() -> Result<()> {
    for reverse in [false, true] {
        let f = Fixture::new().await?;
        let (peer, _) = f.peer().await?;
        let a = f.create(&f.tenant.root_id, "a", true).await?;
        let b = f.create(&f.tenant.root_id, "b", true).await?;
        let (a, b) = if reverse { (b, a) } else { (a, b) };
        let first = moving(&a.id, &b.id, "a", false);
        let second = moving(&b.id, &a.id, "b", false);
        let left = prepare(&f, &f.api, &["owner"], &[first]).await?;
        let right = prepare(&f, &peer, &["owner"], std::slice::from_ref(&second)).await?;
        commit(left).await?;
        conflicts(right).await?;
        status(
            prepare(&f, &peer, &["owner"], &[second]).await,
            ErrorCode::InvalidInput,
        )?;
    }
    Ok(())
}

async fn lost_replies_and_format() -> Result<()> {
    let f = Fixture::new().await?;
    let (peer, session) = f.peer().await?;
    let parent = f.create(&f.tenant.root_id, "parent", true).await?;
    let mut ids = Vec::new();
    let groups = (0..8)
        .map(|n| {
            let id = uuid::Uuid::new_v4().simple().to_string();
            ids.push(id.clone());
            MutationGroup {
                id: n,
                edits: vec![
                    edit(edit::Operation::Create(CreateRequest {
                        parent_id: parent.id.clone(),
                        object_id: id.clone(),
                        name: format!("file{n}"),
                        mode: 0o644,
                        ..Default::default()
                    })),
                    write(&id, 0, &[n as u8]),
                ],
            }
        })
        .collect();
    let response = f
        .api
        .mutate_batch(request(
            &f.owner.session_key,
            MutateBatchRequest { groups },
        )?)
        .await?;
    drop(response);
    f.api.0.drain().await?;
    for (n, id) in ids.into_iter().enumerate() {
        let value = peer
            .read(request(
                &session.session_key,
                ReadRequest {
                    object_id: id,
                    length: 1,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner();
        assert_eq!(value.data, [n as u8]);
    }
    // A foreign format is rejected without erasing its existing keys.
    f.api
        .0
        .storage
        .transact(|_| async {
            let mut batch = storage::WriteBatch::new();
            batch.put(b"\0format", b"dfs-v4-fdb-1");
            Ok((batch, ()))
        })
        .await?;
    assert!(storage::Storage::open(&f.config).await.is_err());
    assert!(
        f.api
            .0
            .storage
            .get(keys::Keys::new(&f.tenant.tenant_id)?.object(&parent.id)?)
            .await?
            .is_some()
    );
    Ok(())
}
