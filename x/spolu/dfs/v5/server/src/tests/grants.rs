use super::*;

pub(super) async fn contracts() -> Result<()> {
    let f = Fixture::new().await?;
    let object = f.create(&f.tenant.root_id, "future-grant", false).await?;
    let reader = Fixture::session(&f.api, &f.tenant, &["z-future"]).await?;
    let read = || {
        request(
            &reader.session_key,
            ObjectRequest {
                object_id: object.id,
            },
        )
    };
    assert!(f.api.stat_one(read()?).await.is_err());
    let change = |attached| UpdateGrantsRequest {
        tenant_id: f.tenant.tenant_id.clone(),
        object_id: object.id,
        changes: ["z-future", "a-first"]
            .map(|grant| GrantChange {
                grant: grant.into(),
                attached,
            })
            .to_vec(),
    };
    let (peer, _) = f.peer().await?;
    peer.update_grants(request(&f.tenant.tenant_key, change(true))?)
        .await?;
    assert_eq!(
        f.api.stat_one(read()?).await?.into_inner().id,
        object.id,
        "a session opened before first attachment uses its durable ID"
    );
    let page = |after| {
        request(
            &f.tenant.tenant_key,
            ListGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: object.id,
                limit: 1,
                after,
            },
        )
    };
    let first = f.api.list_grants(page(None)?).await?.into_inner();
    assert_eq!(first.grants, ["a-first"]);
    let second = peer
        .list_grants(page(first.next_after)?)
        .await?
        .into_inner();
    assert_eq!(second.grants, ["z-future"]);
    assert!(second.next_after.is_none());
    peer.update_grants(request(&f.tenant.tenant_key, change(false))?)
        .await?;
    assert!(f.api.stat_one(read()?).await.is_err());
    peer.update_grants(request(&f.tenant.tenant_key, change(true))?)
        .await?;
    f.api
        .remove(request(
            &f.owner.session_key,
            RemoveRequest {
                object_id: object.id,
                directory: false,
            },
        )?)
        .await?;
    let snapshot = f.api.0.storage.snapshot().await?;
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    for prefix in [keys.grants(&object.id)?, keys.grant_names(&object.id)?] {
        assert!(
            snapshot
                .range(&prefix, &keys::prefix_end(&prefix), 1)
                .await?
                .0
                .is_empty()
        );
    }
    let ids = dfs_core::grants::resolve(
        &snapshot,
        &keys,
        &["z-future".into(), "a-first".into()].into(),
    )
    .await?;
    for id in ids {
        assert!(
            snapshot
                .get(keys.granted_object(id, &object.id)?)
                .await?
                .is_none()
        );
    }
    Ok(())
}
