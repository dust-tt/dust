use crate::oauth::{providers::github::GithubConnectionProvider, store::OAuthStore};
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionProvider {
    Confluence,
    Github,
    GoogleDrive,
    Intercom,
    Notion,
    Slack,
}

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub struct FinalizeResult {
    code: String,
    access_token: String,
    access_token_expiry: Option<u64>,
    refresh_token: Option<String>,
    raw_json: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub struct RefreshResult {
    access_token: String,
    access_token_expiry: Option<u64>,
    refresh_token: Option<String>,
}

#[async_trait]
pub trait Provider {
    fn id(&self) -> ConnectionProvider;

    async fn finalize(&self, connection: &Connection, code: &str) -> Result<FinalizeResult>;
    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult>;
}

pub fn provider(t: ConnectionProvider) -> Box<dyn Provider + Sync + Send> {
    match t {
        ConnectionProvider::Confluence => unimplemented!(),
        ConnectionProvider::Github => Box::new(GithubConnectionProvider::new()),
        ConnectionProvider::GoogleDrive => unimplemented!(),
        ConnectionProvider::Intercom => unimplemented!(),
        ConnectionProvider::Notion => unimplemented!(),
        ConnectionProvider::Slack => unimplemented!(),
    }
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
        authorization_code: Option<String>,
        access_token: Option<String>,
        access_token_expiry: Option<u64>,
        refresh_token: Option<String>,
        raw_json: Option<serde_json::Value>,
    ) -> Self {
        Connection {
            connection_id,
            created,
            provider,
            status,
            metadata,
            authorization_code,
            access_token,
            access_token_expiry,
            refresh_token,
            raw_json,
        }
    }

    pub fn connection_id_from_row_id_and_secret(row_id: i64, secret: &str) -> Result<String> {
        Ok(format!(
            "{}-{}",
            utils::make_id("con", row_id as u64)?,
            secret
        ))
    }

    pub fn row_id_and_secret_from_connection_id(connection_id: &str) -> Result<(i64, String)> {
        let parts = connection_id.split('-').collect::<Vec<&str>>();
        if parts.len() != 2 {
            return Err(anyhow::anyhow!(
                "Invalid connection_id format: {}",
                connection_id
            ));
        }
        let (prefix, row_id) = utils::parse_id(parts[0])?;
        let secret = parts[1].to_string();

        if prefix != "con" {
            return Err(anyhow::anyhow!(
                "Invalid connection_id prefix: {}",
                connection_id
            ));
        }

        Ok((row_id as i64, secret))
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

    pub async fn finalize(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
        code: &str,
    ) -> Result<()> {
        println!(
            "Finalize for {}/{}",
            serde_json::to_string(&self.provider)?,
            self.connection_id
        );

        // let finalize = provider(self.provider).finalize(self, code).await?;

        // TODO(spolu): implement store

        Ok(())
    }
}
