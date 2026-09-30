use super::*;

impl Fixture {
    async fn rename_entry(
        &self,
        object: ObjectId,
        revision: u64,
        parent: ObjectId,
        name: &str,
        replace: bool,
    ) -> Result<(StatusCode, Value)> {
        self.request(
            "/objects/rename",
            json!({
                "object_id":object.to_string(), "expected_metadata_revision":revision,
                "parent_id":parent.to_string(), "name":name, "replace":replace,
            }),
        )
        .await
    }

    async fn remove_entry(
        &self,
        route: &str,
        object: ObjectId,
        revision: u64,
    ) -> Result<(StatusCode, Value)> {
        self.request(
            route,
            json!({
                "object_id":object.to_string(), "expected_metadata_revision":revision,
            }),
        )
        .await
    }

    async fn mkdir_id(&self, parent: ObjectId, name: &str) -> Result<ObjectId> {
        let (status, body) = self
            .request(
                "/objects/mkdir",
                json!({
                    "parent_id":parent.to_string(), "name":name,
                }),
            )
            .await?;
        ensure!(status == StatusCode::CREATED);
        text(&body, "object_id")?.parse().map_err(Into::into)
    }
}

#[tokio::test]
async fn rename_preserves_identity_content_grants_and_updates_each_parent_once() -> Result<()> {
    let f = Fixture::new().await?;
    let file = &f.files[0];
    ensure!(f.patch_grants(file.id, 0, json!({"direct":true})).await?.0 == StatusCode::OK);
    ensure!(
        f.patch_grants(f.elsewhere.id, 0, json!({"reader":true}))
            .await?
            .0
            == StatusCode::OK
    );
    let old = f.storage.workspace(&f.workspace)?.read_view().await?;
    let (status, renamed) = f
        .rename_entry(file.id, 1, f.shared.id, "renamed", false)
        .await?;
    ensure!(status == StatusCode::OK && renamed["metadata_revision"] == 2);
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    let changed = view.object(file.id).await?.context("renamed file")?;
    ensure!(
        changed.kind == file.kind
            && changed.xattrs == file.xattrs
            && changed.mime_type == file.mime_type
    );
    ensure!(changed.posix.atime == file.posix.atime && changed.posix.mtime == file.posix.mtime);
    ensure!(changed.posix.ctime != file.posix.ctime);
    let parent = view.object(f.shared.id).await?.context("parent")?;
    ensure!(parent.metadata_revision.get() == 1 && parent.posix.mtime == changed.posix.ctime);
    ensure!(
        parent.posix.ctime == changed.posix.ctime && parent.posix.atime == f.shared.posix.atime
    );
    ensure!(view.child(f.shared.id, &"A.txt".parse()?).await?.is_none());
    ensure!(view.child(f.shared.id, &"renamed".parse()?).await? == Some(file.id));
    ensure!(old.child(f.shared.id, &"A.txt".parse()?).await? == Some(file.id));
    let sequence = view
        .changes(0, 100)
        .await?
        .last()
        .context("event")?
        .sequence;
    ensure!(
        f.rename_entry(file.id, 2, f.shared.id, "renamed", true)
            .await?
            .1
            == renamed
    );
    ensure!(
        f.storage
            .workspace(&f.workspace)?
            .read_view()
            .await?
            .changes(sequence, 10)
            .await?
            .is_empty()
    );
    let (status, moved) = f
        .rename_entry(file.id, 2, f.elsewhere.id, "moved", false)
        .await?;
    ensure!(status == StatusCode::OK && moved["object_id"] == file.id.to_string());
    let current = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(
        current
            .child(f.shared.id, &"renamed".parse()?)
            .await?
            .is_none()
    );
    ensure!(current.child(f.elsewhere.id, &"moved".parse()?).await? == Some(file.id));
    for id in [f.shared.id, f.elsewhere.id] {
        ensure!(
            current
                .object(id)
                .await?
                .context("parent")?
                .metadata_revision
                .get()
                == 2
        );
    }
    ensure!(current.grants(file.id, None, 10).await? == ["direct"]);
    ensure!(current.granted_objects("direct", None, 10).await? == [file.id]);
    let events = current.changes(sequence, 10).await?;
    ensure!(events.len() == 1 && events[0].object_ids.len() == 3);
    for id in [file.id, f.shared.id, f.elsewhere.id] {
        ensure!(events[0].object_ids.contains(&id));
    }
    if let ObjectKind::File(content) = &file.kind {
        ensure!(
            f.storage
                .workspace(&f.workspace)?
                .read_blob(file.id, content.version)
                .await?
                == b"hi"[..]
        );
    }
    drop(current);
    drop(view);
    drop(old);
    f.close().await
}

