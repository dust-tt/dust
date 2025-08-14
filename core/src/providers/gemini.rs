use super::{
    chat_messages::{
        AssistantChatMessage, AssistantContentItem, ChatMessage, ContentBlock, MixedContent,
        ReasoningContent,
    },
    embedder::Embedder,
    helpers::{fetch_and_encode_images_from_messages, Base64EncodedImageContent},
    llm::{
        ChatFunction, ChatFunctionCall, ChatMessageRole, LLMChatGeneration, LLMGeneration,
        LLMTokenUsage, LLM,
    },
    provider::{Provider, ProviderID},
    tiktoken::tiktoken::{
        batch_tokenize_async, cl100k_base_singleton, decode_async, encode_async, CoreBPE,
    },
};
use crate::{run::Credentials, utils};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

// Gemini API types

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiContent {
    parts: Vec<GeminiPart>,
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    inline_data: Option<GeminiInlineData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    function_call: Option<GeminiFunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    function_response: Option<GeminiFunctionResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thought: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiInlineData {
    mime_type: String,
    data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeminiFunctionCall {
    name: String,
    args: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiFunctionResponse {
    name: String,
    response: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_sequences: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_mime_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiThinkingConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_budget: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    include_thoughts: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiTool {
    function_declarations: Vec<GeminiFunctionDeclaration>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiFunctionDeclaration {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiToolConfig {
    function_calling_config: GeminiFunctionCallingConfig,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiFunctionCallingConfig {
    mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    allowed_function_names: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_config: Option<GeminiThinkingConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GeminiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_config: Option<GeminiToolConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    usage_metadata: Option<GeminiUsageMetadata>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiCandidate {
    content: GeminiContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    finish_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    citation_metadata: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    avg_logprobs: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiUsageMetadata {
    prompt_token_count: u64,
    candidates_token_count: u64,
    total_token_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    cached_content_token_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiStreamChunk {
    candidates: Vec<GeminiCandidate>,
    #[serde(rename = "usageMetadata")]
    #[serde(skip_serializing_if = "Option::is_none")]
    usage_metadata: Option<GeminiUsageMetadata>,
}

pub struct GeminiProvider {}

impl GeminiProvider {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl Provider for GeminiProvider {
    fn id(&self) -> ProviderID {
        ProviderID::GoogleAiStudio
    }

    fn setup(&self) -> Result<()> {
        utils::info("You cannot setup Gemini from the CLI, sorry.");
        Ok(())
    }

    async fn test(&self) -> Result<()> {
        Err(anyhow!("You cannot test Gemini from the CLI, sorry."))
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(GeminiLLM::new(id))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}

pub struct GeminiLLM {
    id: String,
    api_key: Option<String>,
}

impl GeminiLLM {
    pub fn new(id: String) -> Self {
        Self { id, api_key: None }
    }

    fn api_base(&self) -> String {
        "https://generativelanguage.googleapis.com/v1beta".to_string()
    }

    fn model_endpoint(&self, streaming: bool) -> String {
        let method = if streaming {
            "streamGenerateContent"
        } else {
            "generateContent"
        };
        format!("{}/models/{}:{}", self.api_base(), self.id, method)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        // TODO: use countTokens API
        cl100k_base_singleton()
    }

    async fn convert_messages_to_gemini(
        &self,
        messages: &Vec<ChatMessage>,
    ) -> Result<(Option<GeminiContent>, Vec<GeminiContent>)> {
        let base64_map = fetch_and_encode_images_from_messages(messages).await?;

        let mut system_instruction = None;
        let mut contents = Vec::new();

        for msg in messages {
            let role = match &msg {
                ChatMessage::System(_) => {
                    // Extract system message for separate handling
                    if let ChatMessage::System(sys_msg) = msg {
                        system_instruction = Some(GeminiContent {
                            parts: vec![GeminiPart {
                                text: Some(sys_msg.content.clone()),
                                inline_data: None,
                                function_call: None,
                                function_response: None,
                                thought: None,
                            }],
                            role: None,
                        });
                    }
                    continue;
                }
                ChatMessage::User(_) => "user",
                ChatMessage::Assistant(_) => "model",
                ChatMessage::Function(_) => "function",
            };

            let parts = match msg {
                ChatMessage::User(user_msg) => {
                    self.convert_content_block_to_parts(&user_msg.content, &base64_map)?
                }
                ChatMessage::Assistant(assistant_msg) => {
                    let mut parts = Vec::new();

                    if let Some(ref content) = assistant_msg.content {
                        parts.push(GeminiPart {
                            text: Some(content.clone()),
                            inline_data: None,
                            function_call: None,
                            function_response: None,
                            thought: None,
                        });
                    }

                    if let Some(ref function_calls) = assistant_msg.function_calls {
                        for call in function_calls {
                            parts.push(GeminiPart {
                                text: None,
                                inline_data: None,
                                function_call: Some(GeminiFunctionCall {
                                    name: call.name.clone(),
                                    args: serde_json::from_str(&call.arguments)?,
                                }),
                                function_response: None,
                                thought: None,
                            });
                        }
                    }

                    parts
                }
                ChatMessage::Function(func_msg) => {
                    let content_str = match &func_msg.content {
                        ContentBlock::Text(text) => text.clone(),
                        ContentBlock::Mixed(mixed) => mixed
                            .iter()
                            .map(|mc| match mc {
                                MixedContent::TextContent(tc) => tc.text.clone(),
                                MixedContent::ImageContent(ic) => ic.image_url.url.clone(),
                            })
                            .collect::<Vec<String>>()
                            .join("\n"),
                    };
                    vec![GeminiPart {
                        text: None,
                        inline_data: None,
                        function_call: None,
                        function_response: Some(GeminiFunctionResponse {
                            name: func_msg.function_call_id.clone(),
                            response: serde_json::from_str(&content_str)
                                .unwrap_or(serde_json::json!({"content": content_str})),
                        }),
                        thought: None,
                    }]
                }
                _ => continue,
            };

            contents.push(GeminiContent {
                parts,
                role: Some(role.to_string()),
            });
        }

        Ok((system_instruction, contents))
    }

    fn convert_content_block_to_parts(
        &self,
        content: &ContentBlock,
        base64_map: &std::collections::HashMap<String, Base64EncodedImageContent>,
    ) -> Result<Vec<GeminiPart>> {
        let mut parts = Vec::new();

        match content {
            ContentBlock::Text(text) => {
                parts.push(GeminiPart {
                    text: Some(text.clone()),
                    inline_data: None,
                    function_call: None,
                    function_response: None,
                    thought: None,
                });
            }
            ContentBlock::Mixed(mixed_content) => {
                for mc in mixed_content {
                    match mc {
                        MixedContent::TextContent(tc) => {
                            parts.push(GeminiPart {
                                text: Some(tc.text.clone()),
                                inline_data: None,
                                function_call: None,
                                function_response: None,
                                thought: None,
                            });
                        }
                        MixedContent::ImageContent(ic) => {
                            if let Some(base64_data) = base64_map.get(&ic.image_url.url) {
                                parts.push(GeminiPart {
                                    text: None,
                                    inline_data: Some(GeminiInlineData {
                                        mime_type: base64_data.media_type.clone(),
                                        data: base64_data.data.clone(),
                                    }),
                                    function_call: None,
                                    function_response: None,
                                    thought: None,
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(parts)
    }

    fn convert_functions_to_tools(&self, functions: &Vec<ChatFunction>) -> Vec<GeminiTool> {
        if functions.is_empty() {
            return Vec::new();
        }

        vec![GeminiTool {
            function_declarations: functions
                .iter()
                .map(|f| GeminiFunctionDeclaration {
                    name: f.name.clone(),
                    description: f.description.clone(),
                    parameters: f.parameters.clone(),
                })
                .collect(),
        }]
    }

    async fn execute_request(
        &self,
        request: GeminiRequest,
        streaming: bool,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<GeminiResponse> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow!("GOOGLE_AI_STUDIO_API_KEY is not set"))?;

        let url = format!("{}?key={}", self.model_endpoint(streaming), api_key);

        let client = reqwest::Client::new();
        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Gemini API error: {}", error_text));
        }

        if streaming && event_sender.is_some() {
            self.handle_streaming_response(response, event_sender).await
        } else {
            let gemini_response: GeminiResponse = response.json().await?;
            Ok(gemini_response)
        }
    }

    async fn handle_streaming_response(
        &self,
        response: reqwest::Response,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<GeminiResponse> {
        let mut accumulated_content = String::new();
        let mut accumulated_thoughts = String::new();
        let mut function_calls = Vec::new();
        let mut usage_metadata = None;
        let mut finish_reason = None;

        let mut stream = response.bytes_stream();
        use futures::StreamExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            // Parse SSE-style data
            for line in text.lines() {
                if line.starts_with("data: ") {
                    let json_str = &line[6..];
                    if let Ok(chunk_data) = serde_json::from_str::<GeminiStreamChunk>(json_str) {
                        if let Some(candidate) = chunk_data.candidates.first() {
                            for part in &candidate.content.parts {
                                if let Some(ref text) = part.text {
                                    if part.thought.unwrap_or(false) {
                                        accumulated_thoughts.push_str(text);
                                    } else {
                                        accumulated_content.push_str(text);

                                        // Send streaming event
                                        if let Some(ref sender) = event_sender {
                                            let _ = sender.send(json!({
                                                "type": "tokens",
                                                "content": {
                                                    "text": text,
                                                },
                                            }));
                                        }
                                    }
                                }

                                if let Some(ref func_call) = part.function_call {
                                    function_calls.push(func_call.clone());
                                }
                            }

                            if let Some(ref reason) = candidate.finish_reason {
                                finish_reason = Some(reason.clone());
                            }
                        }

                        if let Some(metadata) = chunk_data.usage_metadata {
                            usage_metadata = Some(metadata);
                        }
                    }
                }
            }
        }

        // Send thought summary if we have thoughts
        if !accumulated_thoughts.is_empty() {
            if let Some(ref sender) = event_sender {
                let _ = sender.send(json!({
                    "type": "reasoning",
                    "content": {
                        "reasoning": accumulated_thoughts,
                        "metadata": "gemini_thinking"
                    }
                }));
            }
        }

        // Build final response
        let mut parts = Vec::new();
        if !accumulated_content.is_empty() {
            parts.push(GeminiPart {
                text: Some(accumulated_content),
                inline_data: None,
                function_call: None,
                function_response: None,
                thought: None,
            });
        }

        for func_call in function_calls {
            parts.push(GeminiPart {
                text: None,
                inline_data: None,
                function_call: Some(func_call.clone()),
                function_response: None,
                thought: None,
            });
        }

        Ok(GeminiResponse {
            candidates: vec![GeminiCandidate {
                content: GeminiContent {
                    parts,
                    role: Some("model".to_string()),
                },
                finish_reason,
                citation_metadata: None,
                avg_logprobs: None,
            }],
            usage_metadata,
        })
    }

    fn convert_gemini_to_chat_generation(
        &self,
        response: GeminiResponse,
    ) -> Result<LLMChatGeneration> {
        let candidate = response
            .candidates
            .first()
            .ok_or_else(|| anyhow!("No candidates in Gemini response"))?;

        let mut content = String::new();
        let mut function_calls = Vec::new();
        let mut reasoning_content = String::new();
        let mut contents = Vec::new();

        for part in &candidate.content.parts {
            if let Some(ref text) = part.text {
                if part.thought.unwrap_or(false) {
                    reasoning_content.push_str(text);
                } else {
                    content.push_str(text);
                }
            }

            if let Some(ref func_call) = part.function_call {
                function_calls.push(ChatFunctionCall {
                    id: format!("fc_{}", utils::new_id()[0..9].to_string()),
                    name: func_call.name.clone(),
                    arguments: func_call.args.to_string(),
                });
            }
        }

        // Build contents array
        if !content.is_empty() {
            contents.push(AssistantContentItem::TextContent {
                value: content.clone(),
            });
        }

        for func_call in &function_calls {
            contents.push(AssistantContentItem::FunctionCall {
                value: func_call.clone(),
            });
        }

        if !reasoning_content.is_empty() {
            contents.push(AssistantContentItem::Reasoning {
                value: ReasoningContent {
                    reasoning: Some(reasoning_content),
                    metadata: "gemini_thinking".to_string(),
                },
            });
        }

        let usage = response.usage_metadata.map(|metadata| LLMTokenUsage {
            prompt_tokens: metadata.prompt_token_count,
            completion_tokens: metadata.candidates_token_count,
            reasoning_tokens: metadata.cached_content_token_count,
        });

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleAiStudio.to_string(),
            model: self.id.clone(),
            completions: vec![AssistantChatMessage {
                content: if content.is_empty() {
                    None
                } else {
                    Some(content)
                },
                function_calls: if function_calls.is_empty() {
                    None
                } else {
                    Some(function_calls)
                },
                function_call: None,
                role: ChatMessageRole::Assistant,
                name: None,
                contents: if contents.is_empty() {
                    None
                } else {
                    Some(contents)
                },
            }],
            usage,
            provider_request_id: None,
            logprobs: None,
        })
    }
}

#[async_trait]
impl LLM for GeminiLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("GOOGLE_AI_STUDIO_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => Err(anyhow!("GOOGLE_AI_STUDIO_API_KEY not found in credentials"))?,
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        // Gemini 2.0 models support up to 1M tokens
        1_000_000
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(self.tokenizer(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(self.tokenizer(), tokens).await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        batch_tokenize_async(self.tokenizer(), texts).await
    }

    async fn generate(
        &self,
        _prompt: &str,
        _max_tokens: Option<i32>,
        _temperature: f32,
        _n: usize,
        _stop: &Vec<String>,
        _presence_penalty: Option<f32>,
        _frequency_penalty: Option<f32>,
        _top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        unimplemented!()
    }

    async fn chat(
        &self,
        messages: &Vec<ChatMessage>,
        functions: &Vec<ChatFunction>,
        function_call: Option<String>,
        temperature: f32,
        top_p: Option<f32>,
        n: usize,
        stop: &Vec<String>,
        max_tokens: Option<i32>,
        _presence_penalty: Option<f32>,
        _frequency_penalty: Option<f32>,
        _logprobs: Option<bool>,
        _top_logprobs: Option<i32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        if n != 1 {
            return Err(anyhow!("Gemini only supports n=1"));
        }

        let (system_instruction, contents) = self.convert_messages_to_gemini(messages).await?;

        let tools = self.convert_functions_to_tools(functions);

        let tool_config = if !functions.is_empty() {
            let mode = match function_call.as_deref() {
                Some("none") => "NONE",
                Some("auto") => "AUTO",
                Some(_) => "ANY",
                None => "AUTO",
            };

            let allowed_names = if mode == "ANY" {
                function_call.map(|name| vec![name])
            } else {
                None
            };

            Some(GeminiToolConfig {
                function_calling_config: GeminiFunctionCallingConfig {
                    mode: mode.to_string(),
                    allowed_function_names: allowed_names,
                },
            })
        } else {
            None
        };

        // Extract thinking config from extras
        let thinking_config = extras.as_ref().and_then(|e| {
            let thinking_budget = e
                .get("thinking_budget")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32);
            let include_thoughts = e.get("include_thoughts").and_then(|v| v.as_bool());

            if thinking_budget.is_some() || include_thoughts.is_some() {
                Some(GeminiThinkingConfig {
                    thinking_budget,
                    include_thoughts,
                })
            } else {
                None
            }
        });

        let request = GeminiRequest {
            contents,
            system_instruction,
            generation_config: Some(GeminiGenerationConfig {
                temperature: Some(temperature),
                top_p,
                top_k: None,
                max_output_tokens: max_tokens,
                stop_sequences: if stop.is_empty() {
                    None
                } else {
                    Some(stop.clone())
                },
                response_mime_type: None,
            }),
            thinking_config,
            tools: if tools.is_empty() { None } else { Some(tools) },
            tool_config,
        };

        let streaming = event_sender.is_some();
        let response = self
            .execute_request(request, streaming, event_sender)
            .await?;

        self.convert_gemini_to_chat_generation(response)
    }
}
