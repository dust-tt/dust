use super::*;

#[tokio::test]
async fn mkdir_and_updates_publish_attributes_parent_changes_and_events() -> Result<()> {
    let f = Fixture::new().await?;
    let before = f.storage.workspace(&f.workspace)?.read_view().await?;
    let parent = before.object(f.shared.id).await?.context("parent")?;
    let (status, created) = f
        .request(
            "/objects/mkdir",
            json!({
                "parent_id":f.shared.id.to_string(), "name":"new/invalid",
            }),
        )
        .await?;
    ensure!(status == StatusCode::BAD_REQUEST && created["error"]["code"] == "invalid_input");
    let (status, created) = f
        .request(
            "/objects/mkdir",
            json!({
                "parent_id":f.shared.id.to_string(), "name":"new directory",
                "xattrs":{"user.binary":"AID/", "user.empty":""},
            }),
        )
        .await?;
    ensure!(status == StatusCode::CREATED && created["mode"] == 0o755);
    ensure!(created["atime"] == created["mtime"] && created["mtime"] == created["ctime"]);
    ensure!(created["ctime"]["seconds"].as_i64().context("ctime")? > 0);
    let id = text(&created, "object_id")?.parse()?;
    let after = f.storage.workspace(&f.workspace)?.read_view().await?;
    let object = after.object(id).await?.context("created object")?;
    ensure!(object.parent.as_ref().context("parent")?.parent_id == parent.id);
    ensure!(after.child(parent.id, &"new directory".parse()?).await? == Some(id));
    ensure!(after.grants(id, None, 10).await?.is_empty());
    let changed_parent = after.object(parent.id).await?.context("parent")?;
    ensure!(changed_parent.metadata_revision == parent.metadata_revision.next()?);
    ensure!(
        changed_parent.posix.mtime == object.posix.ctime
            && changed_parent.posix.ctime == object.posix.ctime
    );
    ensure!(changed_parent.posix.atime == parent.posix.atime);
    let events = after.changes(2, 10).await?;
    ensure!(events.len() == 1 && events[0].object_ids.len() == 2);
    ensure!(events[0].object_ids.contains(&id) && events[0].object_ids.contains(&parent.id));
    ensure!(
        before
            .child(parent.id, &"new directory".parse()?)
            .await?
            .is_none()
    );
    let (status, updated) = f
        .request(
            "/objects/update",
            json!({
                "object_id":id.to_string(), "expected_metadata_revision":0,
                "mime_type":"application/x-directory", "mode":0,
                "atime":{"seconds":-1,"nanoseconds":999999999},
                "mtime":{"seconds":42,"nanoseconds":123},
                "xattrs":{"user.binary":null, "user.added":"/w=="},
            }),
        )
        .await?;
    ensure!(status == StatusCode::OK && updated["metadata_revision"] == 1 && updated["mode"] == 0);
    ensure!(updated["mime_type"] == "application/x-directory" && updated["atime"]["seconds"] == -1);
    ensure!(updated["xattrs"] == json!({"user.empty":"", "user.added":"/w=="}));
    // Modes do not affect grant authorization, and reads do not update access times.
    ensure!(
        f.request("/objects/stat", json!({"object_id":id.to_string()}))
            .await?
            .1
            == updated
    );
    let (_, edited_again) = f
        .request(
            "/objects/update",
            json!({
                "object_id":id.to_string(), "expected_metadata_revision":1, "mode":0o711,
            }),
        )
        .await?;
    ensure!(edited_again["atime"] == updated["atime"] && edited_again["mtime"] == updated["mtime"]);
    // File metadata edits keep the immutable content reference and bytes.
    let file = &f.files[0];
    let (status, updated_file) = f
        .request(
            "/objects/update",
            json!({
                "object_id":file.id.to_string(), "expected_metadata_revision":0, "mode":0o755,
            }),
        )
        .await?;
    ensure!(status == StatusCode::OK && updated_file["size_bytes"] == 2);
    let stored = f
        .storage
        .workspace(&f.workspace)?
        .read_view()
        .await?
        .object(file.id)
        .await?
        .context("file")?;
    ensure!(stored.kind == file.kind && stored.parent == file.parent);
    if let ObjectKind::File(content) = &stored.kind {
        ensure!(
            f.storage
                .workspace(&f.workspace)?
                .read_blob(file.id, content.version)
                .await?
                == b"hi"[..]
        );
    }
    drop(before);
    drop(after);
    f.close().await
}

