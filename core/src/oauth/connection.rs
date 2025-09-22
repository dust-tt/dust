use crate::oauth::{
    encryption::{seal_str, unseal_str},
    providers::{
        confluence::ConfluenceConnectionProvider,
        confluence_tools::ConfluenceToolsConnectionProvider,
        freshservice::FreshserviceConnectionProvider, github::GithubConnectionProvider,
        gmail::GmailConnectionProvider, gong::GongConnectionProvider,
        google_drive::GoogleDriveConnectionProvider, hubspot::HubspotConnectionProvider,
        intercom::IntercomConnectionProvider, jira::JiraConnectionProvider,
        mcp::MCPConnectionProvider, mcp_static::MCPStaticConnectionProvider,
        microsoft::MicrosoftConnectionProvider, microsoft_tools::MicrosoftToolsConnectionProvider,
        mock::MockConnectionProvider, monday::MondayConnectionProvider,
        notion::NotionConnectionProvider, salesforce::SalesforceConnectionProvider,
        slack::SlackConnectionProvider, zendesk::ZendeskConnectionProvider,
    },
    store::OAuthStore,
};
use crate::utils;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use rslock::LockManager;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::time::Duration;
use std::{env, fmt};
use tracing::{error, info};

use super::{credential::Credential, providers::utils::ProviderHttpRequestError};

// We hold the lock for at most 15s. In case of panic preventing the lock from being released, this
// is the maximum time the lock will be held.
static REDIS_LOCK_TTL_SECONDS: u64 = 15;
// To ensure we don't write without holding the lock providers must comply to this timeout when
// operating on tokens.
pub static PROVIDER_TIMEOUT_SECONDS: u64 = 10;
// Buffer of time in ms before the expiry of an access token within which we will attempt to
// refresh it.
pub static ACCESS_TOKEN_REFRESH_BUFFER_MILLIS: u64 = 10 * 60 * 1000;

pub static CONNECTION_ID_PREFIX: &str = "con";

lazy_static! {
    static ref REDIS_URI: String = env::var("REDIS_URI").unwrap();
}

// API Error types.

// Define the ErrorKind enum with serde attributes for serialization
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionErrorCode {
    TokenRevokedError,
    // Finalize
    ConnectionAlreadyFinalizedError,
    ProviderFinalizationError,
    // Refresh Access Token
    ConnectionNotFinalizedError,
    ProviderAccessTokenRefreshError,
    // Invalid Metadata
    InvalidMetadataError,
    // Internal Errors
    InternalError,
}

impl fmt::Display for ConnectionErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(&self).unwrap().trim_matches('"')
        )
    }
}

// Custom error type
#[derive(Debug)]
pub struct ConnectionError {
    pub code: ConnectionErrorCode,
    pub message: String,
}

impl fmt::Display for ConnectionError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for ConnectionError {}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionProvider {
    Confluence,
    ConfluenceTools,
    Freshservice,
    Github,
    Gong,
    GoogleDrive,
    Gmail,
    Intercom,
    Jira,
    Microsoft,
    MicrosoftTools,
    Monday,
    Notion,
    Slack,
    Mock,
    Zendesk,
    Salesforce,
    Hubspot,
    Mcp,
    McpStatic,
}

impl FromStr for ConnectionProvider {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match serde_json::from_str(&format!("\"{}\"", s)) {
            Ok(v) => Ok(v),
            Err(_) => Err(ParseError::new()),
        }
    }
}

