use crate::oauth::store::OAuthStore;
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
    secret: String,
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
        secret: String,
    ) -> Self {
        Connection {
            connection_id,
            created,
            provider,
            status,
            secret,
            authorization_code: None,
            access_token: None,
            access_token_expiry: None,
            refresh_token: None,
            raw_json: None,
        }
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

    pub fn secret(&self) -> String {
        self.secret.clone()
    }

    pub async fn create(
        store: Box<dyn OAuthStore + Sync + Send>,
        provider: ConnectionProvider,
    ) -> Result<Self> {
        store.create_connection(provider).await
    }
}
