use std::collections::HashSet;

use anyhow::{Context, Result, ensure};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{operation::Operation as Op, *},
};
use futures::{StreamExt, TryStreamExt, stream};

use crate::client::{Client, allow, create, expect_status, remove};

const APPEND_COUNT: u64 = 64;
const CONCURRENT_REQUESTS: usize = 8;
const TOKEN_BYTES: usize = size_of::<u64>();

pub async fn run(
    master: &mut Client,
    admin: &mut Client,
    mut owner: Client,
    tenant: &Tenant,
) -> Result<()> {
    let folder = ObjectId::new_v7();
    owner
        .one(create(
            folder,
            tenant.root_id,
            "scenarios",
            ObjectKind::Directory,
        ))
        .await?;
    batching(&mut owner, folder).await.context("batching")?;
    permissions(admin, &mut owner, folder)
        .await
        .context("permissions and shared")?;
    concurrency(&mut owner, folder)
        .await
        .context("concurrency")?;
    isolation(master, &mut owner, folder)
        .await
        .context("tenant isolation")?;
    ensure!(
        owner.list(folder.into()).await?.is_empty(),
        "scenario objects not cleaned up"
    );
    owner
        .one(remove(folder, tenant.root_id, ObjectKind::Directory))
        .await?;
    Ok(())
}

async fn batching(owner: &mut Client, parent: ObjectId) -> Result<()> {
    let id = ObjectId::new_v7();
    let results = owner
        .apply(vec![
            create(id, parent, "batch", ObjectKind::File),
            Op::Write(WriteOperation {
                object_id: id,
                offset: u64::MAX,
                data: vec![1],
                append: false,
            }),
            Op::Write(WriteOperation {
                object_id: id,
                offset: 0,
                data: b"contents".to_vec(),
                append: false,
            }),
        ])
        .await?;
    ensure!(
        results[1] == Err(ErrorCode::InvalidInput),
        "overflowing write was not rejected"
    );
    for (index, size, version) in [(0, 0, 1), (2, 8, 2)] {
        let mutation = results[index]
            .as_ref()
            .map_err(|e| anyhow::anyhow!("batch operation {index}: {e:?}"))?;
        let attr = mutation
            .object
            .as_ref()
            .context("missing batch attributes")?;
        ensure!(
            attr.size == size && attr.attr_version == version && attr.content_version == version,
            "batch returned final rather than per-operation attributes"
        );
    }
    ensure!(
        owner.read(id, 0, 100).await?.data == b"contents",
        "successful operation after failed write lost"
    );
    let collision = owner
        .apply(vec![create(
            ObjectId::new_v7(),
            parent,
            "batch",
            ObjectKind::File,
        )])
        .await?;
    ensure!(
        collision == vec![Err(ErrorCode::AlreadyExists)],
        "name collision not rejected"
    );
    owner.one(remove(id, parent, ObjectKind::File)).await?;
    Ok(())
}