impl fmt::Display for ConnectionProvider {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(&self).unwrap().trim_matches('"')
        )
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub struct FinalizeResult {
    pub redirect_uri: String,
    pub code: String,
    pub access_token: String,
    pub access_token_expiry: Option<u64>,
    pub refresh_token: Option<String>,
    pub raw_json: serde_json::Value,
    pub extra_metadata: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub struct RefreshResult {
    pub access_token: String,
    pub access_token_expiry: Option<u64>,
    pub refresh_token: Option<String>,
    // The provider is in charge of update the raw_json.
    pub raw_json: serde_json::Value,
}

#[async_trait]
pub trait Provider {
    fn id(&self) -> ConnectionProvider;

    fn reqwest_client(&self) -> reqwest::Client {
        if let (Ok(proxy_host), Ok(proxy_port), Ok(proxy_user_name), Ok(proxy_user_password)) = (
            env::var("PROXY_HOST"),
            env::var("PROXY_PORT"),
            env::var("PROXY_USER_NAME"),
            env::var("PROXY_USER_PASSWORD"),
        ) {
            match reqwest::Proxy::all(format!(
                "http://{}:{}@{}:{}",
                proxy_user_name, proxy_user_password, proxy_host, proxy_port
            )) {
                Ok(proxy) => match reqwest::Client::builder().proxy(proxy).build() {
                    Ok(client) => client,
                    Err(e) => {
                        error!(error = ?e, "Failed to create client with proxy");
                        reqwest::Client::new()
                    }
                },
                Err(e) => {
                    error!(error = ?e, "Failed to create proxy, falling back to no proxy");
                    reqwest::Client::new()
                }
            }
        } else {
            reqwest::Client::new()
        }
    }

    async fn finalize(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError>;

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError>;

    // This method scrubs raw_json to remove information that should not exfill `oauth`, in
    // particular the `refresh_token`. By convetion the `access_token` should be scrubbed as well
    // to prevent users from relying in the raw_json to access it.
    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value>;

    fn handle_provider_request_error(&self, error: ProviderHttpRequestError) -> ProviderError {
        self.default_handle_provider_request_error(error)
    }

    // Default implementation for handling errors.
    fn default_handle_provider_request_error(
        &self,
        error: ProviderHttpRequestError,
    ) -> ProviderError {
        match error {
            ProviderHttpRequestError::NetworkError(e) => ProviderError::UnknownError(e.to_string()),
            ProviderHttpRequestError::Timeout => ProviderError::TimeoutError,
            ProviderHttpRequestError::RequestFailed {
                provider,
                status,
                message,
            } => ProviderError::UnknownError(format!(
                "Request failed for provider {}. Status: {}. Message {}.",
                provider, status, message
            )),
            ProviderHttpRequestError::InvalidResponse(e) => {
                ProviderError::UnknownError(e.to_string())
            }
        }
    }
}

pub fn provider(t: ConnectionProvider) -> Box<dyn Provider + Sync + Send> {
    match t {
        ConnectionProvider::Confluence => Box::new(ConfluenceConnectionProvider::new()),
        ConnectionProvider::ConfluenceTools => Box::new(ConfluenceToolsConnectionProvider::new()),
        ConnectionProvider::Freshservice => Box::new(FreshserviceConnectionProvider::new()),
        ConnectionProvider::Github => Box::new(GithubConnectionProvider::new()),
        ConnectionProvider::Gong => Box::new(GongConnectionProvider::new()),
        ConnectionProvider::GoogleDrive => Box::new(GoogleDriveConnectionProvider::new()),
        ConnectionProvider::Gmail => Box::new(GmailConnectionProvider::new()),
        ConnectionProvider::Intercom => Box::new(IntercomConnectionProvider::new()),
        ConnectionProvider::Jira => Box::new(JiraConnectionProvider::new()),
        ConnectionProvider::Microsoft => Box::new(MicrosoftConnectionProvider::new()),
        ConnectionProvider::MicrosoftTools => Box::new(MicrosoftToolsConnectionProvider::new()),
        ConnectionProvider::Monday => Box::new(MondayConnectionProvider::new()),
        ConnectionProvider::Notion => Box::new(NotionConnectionProvider::new()),
        ConnectionProvider::Slack => Box::new(SlackConnectionProvider::new()),
        ConnectionProvider::Mock => Box::new(MockConnectionProvider::new()),
        ConnectionProvider::Zendesk => Box::new(ZendeskConnectionProvider::new()),
        ConnectionProvider::Salesforce => Box::new(SalesforceConnectionProvider::new()),
        ConnectionProvider::Hubspot => Box::new(HubspotConnectionProvider::new()),
        ConnectionProvider::Mcp => Box::new(MCPConnectionProvider::new()),
        // MCP Static is the same as MCP but does not require the discovery process on the front end.
        ConnectionProvider::McpStatic => Box::new(MCPStaticConnectionProvider::new()),
    }
}

// Internal Error types.

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("Action not supported: {0}.")]
    ActionNotSupportedError(String),
    #[error("Timeout error.")]
    TimeoutError,
    #[error("Unknown error: {0}.")]
    UnknownError(String),
    #[error("Internal error: {0}.")]
    InternalError(anyhow::Error),
    #[error("Token revoked.")]
    TokenRevokedError,
    #[error("Invalid metadata: {0}.")]
    InvalidMetadataError(String),
}

impl From<anyhow::Error> for ProviderError {
    fn from(error: anyhow::Error) -> Self {
        ProviderError::InternalError(error)
    }
}

