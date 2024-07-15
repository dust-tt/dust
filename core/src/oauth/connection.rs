use crate::oauth::{providers::github::GithubConnectionProvider, store::OAuthStore};
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

// We hold the lock for at most 15s. In case of panic preventing the lock from being released, this
// is the maximum time the lock will be held.
static REDIS_LOCK_TTL_SECONDS: u64 = 15;
// To ensure we don't write without holding the lock providers must comply to this timeout when
// operating on tokens.
pub static PROVIDER_TIMEOUT_SECONDS: u64 = 10;

lazy_static! {
    static ref REDIS_URI: String = env::var("REDIS_URI").unwrap();
}

lazy_static! {
    static ref ENCRYPTION_KEY: aead::LessSafeKey = {
        let encoded_key = env::var("OAUTH_ENCRYPTION_KEY").unwrap();
        let key_bytes = general_purpose::STANDARD.decode(&encoded_key).unwrap();
        let unbound_key = aead::UnboundKey::new(&aead::CHACHA20_POLY1305, &key_bytes).unwrap();
        aead::LessSafeKey::new(unbound_key)
    };
}

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
        write!(f, "{}", serde_json::to_string(&self).unwrap())
    }
}

impl FromStr for ConnectionProvider {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match serde_json::from_str(s) {
            Ok(v) => Ok(v),
            Err(_) => Err(ParseError::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub struct FinalizeResult {
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

impl fmt::Display for ConnectionStatus {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", serde_json::to_string(&self).unwrap())
    }
}

impl FromStr for ConnectionStatus {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match serde_json::from_str(s) {
            Ok(v) => Ok(v),
            Err(_) => Err(ParseError::new()),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct Connection {
    connection_id: String,
    created: u64,
    provider: ConnectionProvider,
    status: ConnectionStatus,
    metadata: serde_json::Value,
    access_token_expiry: Option<u64>,
    encrypted_authorization_code: Option<Vec<u8>>,
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
        access_token_expiry: Option<u64>,
        encrypted_authorization_code: Option<Vec<u8>>,
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
            access_token_expiry,
            encrypted_authorization_code,
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

    pub fn access_token_expiry(&self) -> Option<u64> {
        self.access_token_expiry
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
        self.access_token_expiry = connection.access_token_expiry;
        self.encrypted_authorization_code = connection.encrypted_authorization_code;
        self.encrypted_access_token = connection.encrypted_access_token;
        self.encrypted_refresh_token = connection.encrypted_refresh_token;
        self.encrypted_raw_json = connection.encrypted_raw_json;

        Ok(())
    }

    pub async fn create(
        store: Box<dyn OAuthStore + Sync + Send>,
        provider: ConnectionProvider,
        metadata: serde_json::Value,
    ) -> Result<Self> {
        store.create_connection(provider, metadata).await
    }

    fn is_already_finalized(&self, code: &str) -> Result<bool> {
        match self.status {
            // Pending is the expected status for a new connection.
            ConnectionStatus::Pending => Ok(false),
            // We allow calling finalized twice with the same code (user messes up or refresh).
            // Otherwise we error.
            ConnectionStatus::Finalized => match self.unseal_authorization_code()? {
                Some(c) => {
                    // If it's finalized and the code matches, we return early.
                    if c == code {
                        return Ok(true);
                    }
                    Err(anyhow::anyhow!("Connection is already finalized"))?
                }
                // If we have a finalized connection without `authorization_code`, we error.
                None => Err(anyhow::anyhow!(
                    "Unexpected connection without `authorization_code`"
                ))?,
            },
        }
    }

    async fn finalize_locked(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
        code: &str,
    ) -> Result<()> {
        self.reload(store.clone()).await?;

        if self.is_already_finalized(code)? {
            return Ok(());
        }

        let finalize = provider(self.provider).finalize(self, code).await?;

        self.status = ConnectionStatus::Finalized;
        store.update_connection_status(self).await?;

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

        Ok(())
    }

    pub async fn finalize(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
        code: &str,
    ) -> Result<()> {
        if self.is_already_finalized(code)? {
            return Ok(());
        }

        let rl = LockManager::new(vec![REDIS_URI.clone()]);

        let lock = rl
            .acquire_no_guard(
                format!("oauth:{}", self.connection_id()).as_bytes(),
                Duration::from_secs(REDIS_LOCK_TTL_SECONDS),
            )
            .await?;
        let res = self.finalize_locked(store, code).await;
        rl.unlock(&lock).await;

        res
    }

    fn valid_access_token(&self) -> Result<Option<String>> {
        let access_token = match &self.encrypted_access_token {
            Some(t) => Connection::unseal_str(t)?,
            None => Err(anyhow::anyhow!("Missing access_token in connection"))?,
        };

        match self.access_token_expiry {
            Some(expiry) => {
                if expiry < utils::now() {
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

    async fn access_token_locked(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
    ) -> Result<String> {
        self.reload(store.clone()).await?;

        // If we refreshed while waiting for the lock return early.
        if let Some(access_token) = self.valid_access_token()? {
            return Ok(access_token);
        }

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

        Ok(refresh.access_token)
    }

    pub async fn access_token(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
    ) -> Result<String> {
        if let Some(access_token) = self.valid_access_token()? {
            return Ok(access_token);
        }

        let rl = LockManager::new(vec![REDIS_URI.clone()]);

        let lock = rl
            .acquire_no_guard(
                format!("oauth:{}", self.connection_id()).as_bytes(),
                Duration::from_secs(REDIS_LOCK_TTL_SECONDS),
            )
            .await?;
        let res = self.access_token_locked(store).await;
        rl.unlock(&lock).await;

        res
    }
}
