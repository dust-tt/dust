use super::{LexicalIndex, Request, timing::Trace};
use crate::{
    engine::Engine,
    model::{Reply, Session},
};
use anyhow::{Result, ensure};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::json;
use std::{
    net::SocketAddr,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::Semaphore;

pub struct Config {
    pub path: PathBuf,
    pub token_file: PathBuf,
    pub listen: SocketAddr,
    pub poll_ms: u64,
}

struct App {
    index: Arc<LexicalIndex>,
    queries: Arc<Semaphore>,
    failed: AtomicBool,
}

struct Login {
    engine: Arc<Engine>,
    session: Session,
}
impl Drop for Login {
    fn drop(&mut self) {
        self.engine.logout(&self.session.id);
    }
}

#[derive(Debug)]
struct ApiError(StatusCode);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.0,
            Json(json!({"error":self.0.canonical_reason().unwrap_or("request failed")})),
        )
            .into_response()
    }
}
fn classify(error: anyhow::Error) -> ApiError {
    if let Some(error) = error.downcast_ref::<crate::model::Error>() {
        return ApiError(match error.code {
            libc::EACCES | libc::ESTALE => StatusCode::UNAUTHORIZED,
            libc::EAGAIN => StatusCode::TOO_MANY_REQUESTS,
            _ => StatusCode::SERVICE_UNAVAILABLE,
        });
    }
    ApiError(StatusCode::SERVICE_UNAVAILABLE)
}
fn authenticate(app: &App, headers: &HeaderMap) -> std::result::Result<Login, ApiError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| !v.is_empty())
        .ok_or(ApiError(StatusCode::UNAUTHORIZED))?;
    let login = Login {
        engine: app.index.engine.clone(),
        session: app
            .index
            .engine
            .login(token)
            .map_err(|e| classify(e.into()))?,
    };
    if login.session.tenant != app.index.tenant {
        return Err(ApiError(StatusCode::NOT_FOUND));
    }
    Ok(login)
}

async fn search(
    State(app): State<Arc<App>>,
    Path((workspace, table)): Path<(String, String)>,
    headers: HeaderMap,
    request: std::result::Result<Json<Request>, JsonRejection>,
) -> std::result::Result<Response, ApiError> {
    let mut trace = Trace::default();
    let Json(request) = request.map_err(|e| {
        ApiError(if e.status() == StatusCode::PAYLOAD_TOO_LARGE {
            e.status()
        } else {
            StatusCode::BAD_REQUEST
        })
    })?;
    if workspace != app.index.tenant || !matches!(table.as_str(), "nodes" | "documents") {
        return Err(ApiError(StatusCode::NOT_FOUND));
    }
    app.index
        .validate_request(&table, &request)
        .map_err(|_| ApiError(StatusCode::BAD_REQUEST))?;
    let permit = app
        .queries
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError(StatusCode::TOO_MANY_REQUESTS))?;
    let login = authenticate(&app, &headers)?;
    trace.mark("authenticate");
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            app.index
                .search(&login.session.id, &table, &request)
                .map_err(classify)
        }),
    )
    .await
    .map_err(|_| ApiError(StatusCode::SERVICE_UNAVAILABLE))?
    .map_err(|_| ApiError(StatusCode::SERVICE_UNAVAILABLE))??;
    trace.mark("search");
    let mut timings = result.timings_ms.clone();
    let mut response = Json(result).into_response();
    trace.mark("serialize");
    timings.extend(trace.finish("handler_total"));
    let header = timings
        .iter()
        .map(|(name, ms)| format!("{name};dur={ms:.3}"))
        .collect::<Vec<_>>()
        .join(", ");
    response.headers_mut().insert(
        "server-timing",
        HeaderValue::from_str(&header).map_err(|_| ApiError(StatusCode::INTERNAL_SERVER_ERROR))?,
    );
    Ok(response)
}

async fn status(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> std::result::Result<Json<serde_json::Value>, ApiError> {
    let login = authenticate(&app, &headers)?;
    if !login.session.admin || login.session.scope.is_some() {
        return Err(ApiError(StatusCode::NOT_FOUND));
    }
    let (head, auth_generation) = app
        .index
        .engine
        .head(&login.session.id)
        .map_err(|e| classify(e.into()))?;
    let published = app.index.published.read();
    Ok(Json(
        json!({"engine":"tantivy","workspace":app.index.tenant,"source":Reply::Head {head,auth_generation,incarnation:app.index.engine.incarnation.clone()},"indexed_through":published.as_ref().map(|p|&p.metadata.cursor),"indexing_failed":app.failed.load(Ordering::Relaxed),"documents":published.as_ref().map(|p|p.lookups.bodies.len())}),
    ))
}

pub async fn start(engine: Arc<Engine>, config: Config) -> Result<tokio::task::JoinHandle<()>> {
    ensure!(
        config.listen.ip().is_loopback() && config.poll_ms > 0,
        "lexical HTTP requires loopback and positive poll interval"
    );
    let token = std::fs::read_to_string(&config.token_file)?
        .trim()
        .to_owned();
    let login = Login {
        engine: engine.clone(),
        session: engine.login(&token)?,
    };
    ensure!(
        login.session.admin && login.session.scope.is_none(),
        "indexer requires unscoped administrator"
    );
    let tenant = login.session.tenant.clone();
    drop(login);
    let index =
        tokio::task::spawn_blocking(move || LexicalIndex::open(engine, tenant, config.path))
            .await??;
    let app = Arc::new(App {
        index: Arc::new(index),
        queries: Arc::new(Semaphore::new(8)),
        failed: AtomicBool::new(false),
    });
    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    let router = Router::new()
        .route(
            "/v1/workspaces/{workspace}/lexical/{table}/query",
            post(search),
        )
        .route("/lexical/status", get(status))
        .route(
            "/lexical/openapi.json",
            get(|| async {
                Json(
                    serde_json::from_str::<serde_json::Value>(include_str!(
                        "../../lexical/openapi.json"
                    ))
                    .expect("embedded schema"),
                )
            }),
        )
        .layer(DefaultBodyLimit::max(16 * 1024))
        .with_state(app.clone());
    Ok(tokio::spawn(async move {
        let worker = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(config.poll_ms));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            let mut notifications = app.index.engine.notifications.subscribe();
            loop {
                tokio::select! { _ = interval.tick() => {}, _ = notifications.recv() => {tokio::time::sleep(Duration::from_millis(config.poll_ms)).await;} }
                let state = app.clone();
                let token = token.clone();
                let result = tokio::task::spawn_blocking(move || -> Result<bool> {
                    let login = Login {
                        engine: state.index.engine.clone(),
                        session: state.index.engine.login(&token)?,
                    };
                    state.index.refresh(&login.session.id)
                })
                .await;
                let failed = !matches!(result, Ok(Ok(_)));
                app.failed.store(failed, Ordering::Relaxed);
                match result {
                    Ok(Err(error)) => tracing::error!(%error, "lexical index refresh failed"),
                    Err(error) => tracing::error!(%error, "lexical index worker failed"),
                    Ok(Ok(_)) => {}
                }
            }
        });
        if let Err(error) = axum::serve(listener, router).await {
            tracing::error!(%error,"lexical HTTP stopped");
        }
        worker.abort();
    }))
}