impl ProviderError {
    pub fn to_finalization_error(&self) -> ConnectionError {
        match self {
            ProviderError::ActionNotSupportedError(_)
            | ProviderError::TimeoutError
            | ProviderError::UnknownError(_) => ConnectionError {
                code: ConnectionErrorCode::ProviderFinalizationError,
                message: self.to_string(),
            },
            ProviderError::TokenRevokedError => ConnectionError {
                code: ConnectionErrorCode::TokenRevokedError,
                message: self.to_string(),
            },
            ProviderError::InvalidMetadataError(_) => ConnectionError {
                code: ConnectionErrorCode::InvalidMetadataError,
                message: self.to_string(),
            },
            ProviderError::InternalError(_) => ConnectionError {
                code: ConnectionErrorCode::InternalError,
                message: "Failed to finalize connection.".to_string(),
            },
        }
    }

    pub fn to_access_token_error(&self) -> ConnectionError {
        match self {
            ProviderError::ActionNotSupportedError(_)
            | ProviderError::TimeoutError
            | ProviderError::UnknownError(_) => ConnectionError {
                code: ConnectionErrorCode::ProviderAccessTokenRefreshError,
                message: self.to_string(),
            },
            ProviderError::TokenRevokedError => ConnectionError {
                code: ConnectionErrorCode::TokenRevokedError,
                message: self.to_string(),
            },
            ProviderError::InvalidMetadataError(_) => ConnectionError {
                code: ConnectionErrorCode::InvalidMetadataError,
                message: self.to_string(),
            },
            ProviderError::InternalError(_) => ConnectionError {
                code: ConnectionErrorCode::InternalError,
                message: "Failed to refresh access token.".to_string(),
            },
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Pending,
    Finalized,
}

impl fmt::Display for ConnectionStatus {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(&self).unwrap().trim_matches('"')
        )
    }
}

impl FromStr for ConnectionStatus {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match serde_json::from_str(&format!("\"{}\"", s)) {
            Ok(v) => Ok(v),
            Err(_) => Err(ParseError::new()),
        }
    }
}

// Structure exceptionally used to migrate existing credentials at connection creation. The minimal
// set of required information is the `access_token` and the `raw_json`. The `access_token_expiry`
// is also "required in pinciple" but technically can be null for non-expiring acces tokens.
#[derive(Deserialize)]
pub struct MigratedCredentials {
    redirect_uri: String,
    access_token_expiry: Option<u64>,
    authorization_code: Option<String>,
    access_token: String,
    refresh_token: Option<String>,
    raw_json: serde_json::Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct Connection {
    connection_id: String,
    created: u64,
    provider: ConnectionProvider,
    status: ConnectionStatus,
    metadata: serde_json::Value,
    redirect_uri: Option<String>,
    encrypted_authorization_code: Option<Vec<u8>>,
    access_token_expiry: Option<u64>,
    encrypted_access_token: Option<Vec<u8>>,
    encrypted_refresh_token: Option<Vec<u8>>,
    encrypted_raw_json: Option<Vec<u8>>,
    related_credential_id: Option<String>,
}

impl Connection {
    pub fn new(
        connection_id: String,
        created: u64,
        provider: ConnectionProvider,
        status: ConnectionStatus,
        metadata: serde_json::Value,
        redirect_uri: Option<String>,
        encrypted_authorization_code: Option<Vec<u8>>,
        access_token_expiry: Option<u64>,
        encrypted_access_token: Option<Vec<u8>>,
        encrypted_refresh_token: Option<Vec<u8>>,
        encrypted_raw_json: Option<Vec<u8>>,
        related_credential_id: Option<String>,
    ) -> Self {
        Connection {
            connection_id,
            created,
            provider,
            status,
            metadata,
            redirect_uri,
            encrypted_authorization_code,
            access_token_expiry,
            encrypted_access_token,
            encrypted_refresh_token,
            encrypted_raw_json,
            related_credential_id,
        }
    }

