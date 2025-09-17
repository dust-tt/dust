use crate::providers::chat_messages::ChatMessage;
use crate::providers::llm::{ChatFunction, LLMChatRequest};
use crate::providers::provider::ProviderID;
use crate::run;
use crate::utils::{error_response, APIResponse};
use axum::Json;
use http::StatusCode;
use serde_json::{json, Value};

#[derive(serde::Deserialize)]
pub struct LlmChatPayload {
    // Run
    run_id: String,

    // mandatory LLM payload
    provider_id: ProviderID,
    model_id: String,
    messages: Vec<ChatMessage>,
    temperature: f32,

    // credentials and secrets
    credentials: run::Credentials,

    // optional LLM payload
    functions: Option<Vec<ChatFunction>>,
    function_call: Option<String>,
    top_p: Option<f32>,
    n: Option<usize>,
    stop: Option<Vec<String>>,
    max_tokens: Option<i32>,
    presence_penalty: Option<f32>,
    frequency_penalty: Option<f32>,
    logprobs: Option<bool>,
    top_logprobs: Option<i32>,
    extras: Option<Value>,
}
pub async fn chat(Json(payload): Json<LlmChatPayload>) -> (StatusCode, Json<APIResponse>) {
    let request = LLMChatRequest::new(
        payload.provider_id,
        &payload.model_id,
        &payload.messages,
        &payload.functions.unwrap_or_default(),
        payload.function_call,
        payload.temperature,
        payload.top_p,
        payload.n.unwrap_or(1),
        &payload.stop.unwrap_or_default(),
        payload.max_tokens,
        payload.presence_penalty,
        payload.frequency_penalty,
        payload.logprobs,
        payload.top_logprobs,
        payload.extras,
    );

    let result = request
        .execute(payload.credentials, None, payload.run_id)
        .await;

    match result {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "llm_error",
            "Error calling LLM",
            Some(e),
        ),
        Ok(res) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "created": res.created,
                    // ignoring provider and model, as it's in the request
                    // pub provider: String,
                    // pub model: String,
                    "completions": res.completions,
                    "usage": res.usage,
                    "logprobs": res.logprobs,
                })),
            }),
        ),
    }
}
