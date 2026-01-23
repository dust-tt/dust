use crate::oauth::{
    connection::{
        Connection,
        ConnectionProvider,
        FinalizeResult,
        Provider,
        ProviderError,
        RefreshResult, // PROVIDER_TIMEOUT_SECONDS,
    },
    credential::{Credential, CredentialMetadata, CredentialProvider},
    providers::utils::execute_request,
    store::OAuthStore,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use std::env;

lazy_static! {
    static ref OAUTH_SLACK_CLIENT_ID: String = env::var("OAUTH_SLACK_CLIENT_ID").unwrap();
    static ref OAUTH_SLACK_CLIENT_SECRET: String = env::var("OAUTH_SLACK_CLIENT_SECRET").unwrap();
    static ref OAUTH_SLACK_BOT_CLIENT_ID: String =
        env::var("OAUTH_SLACK_BOT_CLIENT_ID").expect("OAUTH_SLACK_BOT_CLIENT_ID must be set");
    static ref OAUTH_SLACK_BOT_CLIENT_SECRET: String = env::var("OAUTH_SLACK_BOT_CLIENT_SECRET")
        .expect("OAUTH_SLACK_BOT_CLIENT_SECRET must be set");
}

/// We support three Slack apps. Our default `connection` app (for data source connections) a
/// `personal_actions` app (for personal MCP server interactions) and a `bot` app (for interactions
/// with Dust from Slack).
#[derive(Debug, PartialEq, Clone)]
pub enum SlackUseCase {
    Connection,
    Bot,
    PlatformActions,
}

pub struct SlackConnectionProvider {}

impl SlackConnectionProvider {
    pub fn new() -> Self {
        SlackConnectionProvider {}
    }

    fn basic_auth(
        &self,
        app_type: SlackUseCase,
        related_credentials: Option<Credential>,
    ) -> Result<String> {
        let (client_id, client_secret) = match app_type {
            // related_credentials refers to customers using their own Slack app
            SlackUseCase::Connection => match related_credentials {
                Some(credentials) => Self::get_credentials(credentials)?,
                None => (
                    OAUTH_SLACK_CLIENT_ID.clone(),
                    OAUTH_SLACK_CLIENT_SECRET.clone(),
                ),
            },
            SlackUseCase::PlatformActions | SlackUseCase::Bot => (
                OAUTH_SLACK_BOT_CLIENT_ID.clone(),
                OAUTH_SLACK_BOT_CLIENT_SECRET.clone(),
            ),
        };

        Ok(general_purpose::STANDARD.encode(&format!("{}:{}", client_id, client_secret)))
    }

    pub fn get_credentials(credentials: Credential) -> Result<(String, String)> {
        let content = credentials.unseal_encrypted_content()?;
        let provider = credentials.provider();

        if provider != CredentialProvider::Slack {
            return Err(anyhow!(
                "Invalid credential provider: {:?}, expected Slack",
                provider
            ));
        }

        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Slack credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Slack credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
    }

    /// Creates a system credential for Slack connection use-case using env variables
    /// Returns None if this is not a Slack connection use-case
    pub async fn create_system_credential_if_needed(
        store: Box<dyn OAuthStore + Sync + Send>,
        metadata: &serde_json::Value,
    ) -> Result<Option<Credential>> {
        if metadata.get("use_case").and_then(|v| v.as_str()) != Some("connection") {
            return Ok(None);
        }

        let workspace_id = metadata
            .get("workspace_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing workspace_id in metadata"))?;

        let user_id = metadata
            .get("user_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing user_id in metadata"))?;

        let client_id = OAUTH_SLACK_CLIENT_ID.clone();
        let client_secret = OAUTH_SLACK_CLIENT_SECRET.clone();

        let credential_metadata = CredentialMetadata {
            user_id: user_id.to_string(),
            workspace_id: workspace_id.to_string(),
        };

        let mut credential_content = serde_json::Map::new();
        credential_content.insert("client_id".to_string(), serde_json::json!(client_id));
        credential_content.insert(
            "client_secret".to_string(),
            serde_json::json!(client_secret),
        );

        let credential = Credential::create(
            store,
            CredentialProvider::Slack,
            credential_metadata,
            credential_content,
        )
        .await?;

        Ok(Some(credential))
    }
}

#[async_trait]
impl Provider for SlackConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Slack
    }

    async fn finalize(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let app_type = match connection.metadata()["use_case"].as_str() {
            Some(use_case) => match use_case {
                "connection" => SlackUseCase::Connection,
                "bot" => SlackUseCase::Bot,
                "platform_actions" => SlackUseCase::PlatformActions,
                _ => Err(anyhow!("Slack use_case format invalid"))?,
            },
            None => Err(anyhow!("Slack use_case missing"))?,
        };

        // Extract client_id early for metadata
        let client_id = match app_type {
            SlackUseCase::Connection => match &related_credentials {
                Some(credentials) => {
                    let content = credentials.unseal_encrypted_content()?;
                    content
                        .get("client_id")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Missing client_id in Slack credential"))?
                        .to_string()
                }
                None => OAUTH_SLACK_CLIENT_ID.clone(),
            },
            SlackUseCase::PlatformActions | SlackUseCase::Bot => OAUTH_SLACK_BOT_CLIENT_ID.clone(),
        };

        let req = self
            .reqwest_client()
            .post("https://slack.com/api/oauth.v2.access")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header(
                "Authorization",
                format!(
                    "Basic {}",
                    self.basic_auth(app_type.clone(), related_credentials)?
                ),
            )
            // Very important, this will *not* work with JSON body.
            .form(&[("code", code), ("redirect_uri", redirect_uri)]);

        let raw_json = execute_request(ConnectionProvider::Slack, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        if !raw_json["ok"].as_bool().unwrap_or(false) {
            return Err(ProviderError::UnknownError(format!(
                "Slack OAuth error: {}",
                raw_json["error"].as_str().unwrap_or("Unknown error")
            )));
        }

        let (team_id, team_name) = match raw_json["team"].is_object() {
            true => (
                raw_json["team"]["id"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing `team_id` in response from Slack"))?,
                raw_json["team"]["name"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing `team_name` in response from Slack"))?,
            ),
            false => {
                return Err(ProviderError::UnknownError(format!(
                    "Missing `team` in response from Slack"
                )))
            }
        };

        // For Bot, Connection, and PlatformActions we receive a bot token (acces_token).
        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Slack"))?;

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            extra_metadata: Some(serde_json::Map::from_iter([
                (
                    "team_id".to_string(),
                    serde_json::Value::String(team_id.to_string()),
                ),
                (
                    "team_name".to_string(),
                    serde_json::Value::String(team_name.to_string()),
                ),
                (
                    "client_id".to_string(),
                    serde_json::Value::String(client_id.to_string()),
                ),
            ])),
            raw_json,
        })
    }

    async fn refresh(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        Err(ProviderError::ActionNotSupportedError(
            "Slack access tokens do not expire.".to_string(),
        ))?
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let mut scrubbed = raw_json.clone();
        if let Some(obj) = scrubbed.as_object_mut() {
            obj.remove("access_token");
            obj.remove("refresh_token");
        }
        Ok(scrubbed)
    }
}
