use anyhow::{bail, Context};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{de::DeserializeOwned, Serialize};

use crate::auth::{decode_jwt_claims, SandboxClaims, SANDBOX_TOKEN_ENV};

use super::types::{
    CallToolRequest, CallToolResponse, MCPServerView, MCPServerViewsResponse, Space, SpacesResponse,
};

const DEFAULT_API_URL: &str = "https://dust.tt";
const API_URL_ENV: &str = "DUST_API_URL";

pub struct DustApiClient {
    client: reqwest::Client,
    base_url: String,
    claims: SandboxClaims,
}

/// A resolved server: the view sId, the space sId, and the server metadata.
pub struct ResolvedServer {
    pub view_s_id: String,
    pub space_s_id: String,
    pub server: super::types::MCPServer,
}

impl DustApiClient {
    pub fn from_env() -> anyhow::Result<Self> {
        let token =
            std::env::var(SANDBOX_TOKEN_ENV).context(format!("{SANDBOX_TOKEN_ENV} is not set"))?;

        if token.is_empty() {
            bail!("{SANDBOX_TOKEN_ENV} is empty");
        }

        let claims = decode_jwt_claims(&token)?;

        let base_url = std::env::var(API_URL_ENV).unwrap_or_else(|_| DEFAULT_API_URL.to_string());

        let mut headers = HeaderMap::new();
        let auth_value = HeaderValue::from_str(&format!("Bearer {token}"))
            .context("invalid token for header")?;
        headers.insert(AUTHORIZATION, auth_value);
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .context("failed to build HTTP client")?;

        Ok(Self {
            client,
            base_url,
            claims,
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}/api/v1/w/{}/{}", self.base_url, self.claims.w_id, path)
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> anyhow::Result<T> {
        let url = self.url(path);
        let resp = self
            .client
            .get(&url)
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

    pub async fn list_spaces(&self) -> anyhow::Result<Vec<Space>> {
        let resp: SpacesResponse = self.get("spaces").await?;
        Ok(resp.spaces)
    }

    pub async fn list_server_views(&self, space_id: &str) -> anyhow::Result<Vec<MCPServerView>> {
        let resp: MCPServerViewsResponse = self
            .get(&format!(
                "spaces/{space_id}/mcp_server_views?includeAuto=true"
            ))
            .await?;
        Ok(resp.server_views)
    }

    pub async fn call_tool(
        &self,
        space_id: &str,
        view_id: &str,
        tool_name: &str,
        arguments: Option<serde_json::Value>,
    ) -> anyhow::Result<CallToolResponse> {
        let body = CallToolRequest {
            tool_name: tool_name.to_string(),
            arguments,
        };
        self.post(
            &format!("spaces/{space_id}/mcp_server_views/{view_id}/call_tool"),
            &body,
        )
        .await
    }

    /// Find a server by name across all spaces. Returns the view sId, space sId,
    /// and the server metadata.
    pub async fn find_server(&self, name: &str) -> anyhow::Result<ResolvedServer> {
        let spaces = self.list_spaces().await?;

        for space in &spaces {
            let views = self.list_server_views(&space.s_id).await?;
            for view in views {
                if view.server.name == name {
                    return Ok(ResolvedServer {
                        view_s_id: view.s_id,
                        space_s_id: space.s_id.clone(),
                        server: view.server,
                    });
                }
            }
        }

        bail!("server '{name}' not found")
    }
}
