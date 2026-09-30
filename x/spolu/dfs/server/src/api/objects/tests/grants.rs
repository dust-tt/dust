use super::*;

impl Fixture {
    async fn patch_grants(
        &self,
        object: ObjectId,
        revision: u64,
        grants: Value,
    ) -> Result<(StatusCode, Value)> {
        call(
            &self.app,
            "POST",
            "/objects/grants/update",
            Some(&self.workspace_key),
            json!({
                "workspace_id":self.workspace.as_str(), "object_id":object.to_string(),
                "expected_metadata_revision":revision, "grants":grants,
            }),
        )
        .await
    }

    async fn list_grants(
        &self,
        object: ObjectId,
        after: Option<&str>,
        limit: usize,
    ) -> Result<(StatusCode, Value)> {
        call(
            &self.app,
            "POST",
            "/objects/grants/list",
            Some(&self.workspace_key),
            json!({
                "workspace_id":self.workspace.as_str(), "object_id":object.to_string(),
                "after":after, "limit":limit,
            }),
        )
        .await
    }
}

#[tokio::test]
async fn grant_patches_update_both_indexes_and_live_inherited_access() -> Result<()> {
    let f = Fixture::new().await?;
    let old = f.storage.workspace(&f.workspace)?.read_view().await?;
    let before = old.object(f.shared.id).await?.context("shared object")?;
    let (status, updated) = f
        .patch_grants(
            f.shared.id,
            0,
            json!({"reader":false,"arbitrary/\u{0000}é":true,"":true}),
        )
        .await?;
    ensure!(status == StatusCode::OK && updated["metadata_revision"] == 1);
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(view.grants(f.shared.id, None, 10).await? == ["", "arbitrary/\0é"]);
    ensure!(view.granted_objects("reader", None, 10).await?.is_empty());
    for grant in ["", "arbitrary/\0é"] {
        ensure!(view.granted_objects(grant, None, 10).await? == [f.shared.id]);
    }
    let changed = view.object(f.shared.id).await?.context("shared object")?;
    ensure!(changed.metadata_revision.get() == 1 && changed.posix.ctime != before.posix.ctime);
    ensure!(changed.posix.atime == before.posix.atime && changed.posix.mtime == before.posix.mtime);
    ensure!(
        changed.parent == before.parent
            && changed.kind == before.kind
            && changed.xattrs == before.xattrs
    );
    ensure!(view.changes(2, 10).await?[0].object_ids == [f.shared.id]);
    ensure!(view.object(f.files[0].id).await? == Some(f.files[0].clone()));
    ensure!(view.grants(f.files[0].id, None, 10).await?.is_empty());
    ensure!(old.grants(f.shared.id, None, 10).await? == ["reader"]);
    for id in [f.shared.id, f.files[0].id] {
        ensure!(
            f.request("/objects/stat", json!({"object_id":id.to_string()}))
                .await?
                .0
                == StatusCode::NOT_FOUND
        );
    }
    ensure!(
        f.request(
            "/objects/mkdir",
            json!({"parent_id":f.shared.id.to_string(),"name":"revoked"})
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    ensure!(
        f.request(
            "/objects/update",
            json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,"mode":0})
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    ensure!(
        f.patch_grants(f.files[0].id, 0, json!({"reader":true}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(
        f.request(
            "/objects/stat",
            json!({"object_id":f.files[0].id.to_string()})
        )
        .await?
        .0 == StatusCode::OK
    );
    ensure!(
        f.request(
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string()})
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    // A parent grant still authorizes the child after its direct attachment is removed.
    ensure!(
        f.patch_grants(f.shared.id, 1, json!({"reader":true}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(
        f.patch_grants(f.files[0].id, 1, json!({"reader":false}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(
        f.request(
            "/objects/stat",
            json!({"object_id":f.files[0].id.to_string()})
        )
        .await?
        .0 == StatusCode::OK
    );
    let current = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(current.grants(f.files[0].id, None, 10).await?.is_empty());
    ensure!(current.granted_objects("reader", None, 10).await? == [f.shared.id]);
    drop(current);
    drop(view);
    drop(old);
    f.close().await
}

#[tokio::test]
async fn grant_administration_requires_workspace_authority_and_valid_bounded_input() -> Result<()> {
    let f = Fixture::new().await?;
    let (_, other) = call(
        &f.app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({"workspace_id":"other"}),
    )
    .await?;
    for (route, body) in [
        (
            "/objects/grants/list",
            json!({"workspace_id":"w","object_id":f.shared.id.to_string()}),
        ),
        (
            "/objects/grants/update",
            json!({"workspace_id":"w","object_id":f.shared.id.to_string(),"expected_metadata_revision":0,"grants":{"reader":false}}),
        ),
    ] {
        for key in [
            None,
            Some(SERVER_KEY),
            Some(f.key.as_str()),
            Some(text(&other, "workspace_key")?),
        ] {
            ensure!(
                call(&f.app, "POST", route, key, body.clone()).await?.0 == StatusCode::UNAUTHORIZED
            );
        }
        let mut other_scope = body.clone();
        other_scope["workspace_id"] = json!("other");
        ensure!(
            call(
                &f.app,
                "POST",
                route,
                Some(&f.workspace_key),
                other_scope.clone()
            )
            .await?
            .0 == StatusCode::UNAUTHORIZED
        );
        ensure!(
            call(
                &f.app,
                "POST",
                route,
                Some(text(&other, "workspace_key")?),
                other_scope
            )
            .await?
            .0 == StatusCode::NOT_FOUND
        );
        let mut missing_workspace = body;
        missing_workspace["workspace_id"] = json!("missing");
        ensure!(
            call(
                &f.app,
                "POST",
                route,
                Some(&f.workspace_key),
                missing_workspace
            )
            .await?
            .0 == StatusCode::UNAUTHORIZED
        );
    }
    ensure!(f.list_grants(ObjectId::generate(), None, 10).await?.0 == StatusCode::NOT_FOUND);
    ensure!(
        f.patch_grants(ObjectId::generate(), 0, json!({"reader":true}))
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    ensure!(
        f.patch_grants(f.shared.id, 99, json!({"reader":true}))
            .await?
            .0
            == StatusCode::CONFLICT
    );
    let oversized: BTreeMap<_, _> = (0..513).map(|i| (i.to_string(), true)).collect();
    for patch in [
        json!({}),
        json!(oversized),
        json!({"bad":null}),
        json!({"bad":"true"}),
    ] {
        ensure!(f.patch_grants(f.shared.id, 0, patch).await?.0 == StatusCode::BAD_REQUEST);
    }
    for limit in [0, 1001] {
        ensure!(f.list_grants(f.shared.id, None, limit).await?.0 == StatusCode::BAD_REQUEST);
    }
    let (status, current) = f.list_grants(f.shared.id, None, 10).await?;
    ensure!(
        status == StatusCode::OK
            && current["grants"] == json!(["reader"])
            && current["metadata_revision"] == 0
    );
    ensure!(
        f.storage
            .workspace(&f.workspace)?
            .read_view()
            .await?
            .changes(2, 10)
            .await?
            .is_empty()
    );
    // An administrator can recover a root with no remaining grants.
    ensure!(f.patch_grants(f.root, 1, json!({"owner":false})).await?.0 == StatusCode::OK);
    ensure!(f.list_grants(f.root, None, 10).await?.1["grants"] == json!([]));
    ensure!(f.patch_grants(f.root, 2, json!({"restored":true})).await?.0 == StatusCode::OK);
    f.close().await
}

#[tokio::test]
async fn grant_pages_preserve_opaque_cursors_and_objects_can_have_more_than_512_grants()
-> Result<()> {
    let f = Fixture::new().await?;
    let initial: BTreeMap<_, _> = (0..510)
        .map(|i| (format!("g:{i:04}"), true))
        .chain([("".to_owned(), true), ("\0/é".to_owned(), true)])
        .collect();
    ensure!(f.patch_grants(f.shared.id, 0, json!(initial)).await?.0 == StatusCode::OK);
    ensure!(
        f.patch_grants(f.shared.id, 1, json!({"last":true,"reader":false}))
            .await?
            .0
            == StatusCode::OK
    );
    let (status, first) = f.list_grants(f.shared.id, None, 1).await?;
    ensure!(
        status == StatusCode::OK && first["grants"] == json!([""]) && first["next_after"] == ""
    );
    let (_, second) = f.list_grants(f.shared.id, Some(""), 1).await?;
    ensure!(second["grants"] == json!(["\0/é"]) && second["next_after"] == "\0/é");
    let (_, rest) = f.list_grants(f.shared.id, Some("\0/é"), 1000).await?;
    ensure!(
        rest["grants"].as_array().context("grants")?.len() == 511 && rest["next_after"].is_null()
    );
    ensure!(rest["metadata_revision"] == 2);
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(view.granted_objects("", None, 10).await? == [f.shared.id]);
    ensure!(view.granted_objects("\0/é", None, 10).await? == [f.shared.id]);
    ensure!(view.granted_objects("\0/", None, 10).await?.is_empty());
    // Removing absent or reattaching present grants still counts as an accepted revisioned patch.
    ensure!(
        f.patch_grants(f.shared.id, 2, json!({"absent":false,"last":true}))
            .await?
            .1["metadata_revision"]
            == 3
    );
    drop(view);
    f.close().await
}

#[tokio::test]
async fn grant_patches_and_metadata_edits_share_revision_protection() -> Result<()> {
    let f = Fixture::new().await?;
    let (grant, metadata) = tokio::join!(
        f.patch_grants(f.shared.id, 0, json!({"new":true})),
        f.request(
            "/objects/update",
            json!({"object_id":f.shared.id.to_string(),"expected_metadata_revision":0,"mode":0})
        ),
    );
    let (grant, metadata) = (grant?, metadata?);
    ensure!(
        (grant.0 == StatusCode::OK && metadata.0 == StatusCode::CONFLICT)
            || (metadata.0 == StatusCode::OK && grant.0 == StatusCode::CONFLICT)
    );
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(view.changes(2, 10).await?.len() == 1);
    let object = view.object(f.shared.id).await?.context("object")?;
    ensure!(object.metadata_revision.get() == 1);
    let has_grant = view
        .grants(object.id, None, 10)
        .await?
        .contains(&"new".to_owned());
    ensure!(has_grant == (grant.0 == StatusCode::OK));
    ensure!(
        view.granted_objects("new", None, 10)
            .await?
            .contains(&object.id)
            == has_grant
    );
    drop(view);
    f.close().await
}