    pub fn connection_id_from_row_id_and_secret(row_id: i64, secret: &str) -> Result<String> {
        Ok(format!(
            "{}-{}",
            utils::make_id(CONNECTION_ID_PREFIX, row_id as u64)?,
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

        if prefix != CONNECTION_ID_PREFIX {
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

    pub fn redirect_uri(&self) -> Option<String> {
        self.redirect_uri.clone()
    }

    pub fn encrypted_authorization_code(&self) -> Option<&Vec<u8>> {
        self.encrypted_authorization_code.as_ref()
    }

    pub fn unseal_authorization_code(&self) -> Result<Option<String>> {
        match &self.encrypted_authorization_code {
            Some(t) => Ok(Some(unseal_str(t)?)),
            None => Ok(None),
        }
    }

    pub fn access_token_expiry(&self) -> Option<u64> {
        self.access_token_expiry
    }

    pub fn encrypted_access_token(&self) -> Option<&Vec<u8>> {
        self.encrypted_access_token.as_ref()
    }

    pub fn unseal_access_token(&self) -> Result<Option<String>> {
        match &self.encrypted_access_token {
            Some(t) => Ok(Some(unseal_str(t)?)),
            None => Ok(None),
        }
    }

    pub fn encrypted_refresh_token(&self) -> Option<&Vec<u8>> {
        self.encrypted_refresh_token.as_ref()
    }

    pub fn unseal_refresh_token(&self) -> Result<Option<String>> {
        match &self.encrypted_refresh_token {
            Some(t) => Ok(Some(unseal_str(t)?)),
            None => Ok(None),
        }
    }

    pub fn encrypted_raw_json(&self) -> Option<&Vec<u8>> {
        self.encrypted_raw_json.as_ref()
    }

    pub fn unseal_raw_json(&self) -> Result<Option<serde_json::Value>> {
        match &self.encrypted_raw_json {
            Some(t) => Ok(Some(serde_json::from_str(&unseal_str(t)?)?)),
            None => Ok(None),
        }
    }

    pub fn related_credential_id(&self) -> Option<String> {
        self.related_credential_id.clone()
    }

    async fn reload(&mut self, store: Box<dyn OAuthStore + Sync + Send>) -> Result<()> {
        let connection = store
            .retrieve_connection_by_provider(self.provider, &self.connection_id)
            .await?;

        if let Some(connection) = connection {
            self.created = connection.created;
            self.provider = connection.provider;
            self.status = connection.status;
            self.metadata = connection.metadata;
            self.redirect_uri = connection.redirect_uri;
            self.encrypted_authorization_code = connection.encrypted_authorization_code;
            self.access_token_expiry = connection.access_token_expiry;
            self.encrypted_access_token = connection.encrypted_access_token;
            self.encrypted_refresh_token = connection.encrypted_refresh_token;
            self.encrypted_raw_json = connection.encrypted_raw_json;
            self.related_credential_id = connection.related_credential_id;
        } else {
            return Err(anyhow::anyhow!(
                "Connection not found in store while reloading",
            ));
        }
        Ok(())
    }

    pub async fn create(
        store: Box<dyn OAuthStore + Sync + Send>,
        provider: ConnectionProvider,
        metadata: serde_json::Value,
        migrated_credentials: Option<MigratedCredentials>,
        related_credential_id: Option<String>,
    ) -> Result<Self> {
        let mut c = store
            .create_connection(provider, metadata, related_credential_id)
            .await?;

        if let Some(creds) = migrated_credentials {
            c.redirect_uri = Some(creds.redirect_uri);
            c.access_token_expiry = creds.access_token_expiry;
            c.encrypted_access_token = Some(seal_str(&creds.access_token)?);
            c.encrypted_raw_json = Some(seal_str(&serde_json::to_string(&creds.raw_json)?)?);

            if let Some(code) = creds.authorization_code {
                c.encrypted_authorization_code = Some(seal_str(&code)?);
            }
            if let Some(token) = creds.refresh_token {
                c.encrypted_refresh_token = Some(seal_str(&token)?);
            }

            store.update_connection_secrets(&c).await?;

            // Finalize the connection as it's been created with migrated_credentials.
            c.status = ConnectionStatus::Finalized;
            store.update_connection_status(&c).await?;
        }

        Ok(c)
    }

    fn is_already_finalized(&self, code: &str) -> Result<bool, ConnectionError> {
        match self.status {
            // Pending is the expected status for a new connection.
            ConnectionStatus::Pending => Ok(false),
            // We allow calling finalized twice with the same code (user messes up or refresh).
            // Otherwise we error.
            ConnectionStatus::Finalized => {
                match self.unseal_authorization_code().map_err(|e| {
                    error!(error = ?e, "Failed to unseal authorization_code");
                    ConnectionError {
                        code: ConnectionErrorCode::InternalError,
                        message: "Failed to unseal authorization_code".to_string(),
                    }
                })? {
                    Some(c) => {
                        // If it's finalized and the code matches, we return early.
                        if c == code {
                            return Ok(true);
                        }
                        Err(ConnectionError {
                            code: ConnectionErrorCode::ConnectionAlreadyFinalizedError,
                            message: "Connection is already finalized with a different code"
                                .to_string(),
                        })?
                    }
                    // If we have a finalized connection without `authorization_code`, we error.
                    None => Err(ConnectionError {
                        code: ConnectionErrorCode::InternalError,
                        message: "Unexpected finalized connection without authorization_code"
                            .to_string(),
                    })?,
                }
            }
        }
    }

    async fn finalize_locked(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<()> {
        self.reload(store.clone()).await?;

        if self.is_already_finalized(code)? {
            info!("Connection already finalized with code");
            return Ok(());
        }
        info!("Finalizing connection with provider");

        let now = utils::now();

        let credential = match self.related_credential_id() {
            Some(id) => match store.retrieve_credential(&id).await {
                Err(_) => None,
                Ok(Some(credential)) => Some(credential),
                Ok(None) => None,
            },
            None => None,
        };

        let finalize = provider(self.provider)
            .finalize(self, credential, code, redirect_uri)
            .await?;

        self.status = ConnectionStatus::Finalized;
        store.update_connection_status(self).await?;

        self.redirect_uri = Some(finalize.redirect_uri);
        self.encrypted_authorization_code = Some(seal_str(&finalize.code)?);
        self.access_token_expiry = finalize.access_token_expiry;
        self.encrypted_access_token = Some(seal_str(&finalize.access_token)?);
        self.encrypted_refresh_token = match &finalize.refresh_token {
            Some(t) => Some(seal_str(t)?),
            None => None,
        };
        self.encrypted_raw_json = Some(seal_str(&serde_json::to_string(&finalize.raw_json)?)?);
        store.update_connection_secrets(self).await?;

        // If the provider has extra metadata, merge it with the connection metadata.
        if let Some(extra_metadata) = finalize.extra_metadata {
            let mut merged_metadata = match self.metadata.clone() {
                serde_json::Value::Object(map) => map,
                _ => Err(anyhow!("Invalid `metadata` stored on connection."))?,
            };
            for (key, value) in extra_metadata {
                merged_metadata.insert(key.clone(), value.clone());
            }
            self.metadata = serde_json::Value::Object(merged_metadata);
            store.update_connection_metadata(self).await?;
        }

        info!(
            connection_id = self.connection_id(),
            provider = self.provider.to_string(),
            access_token_expiry = self.access_token_expiry,
            provider_finalize_duration = utils::now() - now,
            "Successful connection finalization"
        );

        Ok(())
    }

    pub async fn finalize(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<(), ConnectionError> {
        if self.is_already_finalized(code)? {
            return Ok(());
        }

        info!(
            connection_id = self.connection_id(),
            provider = self.provider.to_string(),
            "Finalizing connection",
        );

        let now = utils::now();
        let rl = LockManager::new(vec![REDIS_URI.clone()]);

        let lock = rl
            .acquire_no_guard(
                format!("oauth:{}", self.connection_id()).as_bytes(),
                Duration::from_secs(REDIS_LOCK_TTL_SECONDS),
            )
            .await
            .map_err(|e| {
                error!(error = ?e, "Failed to acquire lock");
                ConnectionError {
                    code: ConnectionErrorCode::InternalError,
                    message: "Failed to acquire lock".to_string(),
                }
            })?;
        info!(
            lock_acquisition_duration = utils::now() - now,
            "Lock acquired"
        );

        let res = self.finalize_locked(store, code, redirect_uri).await;

        rl.unlock(&lock).await;

        match res {
            Ok(_) => Ok(()),
            Err(e) => {
                error!(
                    error = ?e,
                    provider = ?self.provider,
                    "Failed to finalize connection",
                );

                if let Some(provider_error) = e.downcast_ref::<ProviderError>() {
                    Err(provider_error.to_finalization_error())
                } else {
                    Err(ConnectionError {
                        code: ConnectionErrorCode::InternalError,
                        message: "Failed to finalize connection with provider".to_string(),
                    })
                }
            }
        }
    }

    fn valid_access_token(&self) -> Result<Option<String>, ConnectionError> {
        let access_token = match &self.encrypted_access_token {
            Some(t) => unseal_str(t).map_err(|e| {
                error!(error = ?e, "Failed to unseal access_token");
                ConnectionError {
                    code: ConnectionErrorCode::InternalError,
                    message: "Failed to unseal access_token".to_string(),
                }
            })?,
            None => Err(ConnectionError {
                code: ConnectionErrorCode::InternalError,
                message: "Missing access_token in connection".to_string(),
            })?,
        };

        match self.access_token_expiry {
            Some(expiry) => {
                if expiry - ACCESS_TOKEN_REFRESH_BUFFER_MILLIS > utils::now() {
                    // Access token is not expired and not within the buffer to refresh.
                    Ok(Some(access_token))
                } else {
                    // Access token expired.
                    Ok(None)
                }
            }
            // Access token with no expiry.
            None => Ok(Some(access_token)),
        }
    }

    fn scrubbed_raw_json(&self) -> Result<Option<serde_json::Value>> {
        match self.unseal_raw_json()? {
            Some(raw_json) => Ok(Some(provider(self.provider).scrubbed_raw_json(&raw_json)?)),
            None => Ok(None),
        }
    }

    async fn access_token_locked(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
    ) -> Result<(String, Option<serde_json::Value>)> {
        self.reload(store.clone()).await?;

        // If we refreshed while waiting for the lock return early.
        if let Some(access_token) = self.valid_access_token()? {
            info!(
                access_token_expiry = self.access_token_expiry,
                "Found refreshed access token after lock acquisition",
            );
            return Ok((access_token, self.scrubbed_raw_json()?));
        }
        info!("Refreshing access token with provider");

        let now = utils::now();

        let credential = match self.related_credential_id() {
            Some(id) => match store.retrieve_credential(&id).await {
                Err(_) => None,
                Ok(Some(credential)) => Some(credential),
                Ok(None) => None,
            },
            None => None,
        };

        let refresh = provider(self.provider).refresh(self, credential).await?;

        self.access_token_expiry = refresh.access_token_expiry;
        self.encrypted_access_token = Some(seal_str(&refresh.access_token)?);
        self.encrypted_refresh_token = match &refresh.refresh_token {
            Some(t) => Some(seal_str(t)?),
            None => None,
        };
        self.encrypted_raw_json = Some(seal_str(&serde_json::to_string(&refresh.raw_json)?)?);
        store.update_connection_secrets(self).await?;

        info!(
            connection_id = self.connection_id(),
            provider = self.provider.to_string(),
            access_token_expiry = self.access_token_expiry,
            provider_refresh_duration = utils::now() - now,
            "Successful access token refresh"
        );

        Ok((refresh.access_token, self.scrubbed_raw_json()?))
    }

    pub async fn access_token(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
    ) -> Result<(String, Option<serde_json::Value>), ConnectionError> {
        if self.status != ConnectionStatus::Finalized {
            return Err(ConnectionError {
                code: ConnectionErrorCode::ConnectionNotFinalizedError,
                message: "Connection is not finalized".to_string(),
            });
        }
        if let Some(access_token) = self.valid_access_token()? {
            return Ok((
                access_token,
                self.scrubbed_raw_json().map_err(|e| {
                    error!(error = ?e, "Failed to retrieve and scrub raw_json");
                    ConnectionError {
                        code: ConnectionErrorCode::InternalError,
                        message: "Failed to retrieve and scrub raw_json".to_string(),
                    }
                })?,
            ));
        }

        info!(
            connection_id = self.connection_id(),
            provider = self.provider.to_string(),
            access_token_expiry = self.access_token_expiry,
            "Refreshing access token",
        );

        let now = utils::now();
        let rl = LockManager::new(vec![REDIS_URI.clone()]);

        let lock = rl
            .acquire_no_guard(
                format!("oauth:{}", self.connection_id()).as_bytes(),
                Duration::from_secs(REDIS_LOCK_TTL_SECONDS),
            )
            .await
            .map_err(|e| {
                error!(error = ?e, "Failed to acquire lock");
                ConnectionError {
                    code: ConnectionErrorCode::InternalError,
                    message: "Failed to acquire lock".to_string(),
                }
            })?;
        info!(
            lock_acquisition_duration = utils::now() - now,
            "Lock acquired"
        );

        let res = self.access_token_locked(store).await;

        rl.unlock(&lock).await;

        match res {
            Ok(t) => Ok(t),
            Err(e) => {
                error!(
                    error = ?e,
                    provider = ?self.provider,
                    "Failed to refresh access token",
                );

                if let Some(provider_error) = e.downcast_ref::<ProviderError>() {
                    Err(provider_error.to_access_token_error())
                } else {
                    Err(ConnectionError {
                        code: ConnectionErrorCode::InternalError,
                        message: "Failed to refresh access token with provider".to_string(),
                    })
                }
            }
        }
    }
}
