use std::time::Duration;

use super::*;
use crate::model::Timestamp;

#[tokio::test]
async fn grants_union_across_ancestors_without_nearer_attachments_masking_access() -> Result<()> {
    let mut f = Fixture::new().await?;
    ensure!(
        f.patch_grants(f.private.id, 0, json!({"ancestor":true}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(
        f.patch_grants(f.files[0].id, 0, json!({"leaf":true}))
            .await?
            .0
            == StatusCode::OK
    );
    let (status, session) = call(
        &f.app,
        "POST",
        "/sessions",
        Some(&f.workspace_key),
        json!({"workspace_id":"w","grants":["unmatched","ancestor","leaf"]}),
    )
    .await?;
    ensure!(status == StatusCode::CREATED);
    let reader_key = f.key.clone();
    f.key = text(&session, "session_key")?.to_owned();
    for id in [f.shared.id, f.files[0].id, f.files[1].id] {
        ensure!(
            f.request("/objects/stat", json!({"object_id":id.to_string()}))
                .await?
                .0
                == StatusCode::OK
        );
    }
    // Removing an ancestor attachment leaves the session's direct leaf grant effective.
    ensure!(
        f.patch_grants(f.private.id, 1, json!({"ancestor":false}))
            .await?
            .0
            == StatusCode::OK
    );
    for (id, expected) in [
        (f.files[0].id, StatusCode::OK),
        (f.files[1].id, StatusCode::NOT_FOUND),
        (f.shared.id, StatusCode::NOT_FOUND),
    ] {
        ensure!(
            f.request("/objects/stat", json!({"object_id":id.to_string()}))
                .await?
                .0
                == expected
        );
    }
    ensure!(
        f.patch_grants(f.files[0].id, 1, json!({"leaf":false}))
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
        .0 == StatusCode::NOT_FOUND
    );
    // The original reader session still has independent access through the shared directory.
    ensure!(
        call(
            &f.app,
            "POST",
            "/objects/stat",
            Some(&reader_key),
            json!({"object_id":f.files[0].id.to_string()}),
        )
        .await?
        .0 == StatusCode::OK
    );
    f.close().await
}

#[tokio::test]
async fn moving_an_ancestor_reauthorizes_all_operations_without_rewriting_descendants() -> Result<()>
{
    let f = Fixture::new().await?;
    ensure!(
        f.patch_grants(f.private.id, 0, json!({"reader":true}))
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
    let grants = ["reader".to_owned()].into();
    let in_flight = NamespaceRead::new(&f.storage, &f.workspace, &grants).await?;
    let (status, page) = f
        .request(
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"limit":1}),
        )
        .await?;
    ensure!(status == StatusCode::OK && page["next_after"] == "A.txt");

    let owner_key = f.session_key(&["owner"]).await?;
    let (status, moved) = call(
        &f.app,
        "POST",
        "/objects/rename",
        Some(&owner_key),
        json!({"object_id":f.shared.id.to_string(),"expected_metadata_revision":1,
            "parent_id":f.root.to_string(),"name":"shared-subtree"}),
    )
    .await?;
    ensure!(status == StatusCode::OK && moved["metadata_revision"] == 2);
    let scoped = f.storage.workspace(&f.workspace)?;
    let sequence = scoped
        .read_view()
        .await?
        .changes(0, 100)
        .await?
        .last()
        .context("event")?
        .sequence;
    for (route, body) in [
        (
            "/objects/stat",
            json!({"object_id":f.files[0].id.to_string()}),
        ),
        (
            "/objects/lookup",
            json!({"parent_id":f.shared.id.to_string(),"name":"A.txt"}),
        ),
        (
            "/objects/list",
            json!({"directory_id":f.shared.id.to_string(),"after":page["next_after"]}),
        ),
        (
            "/objects/mkdir",
            json!({"parent_id":f.shared.id.to_string(),"name":"A.txt"}),
        ),
        (
            "/objects/update",
            json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":999,"mode":0}),
        ),
        (
            "/objects/rename",
            json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,
                "parent_id":f.shared.id.to_string(),"name":"changed"}),
        ),
        (
            "/objects/unlink",
            json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":0}),
        ),
        (
            "/objects/rmdir",
            json!({"object_id":f.shared.id.to_string(),"expected_metadata_revision":2}),
        ),
    ] {
        // Authorization precedes state-dependent errors, including conflicts and collisions.
        ensure!(
            f.request(route, body).await?.0 == StatusCode::NOT_FOUND,
            "{route}"
        );
    }
    ensure!(in_flight.stat(f.files[0].id).await? == f.files[0]);
    let current = scoped.read_view().await?;
    for file in &f.files {
        ensure!(current.object(file.id).await?.as_ref() == Some(file));
        ensure!(current.grants(file.id, None, 10).await?.is_empty());
    }
    ensure!(current.changes(sequence, 10).await?.is_empty());
    drop(current);
    drop(in_flight);
    f.close().await
}

