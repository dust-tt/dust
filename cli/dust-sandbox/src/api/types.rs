use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxToolsResponse {
    pub server_views: Vec<MCPServerView>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPServerView {
    #[serde(rename = "sId")]
    pub s_id: String,
    pub space_id: String,
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
    pub tool_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<serde_json::Value>,
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
        #[allow(dead_code)]
        data: String,
        mime_type: String,
    },
    Audio {
        #[allow(dead_code)]
        data: String,
        mime_type: String,
    },
    Resource {
        resource: ResourceContent,
    },
    ResourceLink {
        uri: String,
        name: Option<String>,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceContent {
    pub uri: String,
    #[allow(dead_code)]
    pub mime_type: Option<String>,
    pub text: Option<String>,
    #[allow(dead_code)]
    pub blob: Option<String>,
}
