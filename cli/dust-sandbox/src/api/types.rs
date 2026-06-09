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
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum CallToolPostResponse {
    Pending { action_id: String },
}

#[derive(Debug)]
pub enum ActionPollResponse {
    Pending,
    Rejected,
    Success {
        // Raw blocks; the plain-text formatter parses them lazily so JSON
        // mode can emit unknown block types verbatim.
        content: Vec<serde_json::Value>,
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
            let content = action.output.unwrap_or_default();
            Ok(ActionPollResponse::Success { content, is_error })
        }
    }
}

pub fn parse_content_block(value: &serde_json::Value) -> ContentBlock {
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

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallToolResult {
    pub content: Vec<serde_json::Value>,
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
                assert_eq!(content[0]["type"], "text");
                assert_eq!(content[0]["text"], "hello");
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
    fn parse_call_tool_post_response_pending() {
        let resp: CallToolPostResponse =
            serde_json::from_str(r#"{"status":"pending","actionId":"act_abc"}"#)
                .expect("should parse");
        let CallToolPostResponse::Pending { action_id } = resp;
        assert_eq!(action_id, "act_abc");
    }

    #[test]
    fn parse_error_envelope_bails() {
        let err = parse_action_poll_response(
            r#"{"error":{"type":"not_authenticated","message":"bad token"}}"#,
        )
        .unwrap_err();
        assert!(err.to_string().contains("bad token"));
    }

    #[test]
    fn call_tool_result_serializes_with_camelcase() {
        let result = CallToolResult {
            content: vec![serde_json::json!({"type": "text", "text": "hello"})],
            is_error: false,
        };

        let value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&result).expect("should serialize"))
                .expect("should round-trip");

        assert_eq!(value["isError"], false);
        assert!(value.get("is_error").is_none());
        assert_eq!(value["content"][0]["type"], "text");
        assert_eq!(value["content"][0]["text"], "hello");
    }

    #[test]
    fn call_tool_result_preserves_unknown_block_types_when_serialized() {
        let result = CallToolResult {
            content: vec![serde_json::json!({
                "type": "future_block",
                "payload": {"k": 1}
            })],
            is_error: true,
        };

        let value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&result).expect("should serialize"))
                .expect("should round-trip");

        assert_eq!(value["isError"], true);
        assert_eq!(value["content"][0]["type"], "future_block");
        assert_eq!(value["content"][0]["payload"]["k"], 1);
    }
}
