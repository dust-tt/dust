use std::time::Duration;

use super::*;

mod load;

#[tokio::test]
async fn a_blocked_file_does_not_block_neighbors_and_rechecks_ancestor_grants() -> Result<()> {
    for revoke in [false, true] {
        let f = Fixture::new().await?;
        let scoped = f.storage.workspace(&f.workspace)?;
        let held = scoped.lock_objects(&[f.files[0].id]).await?;
        let mut waiting = Box::pin(f.request(
            "/objects/update",
            json!({
                "object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,"mode":0,
            }),
        ));
        ensure!(futures::poll!(waiting.as_mut()).is_pending());
        let (status, _) = tokio::time::timeout(
            Duration::from_secs(5),
            f.request(
                "/objects/update",
                json!({
                    "object_id":f.files[1].id.to_string(),"expected_metadata_revision":0,"mode":0,
                }),
            ),
        )
        .await??;
        ensure!(status == StatusCode::OK);
        if revoke {
            ensure!(
                tokio::time::timeout(
                    Duration::from_secs(5),
                    f.patch_grants(f.shared.id, 0, json!({"reader":false}))
                )
                .await??
                .0 == StatusCode::OK
            );
        }
        drop(held);
        let (status, _) = tokio::time::timeout(Duration::from_secs(5), waiting).await??;
        ensure!(
            status
                == if revoke {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::OK
                }
        );
        let view = scoped.read_view().await?;
        ensure!(
            view.object(f.files[0].id)
                .await?
                .context("file")?
                .metadata_revision
                .get()
                == u64::from(!revoke)
        );
        drop(view);
        f.close().await?;
    }
    Ok(())
}

#[tokio::test]
async fn a_retried_replacement_discovers_and_locks_the_new_target() -> Result<()> {
    let f = Fixture::new().await?;
    let scoped = f.storage.workspace(&f.workspace)?;
    let old_target = scoped.lock_objects(&[f.files[1].id]).await?;
    let new_target = scoped.lock_objects(&[f.files[2].id]).await?;
    let mut rename = Box::pin(f.request(
        "/objects/rename",
        json!({
            "object_id":f.files[0].id.to_string(),"expected_metadata_revision":0,
            "parent_id":f.shared.id.to_string(),"name":"a b%?.txt","replace":true,
        }),
    ));
    ensure!(futures::poll!(rename.as_mut()).is_pending());
    // A trusted competing commit changes the destination while this request waits for its locks.
    let mut old = f.files[1].clone();
    old.parent = Some(ParentLink {
        parent_id: f.shared.id,
        name: "preserved".parse()?,
    });
    old.metadata_revision = old.metadata_revision.next()?;
    let mut new = f.files[2].clone();
    new.parent = Some(ParentLink {
        parent_id: f.shared.id,
        name: "a b%?.txt".parse()?,
    });
    new.metadata_revision = new.metadata_revision.next()?;
    let mut parent = f.shared.clone();
    parent.metadata_revision = parent.metadata_revision.next()?;
    let mut batch = MetadataBatch::default();
    add_object(&mut batch, &old)?;
    add_object(&mut batch, &new)?;
    batch.mutations.extend([
        MetadataMutation::DeleteChild {
            parent_id: f.shared.id,
            name: "é.txt".parse()?,
        },
        MetadataMutation::PutObject(parent.into()),
    ]);
    let sequence = tokio::time::timeout(Duration::from_secs(5), scoped.commit(batch)).await??;
    drop(old_target);
    ensure!(futures::poll!(rename.as_mut()).is_pending());
    ensure!(
        scoped
            .read_view()
            .await?
            .changes(sequence, 10)
            .await?
            .is_empty()
    );
    drop(new_target);
    ensure!(
        tokio::time::timeout(Duration::from_secs(5), rename)
            .await??
            .0
            == StatusCode::OK
    );
    let view = scoped.read_view().await?;
    ensure!(view.object(old.id).await? == Some(old.clone()));
    ensure!(view.object(new.id).await?.is_none());
    ensure!(view.child(f.shared.id, &"a b%?.txt".parse()?).await? == Some(f.files[0].id));
    ensure!(view.child(f.shared.id, &"preserved".parse()?).await? == Some(old.id));
    drop(view);
    f.close().await
}

#[tokio::test]
async fn opposing_moves_cannot_create_a_cycle() -> Result<()> {
    let f = Fixture::new().await?;
    let mut ids = Vec::new();
    for name in ["one", "two"] {
        let (status, body) = f
            .request(
                "/objects/mkdir",
                json!({"parent_id":f.shared.id.to_string(),"name":name}),
            )
            .await?;
        ensure!(status == StatusCode::CREATED);
        ids.push(text(&body, "object_id")?.parse::<ObjectId>()?);
    }
    let (a,b) = tokio::time::timeout(Duration::from_secs(5), async {
        tokio::join!(
            f.request("/objects/rename",json!({"object_id":ids[0].to_string(),"expected_metadata_revision":0,"parent_id":ids[1].to_string(),"name":"one"})),
            f.request("/objects/rename",json!({"object_id":ids[1].to_string(),"expected_metadata_revision":0,"parent_id":ids[0].to_string(),"name":"two"})),
        )
    }).await?;
    let (a, b) = (a?, b?);
    ensure!([a.0, b.0].contains(&StatusCode::OK) && [a.0, b.0].contains(&StatusCode::CONFLICT));
    let grants = ["reader".to_owned()].into();
    let read = NamespaceRead::new(&f.storage, &f.workspace, &grants).await?;
    for id in ids {
        ensure!(read.stat(id).await?.id == id);
    }
    drop(read);
    f.close().await
}