#[tokio::test]
async fn replacement_and_unlink_remove_all_grant_indexes_but_retain_blobs() -> Result<()> {
    let f = Fixture::new().await?;
    // More than one scan page, including an empty grant, exercises complete index cleanup.
    let deleted_grants: Vec<_> = std::iter::once(String::new())
        .chain((0..1001).map(|i| format!("deleted/{i:04}")))
        .collect();
    f.storage
        .workspace(&f.workspace)?
        .commit(MetadataBatch {
            mutations: deleted_grants
                .iter()
                .map(|grant| MetadataMutation::SetGrant {
                    object_id: f.files[1].id,
                    grant: grant.clone(),
                    attached: true,
                })
                .collect(),
            uploads: vec![],
        })
        .await?;
    let before = f.storage.workspace(&f.workspace)?.read_view().await?;
    let (status, replaced) = f
        .rename_entry(f.files[0].id, 0, f.shared.id, "a b%?.txt", true)
        .await?;
    ensure!(status == StatusCode::OK && replaced["metadata_revision"] == 1);
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(view.object(f.files[1].id).await?.is_none());
    ensure!(view.child(f.shared.id, &"a b%?.txt".parse()?).await? == Some(f.files[0].id));
    ensure!(view.grants(f.files[1].id, None, 1000).await?.is_empty());
    for grant in &deleted_grants {
        ensure!(view.granted_objects(grant, None, 1).await?.is_empty());
    }
    ensure!(before.object(f.files[1].id).await?.is_some());
    ensure!(
        f.patch_grants(f.files[0].id, 1, json!({"removed":true}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(
        f.remove_entry("/objects/unlink", f.files[0].id, 2).await?
            == (StatusCode::NO_CONTENT, Value::Null)
    );
    let after = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(after.object(f.files[0].id).await?.is_none());
    ensure!(
        after
            .child(f.shared.id, &"a b%?.txt".parse()?)
            .await?
            .is_none()
    );
    ensure!(after.grants(f.files[0].id, None, 10).await?.is_empty());
    ensure!(after.granted_objects("removed", None, 10).await?.is_empty());
    ensure!(
        after
            .object(f.shared.id)
            .await?
            .context("parent")?
            .metadata_revision
            .get()
            == 2
    );
    let events = after.changes(3, 10).await?;
    ensure!(
        events.len() == 3 && events[0].object_ids.len() == 3 && events[2].object_ids.len() == 2
    );
    for id in [f.files[0].id, f.files[1].id, f.shared.id] {
        ensure!(events[0].object_ids.contains(&id));
    }
    for file in &f.files[..2] {
        ensure!(
            f.request("/objects/stat", json!({"object_id":file.id.to_string()}))
                .await?
                .0
                == StatusCode::NOT_FOUND
        );
        if let ObjectKind::File(content) = &file.kind {
            ensure!(
                f.storage
                    .workspace(&f.workspace)?
                    .read_blob(file.id, content.version)
                    .await?
                    == b"hi"[..]
            );
        }
    }
    drop(after);
    drop(view);
    drop(before);
    f.close().await
}

#[tokio::test]
async fn directory_replacement_and_removal_are_empty_only_and_atomic() -> Result<()> {
    let f = Fixture::new().await?;
    let source = f.mkdir_id(f.shared.id, "source").await?;
    let child = f.mkdir_id(source, "child").await?;
    let target = f.mkdir_id(f.shared.id, "target").await?;
    ensure!(f.patch_grants(target, 0, json!({"target":true})).await?.0 == StatusCode::OK);
    let (status, _) = f
        .rename_entry(source, 1, f.shared.id, "target", true)
        .await?;
    ensure!(status == StatusCode::OK);
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(view.object(target).await?.is_none());
    ensure!(view.grants(target, None, 10).await?.is_empty());
    ensure!(view.granted_objects("target", None, 10).await?.is_empty());
    ensure!(view.child(source, &"child".parse()?).await? == Some(child));
    ensure!(f.remove_entry("/objects/rmdir", source, 2).await?.1["error"]["code"] == "not_empty");
    ensure!(f.remove_entry("/objects/rmdir", child, 0).await?.0 == StatusCode::NO_CONTENT);
    ensure!(f.remove_entry("/objects/rmdir", source, 2).await?.1["error"]["code"] == "conflict");
    ensure!(f.remove_entry("/objects/rmdir", source, 3).await?.0 == StatusCode::NO_CONTENT);
    let current = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(current.object(source).await?.is_none() && current.object(child).await?.is_none());
    ensure!(
        current
            .child(f.shared.id, &"target".parse()?)
            .await?
            .is_none()
    );
    ensure!(view.object(source).await?.is_some() && view.object(child).await?.is_some());
    drop(current);
    drop(view);
    f.close().await
}

#[tokio::test]
async fn invalid_entry_mutations_leave_namespace_and_events_unchanged() -> Result<()> {
    let mut f = Fixture::new().await?;
    f.key = f.session_key(&["owner"]).await?;
    let empty = f.mkdir_id(f.shared.id, "empty").await?;
    let before = f.storage.workspace(&f.workspace)?.read_view().await?;
    let sequence = before
        .changes(0, 100)
        .await?
        .last()
        .context("event")?
        .sequence;
    for (id, revision, parent, name, replace, code) in [
        (
            f.files[0].id,
            0,
            f.shared.id,
            "a b%?.txt",
            false,
            "already_exists",
        ),
        (f.files[0].id, 999, f.shared.id, "A.txt", false, "conflict"),
        (f.shared.id, 1, f.shared.id, "self", false, "invalid_input"),
        (f.shared.id, 1, empty, "descendant", false, "invalid_input"),
        (f.root, 1, f.shared.id, "root", false, "forbidden"),
        (
            f.files[0].id,
            0,
            f.files[1].id,
            "file-parent",
            false,
            "not_directory",
        ),
        (f.files[0].id, 0, f.shared.id, "empty", true, "is_directory"),
        (empty, 0, f.shared.id, "A.txt", true, "not_directory"),
        (empty, 0, f.private.id, "shared-subtree", true, "not_empty"),
        (
            f.files[0].id,
            0,
            f.shared.id,
            "../bad",
            false,
            "invalid_input",
        ),
    ] {
        let (_, result) = f.rename_entry(id, revision, parent, name, replace).await?;
        ensure!(result["error"]["code"] == code, "rename {name}: {result}");
    }
    for (route, id, revision, code) in [
        ("/objects/unlink", f.shared.id, 1, "is_directory"),
        ("/objects/rmdir", f.files[0].id, 0, "not_directory"),
        ("/objects/rmdir", f.shared.id, 1, "not_empty"),
        ("/objects/unlink", f.files[0].id, 999, "conflict"),
        ("/objects/rmdir", f.root, 1, "forbidden"),
    ] {
        ensure!(f.remove_entry(route, id, revision).await?.1["error"]["code"] == code);
    }
    let after = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(after.changes(sequence, 10).await?.is_empty());
    for id in [
        f.root,
        f.private.id,
        f.shared.id,
        empty,
        f.files[0].id,
        f.files[1].id,
    ] {
        ensure!(after.object(id).await? == before.object(id).await?);
        ensure!(after.children(id, None, 100).await? == before.children(id, None, 100).await?);
    }
    drop(after);
    drop(before);
    f.close().await
}

#[tokio::test]
async fn entry_mutations_require_current_parent_access_session_credentials_and_workspace()
-> Result<()> {
    let f = Fixture::new().await?;
    let (_, other) = call(
        &f.app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({"workspace_id":"other","root_grants":["reader"]}),
    )
    .await?;
    let (_, session) = call(
        &f.app,
        "POST",
        "/sessions",
        Some(text(&other, "workspace_key")?),
        json!({"workspace_id":"other","grants":["reader"]}),
    )
    .await?;
    let other_key = text(&session, "session_key")?;
    for (route, body) in [
        (
            "/objects/rename",
            json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,"parent_id":f.shared.id.to_string(),"name":"renamed"}),
        ),
        (
            "/objects/unlink",
            json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":0}),
        ),
        (
            "/objects/rmdir",
            json!({"object_id":f.shared.id.to_string(),"expected_metadata_revision":0}),
        ),
    ] {
        for key in [None, Some(SERVER_KEY), Some(f.workspace_key.as_str())] {
            ensure!(
                call(&f.app, "POST", route, key, body.clone()).await?.0 == StatusCode::UNAUTHORIZED
            );
        }
        ensure!(
            call(&f.app, "POST", route, Some(other_key), body.clone())
                .await?
                .0
                == StatusCode::NOT_FOUND
        );
        let mut invalid = body.clone();
        invalid["workspace_id"] = json!("w");
        ensure!(f.request(route, invalid).await?.0 == StatusCode::BAD_REQUEST);
    }
    // The shared directory itself is visible, but its private containing directory is not.
    ensure!(
        f.rename_entry(f.shared.id, 0, f.shared.id, "renamed", false)
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    ensure!(f.remove_entry("/objects/rmdir", f.shared.id, 0).await?.0 == StatusCode::NOT_FOUND);
    ensure!(
        f.rename_entry(f.files[0].id, 999, f.elsewhere.id, "hidden", false)
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    ensure!(
        f.rename_entry(
            f.files[0].id,
            0,
            text(&other, "root_id")?.parse()?,
            "foreign",
            false
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
        f.patch_grants(f.shared.id, 0, json!({"reader":false}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(f.remove_entry("/objects/unlink", f.files[0].id, 1).await?.0 == StatusCode::NOT_FOUND);
    ensure!(
        f.rename_entry(f.files[0].id, 1, f.shared.id, "hidden", false)
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    f.close().await
}

#[tokio::test]
async fn corrupt_links_and_destination_cycles_fail_closed_even_with_direct_grants() -> Result<()> {
    let f = Fixture::new().await?;
    let source = f.mkdir_id(f.shared.id, "source").await?;
    let mut cyclic = f.elsewhere.clone();
    cyclic.parent = Some(ParentLink {
        parent_id: cyclic.id,
        name: "cycle".parse()?,
    });
    let mut batch = MetadataBatch::default();
    add_object(&mut batch, &cyclic)?;
    batch.mutations.extend([
        MetadataMutation::DeleteChild {
            parent_id: f.private.id,
            name: "elsewhere".parse()?,
        },
        MetadataMutation::SetGrant {
            object_id: cyclic.id,
            grant: "reader".to_owned(),
            attached: true,
        },
    ]);
    let scoped = f.storage.workspace(&f.workspace)?;
    let sequence = scoped.commit(batch).await?;
    let (status, result) = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        f.rename_entry(source, 0, cyclic.id, "moved", false),
    )
    .await??;
    ensure!(status == StatusCode::SERVICE_UNAVAILABLE && result["error"]["code"] == "unavailable");
    ensure!(
        scoped
            .read_view()
            .await?
            .changes(sequence, 10)
            .await?
            .is_empty()
    );
    let sequence = scoped
        .commit(MetadataBatch {
            mutations: vec![
                MetadataMutation::DeleteChild {
                    parent_id: f.shared.id,
                    name: "source".parse()?,
                },
                MetadataMutation::SetGrant {
                    object_id: source,
                    grant: "reader".to_owned(),
                    attached: true,
                },
            ],
            uploads: vec![],
        })
        .await?;
    ensure!(
        f.remove_entry("/objects/rmdir", source, 0).await?.0 == StatusCode::SERVICE_UNAVAILABLE
    );
    ensure!(
        scoped
            .read_view()
            .await?
            .changes(sequence, 10)
            .await?
            .is_empty()
    );
    f.close().await
}

#[tokio::test]
async fn competing_renames_and_directory_creation_cannot_publish_inconsistent_state() -> Result<()>
{
    let f = Fixture::new().await?;
    let (a, b) = tokio::join!(
        f.rename_entry(f.files[0].id, 0, f.shared.id, "same", false),
        f.rename_entry(f.files[1].id, 0, f.shared.id, "same", false),
    );
    let (a, b) = (a?, b?);
    ensure!([a.0, b.0].contains(&StatusCode::OK) && [a.0, b.0].contains(&StatusCode::CONFLICT));
    let empty = f.mkdir_id(f.shared.id, "racing").await?;
    let (removed, created) = tokio::join!(
        f.remove_entry("/objects/rmdir", empty, 0),
        f.request(
            "/objects/mkdir",
            json!({"parent_id":empty.to_string(),"name":"child"})
        ),
    );
    let (removed, created) = (removed?, created?);
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    if removed.0 == StatusCode::NO_CONTENT {
        ensure!(created.0 == StatusCode::NOT_FOUND && view.object(empty).await?.is_none());
        ensure!(view.children(empty, None, 10).await?.is_empty());
    } else {
        ensure!(removed.0 == StatusCode::CONFLICT && created.0 == StatusCode::CREATED);
        ensure!(
            view.object(empty).await?.is_some() && view.children(empty, None, 10).await?.len() == 1
        );
    }
    drop(view);
    f.close().await
}
