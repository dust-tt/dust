use crate::oauth::{
    providers::{
        confluence::ConfluenceConnectionProvider, github::GithubConnectionProvider,
        google_drive::GoogleDriveConnectionProvider, notion::NotionConnectionProvider,
        slack::SlackConnectionProvider,
    },
    store::OAuthStore,
};
use crate::utils;
use crate::utils::ParseError;
use anyhow::Result;
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use ring::{
    aead,
    rand::{self, SecureRandom},
};
use rslock::LockManager;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::time::Duration;
use std::{env, fmt};
use tracing::{error, info};

// We hold the lock for at most 15s. In case of panic preventing the lock from being released, this
// is the maximum time the lock will be held.
static REDIS_LOCK_TTL_SECONDS: u64 = 15;
// To ensure we don't write without holding the lock providers must comply to this timeout when
// operating on tokens.
pub static PROVIDER_TIMEOUT_SECONDS: u64 = 10;

lazy_static! {
    static ref REDIS_URI: String = env::var("REDIS_URI").unwrap();
    static ref ENCRYPTION_KEY: aead::LessSafeKey = {
        let encoded_key = env::var("OAUTH_ENCRYPTION_KEY").unwrap();
        let key_bytes = general_purpose::STANDARD.decode(&encoded_key).unwrap();
        let unbound_key = aead::UnboundKey::new(&aead::CHACHA20_POLY1305, &key_bytes).unwrap();
        aead::LessSafeKey::new(unbound_key)
    };
}

