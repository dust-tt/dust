use anyhow::{bail, Context};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{de::DeserializeOwned, Serialize};

use super::types::{
    ApprovalStatus, ApprovalStatusResponse, CallToolPendingResponse, CallToolRequest,
    CallToolResponse, MCPServerView, SandboxToolsResponse,
};

const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";
const API_URL_ENV: &str = "DUST_API_URL";
const APPROVAL_TIMEOUT_ENV: &str = "DUST_APPROVAL_TIMEOUT_SECONDS";
const DEFAULT_APPROVAL_TIMEOUT_SECONDS: u64 = 600;

pub struct DustApiClient {
    client: reqwest::Client,
    base_url: String,
}

impl DustApiClient {
    pub fn from_env() -> anyhow::Result<Self> {
        let token =
            std::env::var(SANDBOX_TOKEN_ENV).context(format!("{SANDBOX_TOKEN_ENV} is not set"))?;

        if token.is_empty() {
            bail!("{SANDBOX_TOKEN_ENV} is empty");
        }

        let base_url = std::env::var(API_URL_ENV).context(format!("{API_URL_ENV} is not set"))?;

        let mut headers = HeaderMap::new();
        let auth_value = HeaderValue::from_str(&format!("Bearer {token}"))
            .context("invalid token for header")?;
        headers.insert(AUTHORIZATION, auth_value);
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .context("failed to build HTTP client")?;

        Ok(Self { client, base_url })
    }

    fn url(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path)
    }

    async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> anyhow::Result<T> {
        let url = self.url(path);
        let resp = self
            .client
            .get(&url)
            .query(query)
            .send()
            .await
            .context(format!("GET {url}"))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            bail!("GET {url} returned {status}: {body}");
        }

        resp.json::<T>()
            .await
            .context(format!("failed to parse response from GET {url}"))
    }

    async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> anyhow::Result<T> {
        let url = self.url(path);
        let resp = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .context(format!("POST {url}"))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            bail!("POST {url} returned {status}: {body}");
        }

        resp.json::<T>()
            .await
            .context(format!("failed to parse response from POST {url}"))
    }

    pub async fn list_tools(
        &self,
        server: Option<&str>,
        light: bool,
    ) -> anyhow::Result<Vec<MCPServerView>> {
        let mut query: Vec<(&str, &str)> = Vec::new();
        if let Some(s) = server {
            query.push(("server", s));
        }
        if light {
            query.push(("light", "true"));
        }
        let resp: SandboxToolsResponse = self.get("sandbox/tools", &query).await?;
        Ok(resp.server_views)
    }

    async fn post_raw<B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> anyhow::Result<(reqwest::StatusCode, String)> {
        let url = self.url(path);
        let resp = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .context(format!("POST {url}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .context(format!("failed to read response from POST {url}"))?;

        Ok((status, body))
    }

    pub async fn call_tool(
        &self,
        space_id: &str,
        view_id: &str,
        tool_name: &str,
        arguments: Option<serde_json::Value>,
    ) -> anyhow::Result<CallToolResponse> {
        let call_tool_path = format!("spaces/{space_id}/mcp_server_views/{view_id}/call_tool");

        let body = CallToolRequest {
            tool_name: tool_name.to_string(),
            arguments: arguments.clone(),
        };

        let (status, body_text) = self.post_raw(&call_tool_path, &body).await?;

        if status == reqwest::StatusCode::OK {
            return serde_json::from_str::<CallToolResponse>(&body_text)
                .context("failed to parse 200 response");
        }

        if status == reqwest::StatusCode::ACCEPTED {
            let pending: CallToolPendingResponse =
                serde_json::from_str(&body_text).context("failed to parse 202 response")?;

            eprintln!("Waiting for tool approval...");

            let timeout_seconds: u64 = std::env::var(APPROVAL_TIMEOUT_ENV)
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(DEFAULT_APPROVAL_TIMEOUT_SECONDS);

            let start = std::time::Instant::now();
            loop {
                if start.elapsed().as_secs() >= timeout_seconds {
                    bail!("Tool approval timed out after {timeout_seconds}s");
                }

                tokio::time::sleep(std::time::Duration::from_secs(2)).await;

                // Poll the same call_tool endpoint via GET with ?actionId=...
                let poll_result: ApprovalStatusResponse = self
                    .get(&call_tool_path, &[("actionId", &pending.action_id)])
                    .await?;

                match poll_result.status {
                    ApprovalStatus::Approved => {
                        // Re-POST with actionId to execute the tool.
                        let mut re_post_body = serde_json::json!({
                            "toolName": tool_name,
                            "actionId": pending.action_id,
                        });
                        if let Some(args) = &arguments {
                            re_post_body["arguments"] = args.clone();
                        }
                        return self.post(&call_tool_path, &re_post_body).await;
                    }
                    ApprovalStatus::Rejected => {
                        bail!("Tool execution was rejected by the user");
                    }
                    ApprovalStatus::Error => {
                        bail!("Tool approval encountered an error");
                    }
                    ApprovalStatus::Pending => {
                        // Continue polling.
                    }
                }
            }
        }

        bail!("POST call_tool returned {status}: {body_text}");
    }
}
