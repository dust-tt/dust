use crate::{
    api_keys::validate_api_key,
    oauth::{
        connection::{self, Connection, ConnectionProvider, MigratedCredentials},
        credential::{Credential, CredentialMetadata, CredentialProvider},
        store,
    },
    utils::{error_response, APIResponse, CoreRequestMakeSpan},
};
use anyhow::{anyhow, Result};
use axum::{
    extract::{Path, State},
    middleware::from_fn,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use hyper::StatusCode;
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

use tower_http::trace::{self, TraceLayer};
use tracing::Level;

struct OAuthState {
    store: Box<dyn store::OAuthStore + Sync + Send>,
}

impl OAuthState {
    fn new(store: Box<dyn store::OAuthStore + Sync + Send>) -> Self {
        Self { store }
    }
}

async fn index() -> &'static str {
    "oauth server ready"
}

#[derive(Deserialize)]
struct ConnectionCreatePayload {
    provider: ConnectionProvider,
    metadata: serde_json::Value,
    // Optionally present secret fields (migration case).
    migrated_credentials: Option<MigratedCredentials>,
}

async fn connections_create(
    State(state): State<Arc<OAuthState>>,
    Json(payload): Json<ConnectionCreatePayload>,
) -> (StatusCode, Json<APIResponse>) {
    match Connection::create(
        state.store.clone(),
        payload.provider,
        payload.metadata,
        payload.migrated_credentials,
    )
    .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to create connection",
            Some(e),
        ),
        Ok(c) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "connection": {
                        "connection_id": c.connection_id(),
                        "created": c.created(),
                        "provider": c.provider(),
                        "status": c.status(),
                        "metadata": c.metadata(),
                    },
                })),
            }),
        ),
    }
}

#[derive(Deserialize)]
struct ConnectionFinalizePayload {
    provider: ConnectionProvider,
    code: String,
    redirect_uri: String,
}

async fn connections_finalize(
    State(state): State<Arc<OAuthState>>,
    Path(connection_id): Path<String>,
    Json(payload): Json<ConnectionFinalizePayload>,
) -> (StatusCode, Json<APIResponse>) {
    match state
        .store
        .retrieve_connection(payload.provider, &connection_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::NOT_FOUND,
            "connection_not_found",
            "Requested connection was not found",
            Some(e),
        ),
        Ok(mut c) => match c
            .finalize(
                state.clone().store.clone(),
                &payload.code,
                &payload.redirect_uri,
            )
            .await
        {
            Err(e) => error_response(
                match e.code {
                    connection::ConnectionErrorCode::TokenRevokedError => StatusCode::UNAUTHORIZED,
                    connection::ConnectionErrorCode::ConnectionAlreadyFinalizedError => {
                        StatusCode::BAD_REQUEST
                    }
                    _ => StatusCode::INTERNAL_SERVER_ERROR,
                },
                &e.code.to_string(),
                &e.message,
                None,
            ),
            Ok(_) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "connection": {
                            "connection_id": c.connection_id(),
                            "created": c.created(),
                            "provider": c.provider(),
                            "status": c.status(),
                            "metadata": c.metadata(),
                        },
                    })),
                }),
            ),
        },
    }
}

#[derive(Deserialize)]
struct ConnectionAccessTokenPayload {
    provider: ConnectionProvider,
}

async fn connections_access_token(
    State(state): State<Arc<OAuthState>>,
    Path(connection_id): Path<String>,
    Json(payload): Json<ConnectionAccessTokenPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match state
        .store
        .retrieve_connection(payload.provider, &connection_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::NOT_FOUND,
            "connection_not_found",
            "Requested connection was not found",
            Some(e),
        ),
        Ok(mut c) => match c.access_token(state.clone().store.clone()).await {
            Err(e) => error_response(
                match e.code {
                    connection::ConnectionErrorCode::TokenRevokedError => StatusCode::UNAUTHORIZED,
                    connection::ConnectionErrorCode::ConnectionNotFinalizedError => {
                        StatusCode::BAD_REQUEST
                    }
                    _ => StatusCode::INTERNAL_SERVER_ERROR,
                },
                &e.code.to_string(),
                &e.message,
                None,
            ),
            Ok((access_token, scrubbed_raw_json)) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "connection": {
                            "connection_id": c.connection_id(),
                            "created": c.created(),
                            "provider": c.provider(),
                            "status": c.status(),
                            "metadata": c.metadata(),
                        },
                        "access_token": access_token,
                        "access_token_expiry": c.access_token_expiry(),
                        "scrubbed_raw_json": scrubbed_raw_json,
                    })),
                }),
            ),
        },
    }
}

#[derive(Deserialize)]
struct CredentialPayload {
    provider: CredentialProvider,
    metadata: CredentialMetadata,
    content: serde_json::Map<String, serde_json::Value>,
}

async fn credentials_create(
    State(state): State<Arc<OAuthState>>,
    Json(payload): Json<CredentialPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match Credential::create(
        state.store.clone(),
        payload.provider,
        payload.metadata,
        payload.content,
    )
    .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to create credential",
            Some(e),
        ),
        Ok(c) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "credential": {
                        "credential_id": c.credential_id(),
                        "created": c.created(),
                    },
                })),
            }),
        ),
    }
}

async fn credentials_retrieve(
    State(state): State<Arc<OAuthState>>,
    Path(credential_id): Path<String>,
) -> (StatusCode, Json<APIResponse>) {
    match state.store.retrieve_credential(&credential_id).await {
        Err(e) => error_response(
            StatusCode::NOT_FOUND,
            "credential_not_found",
            "Requested credential was not found",
            Some(e),
        ),
        Ok(c) => match c.unseal_encrypted_content() {
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to unseal encrypted content",
                Some(e),
            ),
            Ok(content) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "credential": {
                            "credential_id": c.credential_id(),
                            "created": c.created(),
                            "provider": c.provider(),
                            "metadata": c.metadata(),
                            "content": content,
                        },
                    })),
                }),
            ),
        },
    }
}

async fn credentials_delete(
    State(state): State<Arc<OAuthState>>,
    Path(credential_id): Path<String>,
) -> (StatusCode, Json<APIResponse>) {
    match state.store.delete_credential(&credential_id).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to delete credential",
            Some(e),
        ),
        Ok(_) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: None,
            }),
        ),
    }
}

pub async fn create_app() -> Result<Router> {
    let store: Box<dyn store::OAuthStore + Sync + Send> = match std::env::var("OAUTH_DATABASE_URI")
    {
        Ok(db_uri) => {
            let s = store::PostgresOAuthStore::new(&db_uri).await?;
            s.init().await?;
            Box::new(s)
        }
        Err(_) => Err(anyhow!("OAUTH_DATABASE_URI not set."))?,
    };

    let state = Arc::new(OAuthState::new(store));

    let router = Router::new()
        // Connections
        .route("/connections", post(connections_create))
        .route(
            "/connections/:connection_id/finalize",
            post(connections_finalize),
        )
        .route(
            "/connections/:connection_id/access_token",
            post(connections_access_token),
        )
        .route("/credentials", post(credentials_create))
        .route("/credentials/:credential_id", get(credentials_retrieve))
        .route("/credentials/:credential_id", delete(credentials_delete))
        // Extensions
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(CoreRequestMakeSpan::new())
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(from_fn(validate_api_key))
        .with_state(state.clone());

    let health_check_router = Router::new().route("/", get(index));

    let app = Router::new().merge(router).merge(health_check_router);

    return Ok(app);
}
