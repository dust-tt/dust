use std::sync::atomic::{AtomicUsize, Ordering};

use axum::{
    body::{Body, to_bytes},
    http::{Request, header},
};
use futures::{StreamExt, stream};
use tokio::sync::{Notify, mpsc};
use tower::ServiceExt;

use super::*;

pub(super) async fn send_content(
    app: &Router,
    key: &str,
    id: &str,
    body: Body,
) -> Result<(StatusCode, Value)> {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/uploads/content")
                .header(header::AUTHORIZATION, format!("Bearer {key}"))
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .header("dfs-upload-id", id)
                .body(body)?,
        )
        .await?;
    ensure!(response.headers()[header::CACHE_CONTROL] == "no-store");
    let status = response.status();
    Ok((
        status,
        serde_json::from_slice(&to_bytes(response.into_body(), 16 * 1024).await?)?,
    ))
}

pub(super) async fn start_create(f: &Fixture, name: &str) -> Result<Value> {
    let (status, receipt) = f
        .request(
            "/uploads/start",
            json!({
                "operation":"create", "parent_id":f.shared.id.to_string(), "name":name,
            }),
        )
        .await?;
    ensure!(status == StatusCode::CREATED);
    ensure!(receipt["complete"] == false && receipt["size_bytes"].is_null());
    Ok(receipt)
}

#[tokio::test]
async fn sequential_create_and_replace_uploads_remain_unpublished_and_session_scoped() -> Result<()>
{
    let f = Fixture::new().await?;
    let sequence = f
        .storage
        .workspace(&f.workspace)?
        .read_view()
        .await?
        .sequence()
        .await?;
    for (name, count) in [("empty", 0), ("large", 145)] {
        let receipt = start_create(&f, name).await?;
        let id = text(&receipt, "upload_id")?;
        let chunks = stream::iter(
            (0..count).map(|_| Ok::<_, std::io::Error>(Bytes::from(vec![b'a'; 64 * 1024]))),
        );
        let (status, complete) =
            send_content(&f.app, &f.key, id, Body::from_stream(chunks)).await?;
        ensure!(status == StatusCode::OK && complete["complete"] == true);
        ensure!(complete["size_bytes"] == count * 64 * 1024);
        let (status, same) = f
            .request("/uploads/status", json!({"upload_id":id}))
            .await?;
        ensure!(status == StatusCode::OK && same["size_bytes"] == complete["size_bytes"]);
        let other = f.session_key(&["reader"]).await?;
        let (status, _) = call(
            &f.app,
            "POST",
            "/uploads/status",
            Some(&other),
            json!({"upload_id":id}),
        )
        .await?;
        ensure!(status == StatusCode::NOT_FOUND);
        ensure!(send_content(&f.app, &other, id, Body::empty()).await?.0 == StatusCode::NOT_FOUND);
        ensure!(send_content(&f.app, &f.key, id, Body::empty()).await?.0 == StatusCode::CONFLICT);
        ensure!(
            f.request(
                "/objects/stat",
                json!({"object_id":text(&receipt,"object_id")?})
            )
            .await?
            .0 == StatusCode::NOT_FOUND
        );
        ensure!(
            f.request(
                "/objects/lookup",
                json!({"parent_id":f.shared.id.to_string(),"name":name})
            )
            .await?
            .0 == StatusCode::NOT_FOUND
        );
    }
    let file = &f.files[0];
    let ObjectKind::File(old) = &file.kind else {
        anyhow::bail!("expected file")
    };
    let (status, receipt) = f
        .request(
            "/uploads/start",
            json!({"operation":"replace",
        "object_id":file.id.to_string(),"expected_content_version":old.version.to_string()}),
        )
        .await?;
    ensure!(status == StatusCode::CREATED);
    ensure!(text(&receipt, "object_id")? == file.id.to_string());
    let (status, complete) = send_content(
        &f.app,
        &f.key,
        text(&receipt, "upload_id")?,
        Body::from("replacement"),
    )
    .await?;
    ensure!(status == StatusCode::OK && complete["size_bytes"] == 11);
    let scoped = f.storage.workspace(&f.workspace)?;
    ensure!(scoped.read_view().await?.object(file.id).await? == Some(file.clone()));
    ensure!(scoped.read_blob(file.id, old.version).await? == b"hi"[..]);
    ensure!(scoped.read_view().await?.sequence().await? == sequence);
    f.close().await
}