#[tokio::test]
async fn queued_mutations_authorize_after_revocation_and_leave_no_effects() -> Result<()> {
    let f = Fixture::new().await?;
    let (status, empty) = f
        .request(
            "/objects/mkdir",
            json!({"parent_id":f.shared.id.to_string(),"name":"empty"}),
        )
        .await?;
    ensure!(status == StatusCode::CREATED);
    let scoped = f.storage.workspace(&f.workspace)?;
    let writer = scoped.begin_metadata_write().await;
    let view = writer.read_view().await?;
    let mut revoked = view
        .object(f.shared.id)
        .await?
        .context("shared directory")?;
    revoked.metadata_revision = revoked.metadata_revision.next()?;
    revoked.posix.ctime = Timestamp::now()?;

    let sequence = tokio::time::timeout(Duration::from_secs(5), async {
        let mut mkdir = Box::pin(f.request(
            "/objects/mkdir",
            json!({"parent_id":f.shared.id.to_string(),"name":"queued"}),
        ));
        let mut update = Box::pin(f.request(
            "/objects/update",
            json!({"object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,"mode":0}),
        ));
        let mut rename = Box::pin(f.request(
            "/objects/rename",
            json!({
                "object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,
                "parent_id":f.shared.id.to_string(),"name":"renamed",
            }),
        ));
        let mut unlink = Box::pin(f.request(
            "/objects/unlink",
            json!({
                "object_id":f.files[1].id.to_string(),"expected_metadata_revision":0,
            }),
        ));
        let mut rmdir = Box::pin(f.request(
            "/objects/rmdir",
            json!({
                "object_id":empty["object_id"],"expected_metadata_revision":0,
            }),
        ));
        // Start the HTTP requests while publication is locked; none may finish yet.
        ensure!(futures::poll!(mkdir.as_mut()).is_pending());
        ensure!(futures::poll!(update.as_mut()).is_pending());
        ensure!(futures::poll!(rename.as_mut()).is_pending());
        ensure!(futures::poll!(unlink.as_mut()).is_pending());
        ensure!(futures::poll!(rmdir.as_mut()).is_pending());
        let sequence = writer
            .commit(vec![
                MetadataMutation::PutObject(revoked.clone().into()),
                MetadataMutation::SetGrant {
                    object_id: f.shared.id,
                    grant: "reader".to_owned(),
                    attached: false,
                },
            ])
            .await?;
        ensure!(mkdir.await?.0 == StatusCode::NOT_FOUND);
        ensure!(update.await?.0 == StatusCode::NOT_FOUND);
        ensure!(rename.await?.0 == StatusCode::NOT_FOUND);
        ensure!(unlink.await?.0 == StatusCode::NOT_FOUND);
        ensure!(rmdir.await?.0 == StatusCode::NOT_FOUND);
        Ok::<_, anyhow::Error>(sequence)
    })
    .await??;

    let current = scoped.read_view().await?;
    ensure!(
        current
            .child(f.shared.id, &"queued".parse()?)
            .await?
            .is_none()
    );
    ensure!(current.object(f.shared.id).await? == Some(revoked));
    ensure!(current.object(f.files[0].id).await? == Some(f.files[0].clone()));
    ensure!(current.object(f.files[1].id).await? == Some(f.files[1].clone()));
    ensure!(
        current
            .object(text(&empty, "object_id")?.parse()?)
            .await?
            .is_some()
    );
    ensure!(current.grants(f.shared.id, None, 10).await?.is_empty());
    ensure!(
        current
            .granted_objects("reader", None, 10)
            .await?
            .is_empty()
    );
    ensure!(current.changes(sequence, 10).await?.is_empty());
    drop(current);
    drop(view);
    f.close().await
}
