use std::io::IsTerminal;

use anyhow::Context;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameCallByIdRequest<'a> {
    pub function_name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<&'a serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameCallFromSourceRequest<'a> {
    pub source_path: &'a str,
    pub function_name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<&'a serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameCallResponse {
    pub frame_id: String,
    pub function_name: String,
    pub result: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FramePublishRequest<'a> {
    pub manifest_path: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameRegisterRequest<'a> {
    pub manifest_path: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameValidateRequest<'a> {
    pub manifest_path: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameMoveRequest<'a> {
    pub source_directory_path: &'a str,
    pub destination_directory_path: &'a str,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FramePublishResponse {
    pub frame_id: String,
    pub manifest_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publication_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameRegisterResponse {
    pub frame_id: String,
    pub manifest_path: String,
    pub created: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameValidateResponse {
    pub frame_id: String,
    pub manifest_path: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameMoveResponse {
    pub frame_id: String,
    pub destination_directory_path: String,
    pub source_deletion_failed: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameShareLinkResponse {
    pub frame_id: String,
    pub share_scope: String,
    pub share_url: String,
    pub source_directory_path: String,
}

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
        // Machine-readable payload of the tool result, when the tool
        // provided one. Passed through verbatim.
        structured_content: Option<serde_json::Value>,
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
    #[serde(default)]
    structured_content: Option<serde_json::Value>,
}

pub fn parse_action_poll_response(body: &str) -> anyhow::Result<ActionPollResponse> {
    // A body shaped like front's `{"error":{...}}` envelope is an API error
    // regardless of HTTP status; surface it typed so callers can classify.
    if let Some(api_error) = super::error::DustApiError::parse_envelope(None, body) {
        return Err(api_error.into());
    }

    let raw: ActionPollResponseRaw = serde_json::from_str(body)
        .with_context(|| format!("failed to parse poll response: {body}"))?;

    match raw {
        ActionPollResponseRaw::Pending => Ok(ActionPollResponse::Pending),
        ActionPollResponseRaw::Rejected => Ok(ActionPollResponse::Rejected),
        ActionPollResponseRaw::Success { action } => {
            let is_error = action.status == "errored";
            let content = action.output.unwrap_or_default();
            let structured_content = action.structured_content;
            Ok(ActionPollResponse::Success {
                content,
                structured_content,
                is_error,
            })
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
    // Machine-readable payload of the tool result, when the tool provided
    // one. Omitted from `--json` output when absent so existing consumers see
    // unchanged output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_content: Option<serde_json::Value>,
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
            ActionPollResponse::Success {
                content,
                structured_content,
                is_error,
            } => {
                assert!(!is_error);
                assert_eq!(content.len(), 1);
                assert_eq!(content[0]["type"], "text");
                assert_eq!(content[0]["text"], "hello");
                assert!(structured_content.is_none());
            }
            _ => panic!("expected success"),
        }
    }

    #[test]
    fn parse_success_poll_response_with_structured_content() {
        let resp = parse_action_poll_response(
            r#"{
                "status":"success",
                "action":{
                    "status":"succeeded",
                    "output":[{"type":"text","text":"hello"}],
                    "structuredContent":{"items":[{"id":1}],"nextCursor":"abc"}
                }
            }"#,
        )
        .expect("should parse");
        match resp {
            ActionPollResponse::Success {
                structured_content, ..
            } => {
                let structured = structured_content.expect("should carry structuredContent");
                assert_eq!(structured["items"][0]["id"], 1);
                assert_eq!(structured["nextCursor"], "abc");
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
        // The envelope surfaces typed so the poll loop treats it as terminal
        // and `--json` consumers get a classified error.
        let api_error = err
            .downcast_ref::<super::super::error::DustApiError>()
            .expect("should carry a DustApiError");
        assert_eq!(api_error.message, "bad token");
    }

    #[test]
    fn call_tool_result_serializes_with_camelcase() {
        let result = CallToolResult {
            content: vec![serde_json::json!({"type": "text", "text": "hello"})],
            structured_content: None,
            is_error: false,
        };

        let value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&result).expect("should serialize"))
                .expect("should round-trip");

        assert_eq!(value["isError"], false);
        assert!(value.get("is_error").is_none());
        assert_eq!(value["content"][0]["type"], "text");
        assert_eq!(value["content"][0]["text"], "hello");
        // Absent structuredContent is omitted so existing `--json` consumers
        // see unchanged output.
        assert!(value.get("structuredContent").is_none());
        assert!(value.get("structured_content").is_none());
    }

    #[test]
    fn call_tool_result_serializes_structured_content_with_camelcase() {
        let result = CallToolResult {
            content: vec![serde_json::json!({"type": "text", "text": "hello"})],
            structured_content: Some(serde_json::json!({"items": [1, 2], "nextCursor": "abc"})),
            is_error: false,
        };

        let value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&result).expect("should serialize"))
                .expect("should round-trip");

        assert_eq!(value["structuredContent"]["items"][1], 2);
        assert_eq!(value["structuredContent"]["nextCursor"], "abc");
        assert!(value.get("structured_content").is_none());
    }

    #[test]
    fn call_tool_result_preserves_block_meta_offload_descriptor() {
        // Offloaded tool outputs carry a machine-readable descriptor in the block's `_meta`
        // (key "tt.dust/offload"); the CLI must pass it through verbatim so in-sandbox
        // consumers can resolve the full content.
        let poll_body = r#"{
            "status":"success",
            "action":{
                "status":"succeeded",
                "output":[{
                    "type":"resource",
                    "resource":{"uri":"pod-x/.tool_outputs/fn/1_tool.json","mimeType":"text/plain","text":"snippet"},
                    "_meta":{"tt.dust/offload":{"fullContentPath":"pod-x/.tool_outputs/fn/1_tool.json","totalBytes":123456,"contentType":"application/json"}}
                }]
            }
        }"#;
        let resp = parse_action_poll_response(poll_body).expect("should parse");
        let content = match resp {
            ActionPollResponse::Success { content, .. } => content,
            _ => panic!("expected success"),
        };

        let result = CallToolResult {
            content,
            structured_content: None,
            is_error: false,
        };
        let value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&result).expect("should serialize"))
                .expect("should round-trip");

        let descriptor = &value["content"][0]["_meta"]["tt.dust/offload"];
        assert_eq!(
            descriptor["fullContentPath"],
            "pod-x/.tool_outputs/fn/1_tool.json"
        );
        assert_eq!(descriptor["totalBytes"], 123456);
        assert_eq!(descriptor["contentType"], "application/json");
    }

    #[test]
    fn call_tool_result_preserves_unknown_block_types_when_serialized() {
        let result = CallToolResult {
            content: vec![serde_json::json!({
                "type": "future_block",
                "payload": {"k": 1}
            })],
            structured_content: None,
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
