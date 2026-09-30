use anyhow::{Context, Result, ensure};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::Request,
};
use serde_json::{Value, json};
use slatedb::object_store::{ObjectStore, memory::InMemory};
use tower::ServiceExt;

use super::*;
use crate::{
    api::{Access, router},
    storage::{Storage, StoragePrefix},
};

const SERVER_KEY: &str = "test-server-key-012345678901234567890123456789";

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    key: Option<&str>,
    body: Value,
) -> Result<(StatusCode, Value)> {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(key) = key {
        request = request.header(header::AUTHORIZATION, format!("Bearer {key}"));
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_string()))?)
        .await?;
    let status = response.status();
    ensure!(response.headers()[header::CACHE_CONTROL] == "no-store");
    if status == StatusCode::UNAUTHORIZED {
        ensure!(response.headers()[header::WWW_AUTHENTICATE] == "Bearer");
    }
    let bytes = to_bytes(response.into_body(), 100_000).await?;
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)?
    };
    if status.is_client_error() || status.is_server_error() {
        ensure!(body["error"]["code"].is_string() && body["error"]["message"].is_string());
        if let Some(key) = key {
            ensure!(!String::from_utf8_lossy(&bytes).contains(key));
        }
    }
    Ok((status, body))
}

fn text<'a>(body: &'a Value, field: &str) -> Result<&'a str> {
    body[field].as_str().context("missing response field")
}

#[tokio::test]
async fn workspace_authority_survives_restart_but_sessions_do_not() -> Result<()> {
    exercise_sessions(Arc::new(InMemory::new()), &"sessions".parse()?).await
}

pub(crate) async fn exercise_sessions(
    store: Arc<dyn ObjectStore>,
    prefix: &StoragePrefix,
) -> Result<()> {
    let storage = Arc::new(Storage::open(store.clone(), prefix).await?);
    let app = router(ApiState::new(
        Some(storage.clone()),
        Access::new(Some(SERVER_KEY))?,
    ));
    let workspace = WorkspaceId::new("api-workspace/é")?;
    let (status, created) = call(
        &app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({
            "workspace_id": workspace.as_str(), "root_grants": ["g:admins", "g:admins"],
        }),
    )
    .await?;
    ensure!(status == StatusCode::CREATED);
    let workspace_key = text(&created, "workspace_key")?;
    let root_id = text(&created, "root_id")?.parse()?;
    let view = storage.workspace(&workspace)?.read_view().await?;
    let root = view
        .object(root_id)
        .await?
        .context("missing persisted root")?;
    ensure!(root.parent.is_none() && root.kind == crate::model::ObjectKind::Directory);
    ensure!(root.mime_type == "inode/directory");
    ensure!(view.grants(root_id, None, 10).await? == ["g:admins"]);
    ensure!(view.granted_objects("g:admins", None, 10).await? == [root_id]);
    ensure!(view.changes(0, 10).await?.len() == 1);
    ensure!(
        storage
            .workspace_record(&workspace)
            .await?
            .context("missing authority")?
            .key_hash
            == access::fingerprint(workspace_key)
    );
    let request = json!({"workspace_id": workspace.as_str(), "grants": ["u:alice", "arbitrary/\u{0000}é", "u:alice"]});
    let (status, created_session) = call(
        &app,
        "POST",
        "/sessions",
        Some(workspace_key),
        request.clone(),
    )
    .await?;
    ensure!(
        status == StatusCode::CREATED
            && created_session["grants"]
                .as_array()
                .context("grants")?
                .len()
                == 2
    );
    let session_key = text(&created_session, "session_key")?;
    let (status, current) = call(
        &app,
        "GET",
        "/sessions/current?workspace_id=other",
        Some(session_key),
        Value::Null,
    )
    .await?;
    ensure!(status == StatusCode::OK && current["workspace_id"] == workspace.as_str());
    ensure!(current.get("session_key").is_none());
    ensure!(current["expires_at"].as_u64().context("expiration")? > 0);
    drop(view);
    drop(app);
    storage.close().await?;
    drop(storage);

    let storage = Arc::new(Storage::open(store, prefix).await?);
    let app = router(ApiState::new(Some(storage.clone()), Access::new(None)?));
    ensure!(
        call(
            &app,
            "GET",
            "/sessions/current",
            Some(session_key),
            Value::Null
        )
        .await?
        .0 == StatusCode::UNAUTHORIZED
    );
    let (status, fresh) = call(&app, "POST", "/sessions", Some(workspace_key), request).await?;
    ensure!(status == StatusCode::CREATED);
    let close_path = format!("/sessions/{}", text(&fresh, "session_id")?);
    let fresh_key = text(&fresh, "session_key")?;
    ensure!(
        call(&app, "DELETE", &close_path, Some(fresh_key), Value::Null)
            .await?
            .0
            == StatusCode::NO_CONTENT
    );
    ensure!(
        call(
            &app,
            "GET",
            "/sessions/current",
            Some(fresh_key),
            Value::Null
        )
        .await?
        .0 == StatusCode::UNAUTHORIZED
    );
    drop(app);
    storage.close().await
}

