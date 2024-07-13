use crate::oauth::{providers::github::GithubConnectionProvider, store::OAuthStore};
use crate::utils;
use crate::utils::ParseError;
use anyhow::Result;
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use ring::aead::NONCE_LEN;
use ring::{
    aead,
    rand::{self, SecureRandom},
};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::{env, fmt};

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

    pub fn encrypted_access_token(&self) -> Option<&Vec<u8>> {
        self.encrypted_access_token.as_ref()
    }

    pub fn encrypted_refresh_token(&self) -> Option<&Vec<u8>> {
        self.encrypted_refresh_token.as_ref()
    }

    pub fn encrypted_raw_json(&self) -> Option<&Vec<u8>> {
        self.encrypted_raw_json.as_ref()
    }

    fn seal_str(s: &str) -> Result<Vec<u8>> {
        let key = &ENCRYPTION_KEY;
        let rng = rand::SystemRandom::new();

        let mut nonce_bytes = [0u8; NONCE_LEN];
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

        let nonce_bytes = &encrypted_data[0..NONCE_LEN];
        let ciphertext_and_tag = &encrypted_data[NONCE_LEN..];

        let nonce = aead::Nonce::try_assume_unique_for_key(nonce_bytes)
            .map_err(|_| anyhow::anyhow!("Invalid nonce"))?;
        let mut in_out = ciphertext_and_tag.to_vec();

        key.open_in_place(nonce, aead::Aad::empty(), &mut in_out)
            .map_err(|_| anyhow::anyhow!("Decryption failed"))?;

        Ok(String::from_utf8(in_out)?)
    }

    pub async fn update_secrets(
        &mut self,
        store: Box<dyn OAuthStore + Sync + Send>,
        access_token_expiry: Option<u64>,
        authorization_code: &str,
        access_token: &str,
        refresh_token: Option<&str>,
        raw_json: &serde_json::Value,
    ) -> Result<()> {
        self.access_token_expiry = access_token_expiry;
        self.encrypted_authorization_code = Some(Connection::seal_str(authorization_code)?);
        self.encrypted_access_token = Some(Connection::seal_str(access_token)?);
        self.encrypted_refresh_token = match refresh_token {
            Some(t) => Some(Connection::seal_str(t)?),
            None => None,
        };
        self.encrypted_raw_json = Some(Connection::seal_str(&serde_json::to_string(raw_json)?)?);

        store.update_connection_secrets(self).await
    }

    pub fn access_token(&self) -> Result<Option<String>> {
        match &self.encrypted_access_token {
            Some(t) => Ok(Some(Connection::unseal_str(t)?)),
            None => Ok(None),
        }
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

        let finalize = provider(self.provider).finalize(self, code).await?;

        // TODO(spolu): implement store

        Ok(())
    }
}
