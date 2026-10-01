use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use sha2::{Digest, Sha256};
use tower::ServiceExt;

use super::*;
use crate::{
    api::{self, Access, ApiState, test_call, test_text},
    model::RequestId,
};

#[tokio::test]
async fn cancelled_responses_do_not_cancel_publication_and_receipts_recover_atomically()
-> Result<()> {
    for persist in [true, false] {
        let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
        let prefix: StoragePrefix = "file-durability".parse()?;
        let workspace = WorkspaceId::new("w")?;
        let workspace_key = format!("dfsw_{}", "ab".repeat(32));
        let storage = Storage::open(store.clone(), &prefix).await?;
        let root = storage
            .create_workspace(
                &workspace,
                Sha256::digest(workspace_key.as_bytes()).into(),
                &["owner".to_owned()].into(),
            )
            .await?
            .context("root")?;
        storage.close().await?;
        let storage = Arc::new(
            Storage::open_with_settings(
                store.clone(),
                &prefix,
                Settings {
                    flush_interval: None,
                    ..Default::default()
                },
            )
            .await?,
        );
        let state = ApiState::new(Some(storage.clone()), Access::new(None)?);
        let app = api::router(state.clone());
        let (_, session) = test_call(
            &app,
            "POST",
            "/sessions",
            Some(&workspace_key),
            json!({"workspace_id":"w","grants":["owner"]}),
        )
        .await?;
        let key = test_text(&session, "session_key")?.to_owned();
        let (status, upload) = test_call(
            &app,
            "POST",
            "/uploads/start",
            Some(&key),
            json!({"operation":"create","parent_id":root.to_string(),"name":"file"}),
        )
        .await?;
        ensure!(status == StatusCode::CREATED);
        let id = test_text(&upload, "upload_id")?.to_owned();
        let object: ObjectId = test_text(&upload, "object_id")?.parse()?;
        let request_id: RequestId = id.parse()?;
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri("/uploads/content")
                    .header("Authorization", format!("Bearer {key}"))
                    .header("Content-Type", "application/octet-stream")
                    .header("Dfs-Upload-Id", &id)
                    .body(Body::from("durable"))?,
            )
            .await?;
        ensure!(response.status() == StatusCode::OK);
        let writer_app = app.clone();
        let writer_key = key.clone();
        let writer_id = id.clone();
        let caller = tokio::spawn(async move {
            test_call(
                &writer_app,
                "POST",
                "/uploads/commit",
                Some(&writer_key),
                json!({"upload_id":writer_id}),
            )
            .await
        });
        let scoped = storage.workspace(&workspace)?;
        tokio::time::timeout(Duration::from_secs(5), async {
            while scoped
                .read_view()
                .await?
                .operation(request_id)
                .await?
                .is_none()
            {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
            Ok::<_, anyhow::Error>(())
        })
        .await??;
        ensure!(!caller.is_finished());
        ensure!(scoped.read_view().await?.object(object).await?.is_some());
        ensure!(scoped.read_view().await?.changes(1, 10).await?.is_empty());
        caller.abort();
        let _ = caller.await;
        let mut retry = Box::pin(test_call(
            &app,
            "POST",
            "/uploads/commit",
            Some(&key),
            json!({"upload_id":id}),
        ));
        ensure!(futures::poll!(retry.as_mut()).is_pending());
        if persist {
            storage.metadata.flush().await?;
            let (status, receipt) = retry.await?;
            ensure!(status == StatusCode::OK && receipt["size_bytes"] == 7);
            state.drain_file_jobs().await;
            ensure!(scoped.read_view().await?.changes(1, 10).await?.len() == 1);
            storage.close().await?;
        } else {
            storage
                .metadata
                .close_with_options(slatedb::config::CloseOptions { flush_type: None })
                .await?;
            ensure!(retry.await?.0 == StatusCode::SERVICE_UNAVAILABLE);
            state.drain_file_jobs().await;
        }
        drop(app);
        let recovered = Storage::open(store, &prefix).await?;
        let scoped = recovered.workspace(&workspace)?;
        let view = scoped.read_view().await?;
        ensure!(view.operation(request_id).await?.is_some() == persist);
        ensure!(view.object(object).await?.is_some() == persist);
        ensure!(view.child(root, &"file".parse()?).await?.is_some() == persist);
        ensure!(view.changes(1, 10).await?.len() == usize::from(persist));
        // Failed publication may leave an immutable orphan, but never a dangling reference.
        ensure!(scoped.read_blob(object, id.parse()?).await? == b"durable"[..]);
        recovered.close().await?;
    }
    Ok(())
}