#[tokio::test]
async fn credential_levels_and_workspaces_cannot_be_substituted() -> Result<()> {
    let storage = Arc::new(Storage::open(Arc::new(InMemory::new()), &"authority".parse()?).await?);
    let app = router(ApiState::new(
        Some(storage.clone()),
        Access::new(Some(SERVER_KEY))?,
    ));
    ensure!(
        call(
            &app,
            "POST",
            "/workspaces",
            None,
            json!({"workspace_id":"w"})
        )
        .await?
        .0 == StatusCode::UNAUTHORIZED
    );
    let (_, first) = call(
        &app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({"workspace_id":"w"}),
    )
    .await?;
    let (_, second) = call(
        &app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({"workspace_id":"other"}),
    )
    .await?;
    let key = text(&first, "workspace_key")?;
    for workspace in ["other", "missing"] {
        ensure!(
            call(
                &app,
                "POST",
                "/sessions",
                Some(key),
                json!({"workspace_id": workspace,"grants":["same"]})
            )
            .await?
            .0 == StatusCode::UNAUTHORIZED
        );
    }
    let request = json!({"workspace_id":"w","grants":["same"]});
    let (_, session) = call(&app, "POST", "/sessions", Some(key), request.clone()).await?;
    let session_key = text(&session, "session_key")?;
    for wrong_key in [SERVER_KEY, text(&second, "workspace_key")?, session_key] {
        ensure!(
            call(&app, "POST", "/sessions", Some(wrong_key), request.clone())
                .await?
                .0
                == StatusCode::UNAUTHORIZED
        );
    }
    ensure!(
        call(
            &app,
            "POST",
            "/workspaces",
            Some(key),
            json!({"workspace_id":"third"})
        )
        .await?
        .0 == StatusCode::UNAUTHORIZED
    );
    ensure!(
        call(&app, "GET", "/sessions/current", Some(key), Value::Null)
            .await?
            .0
            == StatusCode::UNAUTHORIZED
    );
    ensure!(
        call(
            &app,
            "DELETE",
            "/sessions/not-my-session",
            Some(session_key),
            Value::Null
        )
        .await?
        .0 == StatusCode::NOT_FOUND
    );
    ensure!(
        call(
            &app,
            "GET",
            "/sessions/current",
            Some(session_key),
            Value::Null
        )
        .await?
        .0 == StatusCode::OK
    );
    drop(app);
    storage.close().await
}

#[tokio::test]
async fn session_input_is_bounded_and_unsupported_mounts_are_rejected() -> Result<()> {
    let storage = Arc::new(Storage::open(Arc::new(InMemory::new()), &"inputs".parse()?).await?);
    let app = router(ApiState::new(
        Some(storage.clone()),
        Access::new(Some(SERVER_KEY))?,
    ));
    let (_, created) = call(
        &app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({"workspace_id":"w"}),
    )
    .await?;
    let key = text(&created, "workspace_key")?;
    for (body, expected) in [
        (
            json!({"workspace_id":"w","grants":(0..512).map(|n| n.to_string()).collect::<Vec<_>>()}),
            StatusCode::CREATED,
        ),
        (
            json!({"workspace_id":"w","grants":(0..513).map(|n| n.to_string()).collect::<Vec<_>>()}),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({"workspace_id":"w","grants":vec![""; 513]}),
            StatusCode::CREATED,
        ),
        (
            json!({"workspace_id":"w","grants":[],"mounts":{}}),
            StatusCode::CREATED,
        ),
        (
            json!({"workspace_id":"w","grants":[],"mounts":{"current":"dfs://anything"}}),
            StatusCode::NOT_IMPLEMENTED,
        ),
        (
            json!({"workspace_id":"w","grants":[],"admin":true}),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({"workspace_id":"w","grants":["x".repeat(65536)]}),
            StatusCode::BAD_REQUEST,
        ),
    ] {
        ensure!(call(&app, "POST", "/sessions", Some(key), body).await?.0 == expected);
    }
    let request = Request::builder()
        .method("POST")
        .uri("/sessions")
        .header(header::AUTHORIZATION, format!("Bearer {key}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{invalid"))?;
    let response = app.clone().oneshot(request).await?;
    ensure!(response.status() == StatusCode::BAD_REQUEST);
    ensure!(
        serde_json::from_slice::<Value>(&to_bytes(response.into_body(), 1024).await?)?["error"]["code"]
            == "invalid_input"
    );
    drop(app);
    storage.close().await
}

#[tokio::test]
async fn simultaneous_workspace_creation_cannot_replace_authority() -> Result<()> {
    let storage = Arc::new(Storage::open(Arc::new(InMemory::new()), &"duplicate".parse()?).await?);
    let app = router(ApiState::new(
        Some(storage.clone()),
        Access::new(Some(SERVER_KEY))?,
    ));
    let body = json!({"workspace_id":"w","root_grants":["initial"]});
    let (a, b) = tokio::join!(
        call(&app, "POST", "/workspaces", Some(SERVER_KEY), body.clone()),
        call(&app, "POST", "/workspaces", Some(SERVER_KEY), body)
    );
    let (a, b) = (a?, b?);
    let (created, conflict) = if a.0 == StatusCode::CREATED {
        (a, b)
    } else {
        (b, a)
    };
    ensure!(created.0 == StatusCode::CREATED && conflict.0 == StatusCode::CONFLICT);
    let workspace = WorkspaceId::new("w")?;
    let root = text(&created.1, "root_id")?.parse()?;
    let view = storage.workspace(&workspace)?.read_view().await?;
    ensure!(view.changes(0, 10).await?.len() == 1);
    ensure!(view.granted_objects("initial", None, 10).await? == [root]);
    ensure!(
        call(
            &app,
            "POST",
            "/sessions",
            Some(text(&created.1, "workspace_key")?),
            json!({"workspace_id":"w","grants":[]})
        )
        .await?
        .0 == StatusCode::CREATED
    );
    drop(view);
    drop(app);
    storage.close().await
}