#[tokio::test]
async fn competing_creations_and_revision_updates_cannot_overwrite_each_other() -> Result<()> {
    let f = Fixture::new().await?;
    let create = json!({"parent_id":f.shared.id.to_string(),"name":"competing"});
    let (first, second) = tokio::join!(
        f.request("/objects/mkdir", create.clone()),
        f.request("/objects/mkdir", create)
    );
    let (first, second) = (first?, second?);
    let (winner, loser) = if first.0 == StatusCode::CREATED {
        (first, second)
    } else {
        (second, first)
    };
    ensure!(winner.0 == StatusCode::CREATED && loser.0 == StatusCode::CONFLICT);
    ensure!(loser.1["error"]["code"] == "already_exists");
    let id = &winner.1["object_id"];
    let (first, second) = tokio::join!(
        f.request(
            "/objects/update",
            json!({"object_id":id,"expected_metadata_revision":0,"mode":0o700})
        ),
        f.request(
            "/objects/update",
            json!({"object_id":id,"expected_metadata_revision":0,"mode":0o750})
        ),
    );
    let (first, second) = (first?, second?);
    let (winner, loser) = if first.0 == StatusCode::OK {
        (first, second)
    } else {
        (second, first)
    };
    ensure!(winner.0 == StatusCode::OK && loser.0 == StatusCode::CONFLICT);
    ensure!(loser.1["error"]["code"] == "conflict");
    ensure!(f.request("/objects/stat", json!({"object_id":id})).await?.1 == winner.1);
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(view.changes(2, 10).await?.len() == 2);
    ensure!(view.children(f.shared.id, None, 10).await?.len() == 4);
    drop(view);
    f.close().await
}