// Define the ErrorKind enum with serde attributes for serialization
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionErrorCode {
    // Finalize
    ConnectionAlreadyFinalizedError,
    ProviderFinalizationError,
    // Refresh Access Token
    ConnectionNotFinalizedError,
    ProviderAccessTokenRefreshError,
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
    Github,
    GoogleDrive,
    Intercom,
    Notion,
    Slack,
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

    async fn finalize(
        &self,
        connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult>;

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult>;

    // This method scrubs raw_json to remove information that should not exfill `oauth`, in
    // particular the `refresh_token`. By convetion the `access_token` should be scrubbed as well
    // to prevent users from relying in the raw_json to access it.
    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value>;
}

pub fn provider(t: ConnectionProvider) -> Box<dyn Provider + Sync + Send> {
    match t {
        ConnectionProvider::Confluence => Box::new(ConfluenceConnectionProvider::new()),
        ConnectionProvider::Github => Box::new(GithubConnectionProvider::new()),
        ConnectionProvider::GoogleDrive => Box::new(GoogleDriveConnectionProvider::new()),
        ConnectionProvider::Intercom => unimplemented!(),
        ConnectionProvider::Notion => Box::new(NotionConnectionProvider::new()),
        ConnectionProvider::Slack => Box::new(SlackConnectionProvider::new()),
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

    pub fn redirect_uri(&self) -> Option<String> {
        self.redirect_uri.clone()
    }

    pub fn encrypted_authorization_code(&self) -> Option<&Vec<u8>> {
        self.encrypted_authorization_code.as_ref()
    }

    pub fn unseal_authorization_code(&self) -> Result<Option<String>> {
        match &self.encrypted_authorization_code {
            Some(t) => Ok(Some(Connection::unseal_str(t)?)),
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
            Some(t) => Ok(Some(Connection::unseal_str(t)?)),
            None => Ok(None),
        }
    }

    pub fn encrypted_refresh_token(&self) -> Option<&Vec<u8>> {
        self.encrypted_refresh_token.as_ref()
    }

    pub fn unseal_refresh_token(&self) -> Result<Option<String>> {
        match &self.encrypted_refresh_token {
            Some(t) => Ok(Some(Connection::unseal_str(t)?)),
            None => Ok(None),
        }
    }

    pub fn encrypted_raw_json(&self) -> Option<&Vec<u8>> {
        self.encrypted_raw_json.as_ref()
    }

    pub fn unseal_raw_json(&self) -> Result<Option<serde_json::Value>> {
        match &self.encrypted_raw_json {
            Some(t) => Ok(Some(serde_json::from_str(&Connection::unseal_str(t)?)?)),
            None => Ok(None),
        }
    }

    fn seal_str(s: &str) -> Result<Vec<u8>> {
        let key = &ENCRYPTION_KEY;
        let rng = rand::SystemRandom::new();

        let mut nonce_bytes = [0u8; aead::NONCE_LEN];
        rng.fill(&mut nonce_bytes)
            .map_err(|_| anyhow::anyhow!("Nonce generation failed"))?;
        let nonce = aead::Nonce::assume_unique_for_key(nonce_bytes);

        let mut combined = nonce.as_ref().to_vec();

        let mut in_out = s.as_bytes().to_vec();
        let tag = key
            .seal_in_place_separate_tag(nonce, aead::Aad::empty(), &mut in_out)
            .map_err(|_| anyhow::anyhow!("Encryption failed"))?;

        combined.append(&mut in_out);
        combined.extend_from_slice(tag.as_ref());

        Ok(combined)
    }

    fn unseal_str(encrypted_data: &[u8]) -> Result<String> {
        let key = &ENCRYPTION_KEY;

        let nonce_bytes = &encrypted_data[0..aead::NONCE_LEN];
        let ciphertext_and_tag = &encrypted_data[aead::NONCE_LEN..];

        let nonce = aead::Nonce::try_assume_unique_for_key(nonce_bytes)
            .map_err(|_| anyhow::anyhow!("Invalid nonce"))?;
        let mut in_out = ciphertext_and_tag.to_vec();

        key.open_in_place(nonce, aead::Aad::empty(), &mut in_out)
            .map_err(|_| anyhow::anyhow!("Decryption failed"))?;

        Ok(String::from_utf8(
            in_out[0..(in_out.len() - aead::CHACHA20_POLY1305.tag_len())].to_vec(),
        )?)
    }

    async fn reload(&mut self, store: Box<dyn OAuthStore + Sync + Send>) -> Result<()> {
        let connection = store
            .retrieve_connection(self.provider, &self.connection_id)
            .await?;

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

        Ok(())
    }

    pub async fn create(
        store: Box<dyn OAuthStore + Sync + Send>,
        provider: ConnectionProvider,
        metadata: serde_json::Value,
        migrated_credentials: Option<MigratedCredentials>,
    ) -> Result<Self> {
        let mut c = store.create_connection(provider, metadata).await?;

        if let Some(creds) = migrated_credentials {
            c.access_token_expiry = creds.access_token_expiry;
            c.encrypted_access_token = Some(Connection::seal_str(&creds.access_token)?);
            c.encrypted_raw_json = Some(Connection::seal_str(&serde_json::to_string(
                &creds.raw_json,
            )?)?);

            if let Some(code) = creds.authorization_code {
                c.encrypted_authorization_code = Some(Connection::seal_str(&code)?);
            }
            if let Some(token) = creds.refresh_token {
                c.encrypted_refresh_token = Some(Connection::seal_str(&token)?);
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

        let finalize = provider(self.provider)
            .finalize(self, code, redirect_uri)
            .await?;

        self.status = ConnectionStatus::Finalized;
        store.update_connection_status(self).await?;

        self.redirect_uri = Some(finalize.redirect_uri);
        self.encrypted_authorization_code = Some(Connection::seal_str(&finalize.code)?);
        self.access_token_expiry = finalize.access_token_expiry;
        self.encrypted_access_token = Some(Connection::seal_str(&finalize.access_token)?);
        self.encrypted_refresh_token = match &finalize.refresh_token {
            Some(t) => Some(Connection::seal_str(t)?),
            None => None,
        };
        self.encrypted_raw_json = Some(Connection::seal_str(&serde_json::to_string(
            &finalize.raw_json,
        )?)?);
        store.update_connection_secrets(self).await?;

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
                Err(ConnectionError {
                    code: ConnectionErrorCode::ProviderFinalizationError,
                    message: "Failed to finalize connection with provider".to_string(),
                })
            }
        }
    }

    fn valid_access_token(&self) -> Result<Option<String>, ConnectionError> {
        let access_token = match &self.encrypted_access_token {
            Some(t) => Connection::unseal_str(t).map_err(|e| {
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
                if expiry > utils::now() {
                    // Non-expired access_token.
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

        let refresh = provider(self.provider).refresh(self).await?;

        self.access_token_expiry = refresh.access_token_expiry;
        self.encrypted_access_token = Some(Connection::seal_str(&refresh.access_token)?);
        self.encrypted_refresh_token = match &refresh.refresh_token {
            Some(t) => Some(Connection::seal_str(t)?),
            None => None,
        };
        self.encrypted_raw_json = Some(Connection::seal_str(&serde_json::to_string(
            &refresh.raw_json,
        )?)?);
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
                Err(ConnectionError {
                    code: ConnectionErrorCode::ProviderFinalizationError,
                    message: "Failed to refresh access token with provider".to_string(),
                })
            }
        }
    }
}
