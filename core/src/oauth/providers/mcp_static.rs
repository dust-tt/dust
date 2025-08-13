use crate::oauth::{
    connection::{ConnectionProvider, Provider},
    providers::mcp::MCPConnectionProvider,
};
use async_trait::async_trait;

pub struct MCPStaticConnectionProvider {
    inner: MCPConnectionProvider,
}

impl MCPStaticConnectionProvider {
    pub fn new() -> Self {
        MCPStaticConnectionProvider {
            inner: MCPConnectionProvider::new(),
        }
    }
}

#[async_trait]
impl Provider for MCPStaticConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::McpStatic
    }

    fn reqwest_client(&self) -> reqwest::Client {
        self.inner.reqwest_client()
    }

    async fn finalize(
        &self,
        connection: &crate::oauth::connection::Connection,
        related_credentials: Option<crate::oauth::credential::Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<crate::oauth::connection::FinalizeResult, crate::oauth::connection::ProviderError>
    {
        self.inner
            .finalize(connection, related_credentials, code, redirect_uri)
            .await
    }

    async fn refresh(
        &self,
        connection: &crate::oauth::connection::Connection,
        related_credentials: Option<crate::oauth::credential::Credential>,
    ) -> Result<crate::oauth::connection::RefreshResult, crate::oauth::connection::ProviderError>
    {
        self.inner.refresh(connection, related_credentials).await
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> anyhow::Result<serde_json::Value> {
        self.inner.scrubbed_raw_json(raw_json)
    }

    fn handle_provider_request_error(
        &self,
        error: crate::oauth::providers::utils::ProviderHttpRequestError,
    ) -> crate::oauth::connection::ProviderError {
        self.inner.handle_provider_request_error(error)
    }
}