async fn permissions(admin: &mut Client, owner: &mut Client, parent: ObjectId) -> Result<()> {
    let (mut guest, session) = admin
        .session(vec!["reader".into(), "group".into(), "reader".into()])
        .await?;
    ensure!(
        session.subjects.len() == 2,
        "session subjects were not deduplicated"
    );
    let request = guest.request(Empty {});
    let current = guest.api.current_session(request).await?.into_inner();
    ensure!(
        current.id == session.id
            && current.subjects == session.subjects
            && current.session_key.is_empty(),
        "CurrentSession mismatch"
    );
    let request = guest.request(Empty {});
    let refreshed = guest.api.refresh_session(request).await?.into_inner();
    ensure!(
        refreshed.id == session.id
            && refreshed.expires_at >= session.expires_at
            && refreshed.session_key.is_empty(),
        "RefreshSession mismatch"
    );

    // Multiple subjects point to the same objects; duplicate basenames need distinct shared aliases.
    let mut fixtures = Vec::new();
    for index in 0..5 {
        let directory = ObjectId::new_v7();
        let id = ObjectId::new_v7();
        owner
            .one(create(
                directory,
                parent,
                &format!("hidden-{index}"),
                ObjectKind::Directory,
            ))
            .await?;
        owner
            .one(create(id, directory, "report", ObjectKind::File))
            .await?;
        let request = admin.request(UpdateGrantsRequest {
            object_id: id,
            changes: vec![
                GrantUpdate {
                    grant: allow("reader", 0o4),
                    remove: false,
                },
                GrantUpdate {
                    grant: allow("group", 0o4),
                    remove: false,
                },
            ],
        });
        admin.api.update_grants(request).await?;
        let attr = guest.stat(id, false).await?;
        ensure!(
            attr.mode == 0o400
                && attr.grants_version == 2
                && attr.attr_version == 1
                && attr.content_version == 1,
            "grant update changed wrong versions or mode"
        );
        guest.stat_error(directory, ErrorCode::NotFound).await?;
        fixtures.push((directory, id));
    }
    let entries = guest.list(ObjectRef::Shared).await?;
    let expected: HashSet<_> = fixtures
        .iter()
        .map(|(_, id)| format!("report--{id}"))
        .collect();
    ensure!(
        entries.len() == expected.len()
            && entries
                .iter()
                .map(|entry| entry.name.clone())
                .collect::<HashSet<_>>()
                == expected,
        "shared pagination/deduplication mismatch"
    );
    for entry in entries {
        let attr = guest
            .lookup(ObjectRef::Shared, &entry.name)
            .await?
            .map_err(|e| anyhow::anyhow!("shared lookup: {e:?}"))?;
        ensure!(
            attr.name == "report" && attr.mode == 0o400,
            "shared attributes mismatch"
        );
    }
    let (_, id) = fixtures[0];
    ensure!(
        guest
            .lookup(ObjectRef::Shared, &format!("old-name--{id}"))
            .await?
            .is_ok(),
        "shared prefix is not decorative"
    );
    let results = guest
        .apply(vec![Op::Write(WriteOperation {
            object_id: id,
            offset: 0,
            data: vec![1],
            append: false,
        })])
        .await?;
    ensure!(
        results == vec![Err(ErrorCode::Forbidden)],
        "read-only write was accepted"
    );

    let mut grants = Vec::new();
    let mut after = None;
    let mut cursors = HashSet::new();
    loop {
        let request = admin.request(ListGrantsRequest {
            object_id: id,
            after,
            limit: 1,
        });
        let page = admin.api.list_grants(request).await?.into_inner();
        ensure!(page.grants.len() <= 1, "grant page exceeded limit");
        grants.extend(page.grants);
        let Some(next) = page.next_after else {
            break;
        };
        ensure!(cursors.insert(next.clone()), "ListGrants cursor repeated");
        after = Some(next);
    }
    ensure!(
        grants.len() == 2
            && grants.contains(&allow("reader", 0o4))
            && grants.contains(&allow("group", 0o4)),
        "listed grants mismatch"
    );
    let request = admin.request(UpdateGrantsRequest {
        object_id: id,
        changes: grants
            .into_iter()
            .map(|grant| GrantUpdate {
                grant,
                remove: true,
            })
            .collect(),
    });
    admin.api.update_grants(request).await?;
    guest.stat_error(id, ErrorCode::NotFound).await?;
    ensure!(
        guest
            .lookup(ObjectRef::Shared, &format!("report--{id}"))
            .await?
            == Err(ErrorCode::NotFound),
        "revoked shared alias still resolves"
    );
    let entries = guest.list(ObjectRef::Shared).await?;
    ensure!(
        entries.len() == fixtures.len() - 1
            && entries
                .iter()
                .all(|entry| entry.object.as_ref().is_some_and(|a| a.id != id.into())),
        "revoked shared object still listed"
    );

    for (directory, id) in fixtures {
        owner.one(remove(id, directory, ObjectKind::File)).await?;
        owner
            .one(remove(directory, parent, ObjectKind::Directory))
            .await?;
    }
    let request = admin.request(RevokeSessionRequest {
        session_id: session.id,
    });
    admin.api.revoke_session(request).await?;
    // This run targets one server, whose local authentication cache is evicted by RevokeSession.
    let request = guest.request(Empty {});
    expect_status(
        guest.api.refresh_session(request).await,
        ErrorCode::Unauthenticated,
    )?;
    Ok(())
}

