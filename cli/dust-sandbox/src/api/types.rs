use std::io::IsTerminal;

use anyhow::Context;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxServerViewsResponse {
    pub server_views: Vec<MCPServerView>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPServerView {
    #[serde(rename = "sId")]
    pub s_id: String,
    pub server: MCPServer,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPServer {
    #[serde(rename = "sId")]
    pub s_id: String,
    pub name: String,
    pub tools: Vec<MCPTool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPTool {
    pub name: String,
    pub description: String,
    pub input_schema: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallToolRequest {
    pub server_view_id: String,
    pub tool_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CallToolPostResponse {
    Pending { action_id: String },
}

#[derive(Debug)]
pub enum ActionPollResponse {
    Pending,
    Rejected,
    Success {
        content: Vec<ContentBlock>,
        is_error: bool,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum ActionPollResponseRaw {
    Pending,
    Rejected,
    Success { action: ActionData },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionData {
    status: String,
    #[serde(default)]
    output: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorEnvelope {
    error: ApiErrorBody,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    #[serde(default)]
    message: Option<String>,
}

pub fn parse_action_poll_response(body: &str) -> anyhow::Result<ActionPollResponse> {
    if let Ok(envelope) = serde_json::from_str::<ApiErrorEnvelope>(body) {
        let message = envelope
            .error
            .message
            .as_deref()
            .unwrap_or("unknown API error");
        anyhow::bail!("API error: {message}");
    }

    let raw: ActionPollResponseRaw = serde_json::from_str(body)
        .with_context(|| format!("failed to parse poll response: {body}"))?;

    match raw {
        ActionPollResponseRaw::Pending => Ok(ActionPollResponse::Pending),
        ActionPollResponseRaw::Rejected => Ok(ActionPollResponse::Rejected),
        ActionPollResponseRaw::Success { action } => {
            let is_error = action.status == "errored";
            let content = action
                .output
                .unwrap_or_default()
                .iter()
                .map(parse_content_block)
                .collect();
            Ok(ActionPollResponse::Success { content, is_error })
        }
    }
}

fn parse_content_block(value: &serde_json::Value) -> ContentBlock {
    match serde_json::from_value::<ContentBlock>(value.clone()) {
        Ok(block) => block,
        Err(err) => {
            if std::io::stderr().is_terminal() {
                eprintln!("[warning] unrecognized content block, ignoring: {err}");
            }
            ContentBlock::Unknown
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CallToolResponse {
    pub result: CallToolResult,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallToolResult {
    pub content: Vec<ContentBlock>,
    pub is_error: bool,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ContentBlock {
    Text {
        text: String,
    },
    Image {
        #[serde(default)]
        #[allow(dead_code)]
        data: String,
        #[serde(default = "default_mime_type")]
        mime_type: String,
    },
    Audio {
        #[serde(default)]
        #[allow(dead_code)]
        data: String,
        #[serde(default = "default_mime_type")]
        mime_type: String,
    },
    Resource {
        resource: ResourceContent,
    },
    ResourceLink {
        #[serde(default)]
        uri: String,
        name: Option<String>,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceContent {
    #[serde(default)]
    pub uri: String,
    #[allow(dead_code)]
    pub mime_type: Option<String>,
    pub text: Option<String>,
    #[allow(dead_code)]
    pub blob: Option<String>,
}

fn default_mime_type() -> String {
    "application/octet-stream".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_pending_poll_response() {
        let resp = parse_action_poll_response(r#"{"status":"pending"}"#).expect("should parse");
        assert!(matches!(resp, ActionPollResponse::Pending));
    }

    #[test]
    fn parse_rejected_poll_response() {
        let resp = parse_action_poll_response(r#"{"status":"rejected"}"#).expect("should parse");
        assert!(matches!(resp, ActionPollResponse::Rejected));
    }

    #[test]
    fn parse_success_poll_response() {
        let resp = parse_action_poll_response(
            r#"{
                "status":"success",
                "action":{
                    "status":"succeeded",
                    "output":[{"type":"text","text":"hello"}]
                }
            }"#,
        )
        .expect("should parse");
        match resp {
            ActionPollResponse::Success { content, is_error } => {
                assert!(!is_error);
                assert_eq!(content.len(), 1);
            }
            _ => panic!("expected success"),
        }
    }

    #[test]
    fn parse_errored_action() {
        let resp = parse_action_poll_response(
            r#"{
                "status":"success",
                "action":{"status":"errored","output":[{"type":"text","text":"boom"}]}
            }"#,
        )
        .expect("should parse");
        match resp {
            ActionPollResponse::Success { is_error, .. } => assert!(is_error),
            _ => panic!("expected success"),
        }
    }

    #[test]
    fn parse_error_envelope_bails() {
        let err = parse_action_poll_response(
            r#"{"error":{"type":"not_authenticated","message":"bad token"}}"#,
        )
        .unwrap_err();
        assert!(err.to_string().contains("bad token"));
    }
}