#[tokio::test]
async fn invalid_metadata_and_exhausted_revisions_leave_state_unchanged() -> Result<()> {
    let f = Fixture::new().await?;
    let base = json!({"object_id":f.shared.id.to_string(),"expected_metadata_revision":0});
    let before = f
        .request(
            "/objects/stat",
            json!({"object_id":f.shared.id.to_string()}),
        )
        .await?
        .1;
    for (fields, code) in [
        (json!({}), "invalid_input"),
        (json!({"mode":0o4755}), "unsupported"),
        (json!({"mime_type":"invalid"}), "invalid_input"),
        (
            json!({"ctime":{"seconds":1,"nanoseconds":0}}),
            "invalid_input",
        ),
        (
            json!({"mtime":{"seconds":1,"nanoseconds":1000000000}}),
            "invalid_input",
        ),
        (
            json!({"atime":{"seconds":1,"nanoseconds":-1}}),
            "invalid_input",
        ),
        (json!({"xattrs":{"":"AA=="}}), "invalid_input"),
        (json!({"xattrs":{"user.\u{0000}":null}}), "invalid_input"),
        (json!({"xattrs":{"user.bad":"AA"}}), "invalid_input"),
        (json!({"grants":["reader"]}), "invalid_input"),
        (
            json!({"parent_id":f.private.id.to_string()}),
            "invalid_input",
        ),
        (json!({"size_bytes":0}), "invalid_input"),
        (
            json!({"xattrs":{"user.large":STANDARD.encode(vec![0; 32768])}}),
            "capacity_exhausted",
        ),
    ] {
        let mut body = base.clone();
        body.as_object_mut()
            .context("body")?
            .extend(fields.as_object().context("fields")?.clone());
        let (_, error) = f.request("/objects/update", body).await?;
        ensure!(
            error["error"]["code"] == code,
            "unexpected response: {error}"
        );
    }
    ensure!(
        f.request(
            "/objects/stat",
            json!({"object_id":f.shared.id.to_string()})
        )
        .await?
        .1 == before
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
    // The persisted total, rather than each individual patch, bounds xattr growth.
    for (revision, key, size, status) in [
        (0, "user.a", 20_000, StatusCode::OK),
        (1, "user.b", 20_000, StatusCode::INSUFFICIENT_STORAGE),
    ] {
        ensure!(
            f.request(
                "/objects/update",
                json!({
                    "object_id":f.shared.id.to_string(), "expected_metadata_revision":revision,
                    "xattrs":{key:STANDARD.encode(vec![0;size])},
                })
            )
            .await?
            .0 == status
        );
    }
    let mut exhausted = f.shared.clone();
    exhausted.metadata_revision = MetadataRevision::from_u64(u64::MAX);
    f.storage
        .workspace(&f.workspace)?
        .commit(MetadataBatch {
            mutations: vec![MetadataMutation::PutObject(exhausted.into())],
            uploads: vec![],
        })
        .await?;
    ensure!(
        f.request(
            "/objects/mkdir",
            json!({"parent_id":f.shared.id.to_string(),"name":"overflow"})
        )
        .await?
        .0 == StatusCode::INSUFFICIENT_STORAGE
    );
    ensure!(f.request("/objects/update", json!({"object_id":f.shared.id.to_string(),"expected_metadata_revision":u64::MAX,"mode":0})).await?.0 == StatusCode::INSUFFICIENT_STORAGE);
    ensure!(
        f.storage
            .workspace(&f.workspace)?
            .read_view()
            .await?
            .child(f.shared.id, &"overflow".parse()?)
            .await?
            .is_none()
    );
    f.close().await
}

#[tokio::test]
async fn mutations_require_session_scope_and_current_inherited_grants() -> Result<()> {
    let f = Fixture::new().await?;
    let (_, other_workspace) = call(
        &f.app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({"workspace_id":"other","root_grants":["reader"]}),
    )
    .await?;
    let (_, other_session) = call(
        &f.app,
        "POST",
        "/sessions",
        Some(text(&other_workspace, "workspace_key")?),
        json!({"workspace_id":"other","grants":["reader"]}),
    )
    .await?;
    for (route, body) in [
        (
            "/objects/mkdir",
            json!({"parent_id":f.shared.id.to_string(),"name":"forbidden"}),
        ),
        (
            "/objects/update",
            json!({"object_id":f.shared.id.to_string(),"expected_metadata_revision":0,"mode":0}),
        ),
    ] {
        for key in [None, Some(SERVER_KEY), Some(f.workspace_key.as_str())] {
            ensure!(
                call(&f.app, "POST", route, key, body.clone()).await?.0 == StatusCode::UNAUTHORIZED
            );
        }
        ensure!(
            call(
                &f.app,
                "POST",
                route,
                Some(text(&other_session, "session_key")?),
                body
            )
            .await?
            .0 == StatusCode::NOT_FOUND
        );
    }
    for id in [f.private.id, f.root, ObjectId::generate()] {
        ensure!(
            f.request(
                "/objects/mkdir",
                json!({"parent_id":id.to_string(),"name":"forbidden"})
            )
            .await?
            .0 == StatusCode::NOT_FOUND
        );
        ensure!(
            f.request(
                "/objects/update",
                json!({"object_id":id.to_string(),"expected_metadata_revision":0,"mode":0})
            )
            .await?
            .0 == StatusCode::NOT_FOUND
        );
    }
    ensure!(
        f.request(
            "/objects/mkdir",
            json!({"parent_id":f.files[0].id.to_string(),"name":"invalid"})
        )
        .await?
        .1["error"]["code"]
            == "not_directory"
    );
    f.storage
        .workspace(&f.workspace)?
        .commit(MetadataBatch {
            mutations: vec![MetadataMutation::SetGrant {
                object_id: f.shared.id,
                grant: "reader".to_owned(),
                attached: false,
            }],
            uploads: vec![],
        })
        .await?;
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
        f.storage
            .workspace(&f.workspace)?
            .read_view()
            .await?
            .changes(3, 10)
            .await?
            .is_empty()
    );
    f.close().await
}