async fn concurrency(owner: &mut Client, parent: ObjectId) -> Result<()> {
    let id = ObjectId::new_v7();
    owner
        .one(create(id, parent, "appends", ObjectKind::File))
        .await?;
    // Every append has a unique fixed-size token; completion order is deliberately unconstrained.
    let versions: Vec<_> = stream::iter(0..APPEND_COUNT)
        .map(|token| {
            let mut client = owner.clone();
            async move {
                let mutation = client
                    .one(Op::Write(WriteOperation {
                        object_id: id,
                        offset: u64::MAX,
                        data: token.to_le_bytes().to_vec(),
                        append: true,
                    }))
                    .await?;
                Ok::<_, anyhow::Error>(
                    mutation
                        .object
                        .context("missing append attributes")?
                        .content_version,
                )
            }
        })
        .buffer_unordered(CONCURRENT_REQUESTS)
        .try_collect()
        .await?;
    ensure!(
        versions.into_iter().collect::<HashSet<_>>() == (2..=APPEND_COUNT + 1).collect(),
        "lost or duplicate append versions"
    );
    let read = owner
        .read(id, 0, (APPEND_COUNT as usize * TOKEN_BYTES) as u32)
        .await?;
    ensure!(
        read.object.size == APPEND_COUNT * TOKEN_BYTES as u64
            && read.data.len() == APPEND_COUNT as usize * TOKEN_BYTES,
        "append length mismatch"
    );
    let mut tokens = read
        .data
        .as_chunks::<TOKEN_BYTES>()
        .0
        .iter()
        .map(|bytes| u64::from_le_bytes(*bytes))
        .collect::<Vec<_>>();
    tokens.sort_unstable();
    ensure!(
        tokens == (0..APPEND_COUNT).collect::<Vec<_>>(),
        "lost, duplicated, or interleaved appends"
    );
    owner.one(remove(id, parent, ObjectKind::File)).await?;

    let ids = [ObjectId::new_v7(), ObjectId::new_v7()];
    let results = futures::future::try_join_all(ids.into_iter().map(|id| {
        let mut client = owner.clone();
        async move {
            Ok::<_, anyhow::Error>((
                id,
                client
                    .apply(vec![create(id, parent, "collision", ObjectKind::File)])
                    .await?,
            ))
        }
    }))
    .await?;
    ensure!(
        results.iter().filter(|(_, r)| r[0].is_ok()).count() == 1
            && results
                .iter()
                .filter(|(_, r)| r[0] == Err(ErrorCode::AlreadyExists))
                .count()
                == 1,
        "concurrent creates did not serialize"
    );
    let winner = results
        .iter()
        .find(|(_, r)| r[0].is_ok())
        .context("missing create winner")?
        .0;
    owner.one(remove(winner, parent, ObjectKind::File)).await?;

    let a = ObjectId::new_v7();
    let b = ObjectId::new_v7();
    owner
        .one(create(a, parent, "a", ObjectKind::Directory))
        .await?;
    owner
        .one(create(b, parent, "b", ObjectKind::Directory))
        .await?;
    let results = futures::future::try_join_all([(a, b, "a"), (b, a, "b")].into_iter().map(
        |(id, target, name)| {
            let mut client = owner.clone();
            async move {
                client
                    .apply(vec![Op::Move(MoveOperation {
                        object_id: id,
                        parent_id: parent,
                        target_id: Some(target),
                        name: name.into(),
                    })])
                    .await
            }
        },
    ))
    .await?;
    ensure!(
        results.iter().filter(|r| r[0].is_ok()).count() == 1
            && results
                .iter()
                .filter(|r| r[0] == Err(ErrorCode::InvalidInput))
                .count()
                == 1,
        "concurrent moves created a cycle or both failed"
    );
    let (child, directory) = if results[0][0].is_ok() {
        (a, b)
    } else {
        (b, a)
    };
    owner
        .one(remove(child, directory, ObjectKind::Directory))
        .await?;
    owner
        .one(remove(directory, parent, ObjectKind::Directory))
        .await?;
    Ok(())
}

async fn isolation(master: &mut Client, owner: &mut Client, foreign: ObjectId) -> Result<()> {
    let request = master.request(CreateTenantRequest {
        tenant_id: format!("workload-isolation-{}", ObjectId::new_v7()),
        root_grants: vec![allow("owner", 0o6)],
    });
    let tenant = master.api.create_tenant(request).await?.into_inner();
    let mut admin = master.with_key(&tenant.tenant_key)?;
    let (mut other, session) = admin.session(vec!["owner".into()]).await?;
    other.stat_error(foreign, ErrorCode::NotFound).await?;
    owner
        .stat_error(tenant.root_id, ErrorCode::NotFound)
        .await?;
    let result = other
        .apply(vec![create(
            ObjectId::new_v7(),
            foreign,
            "foreign",
            ObjectKind::File,
        )])
        .await?;
    ensure!(
        result == vec![Err(ErrorCode::NotFound)],
        "cross-tenant create succeeded"
    );
    let request = admin.request(RevokeSessionRequest {
        session_id: session.id,
    });
    admin.api.revoke_session(request).await?;
    Ok(())
}
