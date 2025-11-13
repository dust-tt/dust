use crate::providers::llm::TokenizerSingleton;
use crate::providers::provider::{provider, ProviderID};
use crate::run;
use crate::types::tokenizer::TokenizerConfig;
use crate::utils::{error_response, APIResponse};
use axum::Json;
use http::StatusCode;
use serde_json::json;

#[derive(serde::Deserialize)]
pub struct TokenizePayload {
    text: String,
    provider_id: ProviderID,
    model_id: String,
    credentials: Option<run::Credentials>,
    tokenizer: TokenizerConfig,
}

pub async fn tokenize(Json(payload): Json<TokenizePayload>) -> (StatusCode, Json<APIResponse>) {
    let tokenizer = TokenizerSingleton::from_config(&payload.tokenizer);
    let mut llm = provider(payload.provider_id).llm(payload.model_id, tokenizer);

    // If we received credentials we initialize the llm with them.
    match payload.credentials {
        Some(c) => {
            match llm.initialize(c.clone()).await {
                Err(e) => {
                    return error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to initialize LLM",
                        Some(e),
                    );
                }
                Ok(()) => (),
            };
        }
        None => (),
    }

    match llm.tokenize(vec![payload.text]).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to tokenize text",
            Some(e),
        ),
        Ok(mut res) => match res.pop() {
            None => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to tokenize text",
                None,
            ),
            Some(tokens) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "tokens": tokens,
                    })),
                }),
            ),
        },
    }
}

#[derive(serde::Deserialize)]
pub struct TokenizeBatchPayload {
    texts: Vec<String>,
    provider_id: ProviderID,
    model_id: String,
    tokenizer: TokenizerConfig,
    credentials: Option<run::Credentials>,
}

async fn tokenize_batch_internal(
    payload: TokenizeBatchPayload,
) -> Result<Vec<Vec<(usize, String)>>, anyhow::Error> {
    let tokenizer = TokenizerSingleton::from_config(&payload.tokenizer);
    let mut llm = provider(payload.provider_id).llm(payload.model_id, tokenizer);

    // If we received credentials we initialize the llm with them.
    if let Some(c) = payload.credentials {
        llm.initialize(c).await?;
    }

    llm.tokenize(payload.texts).await
}

pub async fn tokenize_batch(
    Json(payload): Json<TokenizeBatchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match tokenize_batch_internal(payload).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to tokenize text",
            Some(e),
        ),
        Ok(res) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "tokens": res,
                })),
            }),
        ),
    }
}

pub async fn tokenize_batch_count(
    Json(payload): Json<TokenizeBatchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match tokenize_batch_internal(payload).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to tokenize text",
            Some(e),
        ),
        Ok(res) => {
            // Only return counts instead of full token arrays to avoid OOM.
            let counts: Vec<usize> = res.iter().map(|tokens| tokens.len()).collect();
            (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "counts": counts,
                    })),
                }),
            )
        }
    }
}