#[tokio::test]
async fn uploads_authorize_targets_before_revisions_and_reject_invalid_or_failed_bodies()
-> Result<()> {
    let f = Fixture::new().await?;
    for (body, expected) in [
        (
            json!({"operation":"create","parent_id":f.private.id.to_string(),"name":"hidden"}),
            StatusCode::NOT_FOUND,
        ),
        (
            json!({"operation":"create","parent_id":"shared","name":"file"}),
            StatusCode::FORBIDDEN,
        ),
        (
            json!({"operation":"create","parent_id":f.shared.id.to_string(),"name":"A.txt"}),
            StatusCode::CONFLICT,
        ),
        (
            json!({"operation":"replace","object_id":f.shared.id.to_string(),"expected_content_version":ContentVersionId::generate().to_string()}),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({"operation":"replace","object_id":f.files[0].id.to_string(),"expected_content_version":ContentVersionId::generate().to_string()}),
            StatusCode::CONFLICT,
        ),
    ] {
        ensure!(f.request("/uploads/start", body).await?.0 == expected);
    }
    let receipt = start_create(&f, "bad").await?;
    let id = text(&receipt, "upload_id")?;
    let polled = Arc::new(AtomicUsize::new(0));
    let counter = polled.clone();
    let body = Body::from_stream(stream::once(async move {
        counter.fetch_add(1, Ordering::SeqCst);
        Ok::<_, std::io::Error>(Bytes::from_static(b"private"))
    }));
    ensure!(send_content(&f.app, "invalid", id, body).await?.0 == StatusCode::UNAUTHORIZED);
    ensure!(polled.load(Ordering::SeqCst) == 0);
    let interrupted = Body::from_stream(stream::iter([
        Ok(Bytes::from_static(b"partial")),
        Err(std::io::Error::other("lost connection")),
    ]));
    ensure!(send_content(&f.app, &f.key, id, interrupted).await?.0 == StatusCode::BAD_REQUEST);
    ensure!(
        f.request("/uploads/status", json!({"upload_id":id}))
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    let receipt = start_create(&f, "oversized-frame").await?;
    ensure!(
        send_content(
            &f.app,
            &f.key,
            text(&receipt, "upload_id")?,
            Body::from(vec![0; 1024 * 1024 + 1])
        )
        .await?
        .0 == StatusCode::BAD_REQUEST
    );
    f.close().await
}

#[tokio::test]
async fn revocation_or_session_closure_during_transfer_prevents_a_completed_receipt() -> Result<()>
{
    for close in [false, true] {
        let f = Fixture::new().await?;
        let receipt = start_create(&f, "in-flight").await?;
        let id = text(&receipt, "upload_id")?.to_owned();
        let started = Arc::new(Notify::new());
        let signal = started.clone();
        let (sender, receiver) = mpsc::channel::<Result<Bytes, std::io::Error>>(1);
        let chunks = stream::once(async move {
            signal.notify_one();
            Ok(Bytes::from_static(b"partial"))
        })
        .chain(stream::unfold(receiver, |mut receiver| async move {
            receiver.recv().await.map(|item| (item, receiver))
        }));
        let app = f.app.clone();
        let key = f.key.clone();
        let upload_id = id.clone();
        let transfer = tokio::spawn(async move {
            send_content(&app, &key, &upload_id, Body::from_stream(chunks)).await
        });
        started.notified().await;
        ensure!(send_content(&f.app, &f.key, &id, Body::empty()).await?.0 == StatusCode::CONFLICT);
        if close {
            let (_, session) =
                call(&f.app, "GET", "/sessions/current", Some(&f.key), json!({})).await?;
            let path = format!("/sessions/{}", text(&session, "session_id")?);
            ensure!(
                call(&f.app, "DELETE", &path, Some(&f.key), json!({}))
                    .await?
                    .0
                    == StatusCode::NO_CONTENT
            );
        } else {
            let (status, _) = call(&f.app,"POST","/objects/grants/update",Some(&f.workspace_key), json!({
                "workspace_id":"w","object_id":f.shared.id.to_string(),
                "expected_metadata_revision":f.shared.metadata_revision.get(),"grants":{"reader":false},
            })).await?;
            ensure!(status == StatusCode::OK);
        }
        drop(sender);
        let (status, _) = transfer.await??;
        ensure!(
            status
                == if close {
                    StatusCode::UNAUTHORIZED
                } else {
                    StatusCode::NOT_FOUND
                }
        );
        ensure!(
            f.storage
                .workspace(&f.workspace)?
                .read_view()
                .await?
                .object(text(&receipt, "object_id")?.parse()?)
                .await?
                .is_none()
        );
        f.close().await?;
    }
    Ok(())
}
