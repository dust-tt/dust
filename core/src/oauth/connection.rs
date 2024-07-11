use crate::oauth::store::OAuthStore;
use crate::utils;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionProvider {
    Notion,
    Slack,
    GoogleDrive,
    Intercom,
    Confluence,
    Github,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Pending,
    Finalized,
}

#[derive(Debug, Serialize, Clone)]
pub struct Connection {
    connection_id: String,
    created: u64,
    provider: ConnectionProvider,
    status: ConnectionStatus,
    metadata: serde_json::Value,
    authorization_code: Option<String>,
    access_token: Option<String>,
    access_token_expiry: Option<u64>,
    refresh_token: Option<String>,
    raw_json: Option<serde_json::Value>,
}

impl Connection {
    pub fn new(
        connection_id: String,
        created: u64,
        provider: ConnectionProvider,
        status: ConnectionStatus,
        metadata: serde_json::Value,
    ) -> Self {
        Connection {
            connection_id,
            created,
            provider,
            status,
            metadata,
            authorization_code: None,
            access_token: None,
            access_token_expiry: None,
            refresh_token: None,
            raw_json: None,
        }
    }

    pub fn connection_id_from_row_id_and_secret(row_id: i64, secret: &str) -> Result<String> {
        Ok(format!(
            "{}-{}",
            utils::make_id("con", row_id as u64)?,
            secret
        ))
    }

    pub fn connection_id(&self) -> String {
        self.connection_id.clone()
    }

    pub fn created(&self) -> u64 {
        self.created
    }

    pub fn provider(&self) -> ConnectionProvider {
        self.provider
    }

    pub fn status(&self) -> ConnectionStatus {
        self.status
    }

    pub fn metadata(&self) -> &serde_json::Value {
        &self.metadata
    }

    pub async fn create(
        store: Box<dyn OAuthStore + Sync + Send>,
        provider: ConnectionProvider,
        metadata: serde_json::Value,
    ) -> Result<Self> {
        store.create_connection(provider, metadata).await
    }
}
