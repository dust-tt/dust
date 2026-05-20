use std::io::IsTerminal;
use std::time::{Duration, Instant};

use anyhow::{bail, Context};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{de::DeserializeOwned, Serialize};
use tokio::time::sleep;

use super::types::{
    parse_action_poll_response, ActionPollResponse, CallToolPostResponse, CallToolRequest,
    CallToolResponse, CallToolResult, MCPServerView, SandboxServerViewsResponse,
};

const POLL_INTERVAL: Duration = Duration::from_millis(500);
// Hard cap so a wedged action can't pin the CLI forever.
const POLL_MAX_DURATION: Duration = Duration::from_secs(10 * 60);
const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";
const API_URL_ENV: &str = "DUST_API_URL";

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
            .timeout(HTTP_REQUEST_TIMEOUT)
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
        let resp: SandboxServerViewsResponse = self.get("sandbox/actions", &query).await?;
        Ok(resp.server_views)
    }

    async fn get_action_status(&self, action_id: &str) -> anyhow::Result<ActionPollResponse> {
        let path = format!("sandbox/actions/{action_id}");
        let url = self.url(&path);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .context(format!("GET {url}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .context(format!("failed to read response from GET {url}"))?;

        match parse_action_poll_response(&body) {
            Ok(poll) => Ok(poll),
            Err(parse_err) if status.is_success() => Err(parse_err)
                .with_context(|| format!("GET {url} (status {status}) returned unparseable body")),
            Err(_) => bail!("GET {url} returned {status}: {body}"),
        }
    }

    async fn poll_action_result(&self, action_id: &str) -> anyhow::Result<CallToolResponse> {
        let deadline = Instant::now() + POLL_MAX_DURATION;
        let mut announced = false;
        loop {
            match self.get_action_status(action_id).await? {
                ActionPollResponse::Pending => {
                    if Instant::now() >= deadline {
                        bail!(
                            "timed out waiting for action {action_id} after {} seconds",
                            POLL_MAX_DURATION.as_secs()
                        );
                    }
                    if !announced && std::io::stderr().is_terminal() {
                        eprintln!("waiting on action {action_id}...");
                        announced = true;
                    }
                    sleep(POLL_INTERVAL).await;
                }
                ActionPollResponse::Rejected => {
                    bail!("action {action_id} was rejected");
                }
                ActionPollResponse::Success { content, is_error } => {
                    return Ok(CallToolResponse {
                        result: CallToolResult { content, is_error },
                    });
                }
            }
        }
    }

    pub async fn call_tool(
        &self,
        view_id: &str,
        tool_name: &str,
        arguments: Option<serde_json::Value>,
    ) -> anyhow::Result<CallToolResponse> {
        let body = CallToolRequest {
            server_view_id: view_id.to_string(),
            tool_name: tool_name.to_string(),
            arguments,
        };
        let CallToolPostResponse::Pending { action_id } =
            self.post("sandbox/actions/call", &body).await?;

        self.poll_action_result(&action_id).await
    }
}
