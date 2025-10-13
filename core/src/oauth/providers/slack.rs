use crate::oauth::{
    connection::{
        Connection,
        ConnectionProvider,
        FinalizeResult,
        Provider,
        ProviderError,
        RefreshResult, // PROVIDER_TIMEOUT_SECONDS,
    },
    credential::Credential,
    providers::utils::execute_request,
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
    static ref OAUTH_SLACK_TOOLS_CLIENT_ID: String =
        env::var("OAUTH_SLACK_TOOLS_CLIENT_ID").expect("OAUTH_SLACK_TOOLS_CLIENT_ID must be set");
    static ref OAUTH_SLACK_TOOLS_CLIENT_SECRET: String =
        env::var("OAUTH_SLACK_TOOLS_CLIENT_SECRET")
            .expect("OAUTH_SLACK_TOOLS_CLIENT_SECRET must be set");
}

/// We support three Slack apps. Our default `connection` app (for data source connections) a
/// `personal_actions` app (for personal MCP server interactions) and a `bot` app (for interactions
/// with Dust from Slack).
#[derive(Debug, PartialEq, Clone)]
pub enum SlackUseCase {
    Connection,
    Bot,
    PersonalActions, // (personal tools setup)
    PlatformActions,
}

pub struct SlackConnectionProvider {}

impl SlackConnectionProvider {
    pub fn new() -> Self {
        SlackConnectionProvider {}
    }

    fn basic_auth(&self, app_type: SlackUseCase) -> String {
        match app_type {
            SlackUseCase::Connection => general_purpose::STANDARD.encode(&format!(
                "{}:{}",
                *OAUTH_SLACK_CLIENT_ID, *OAUTH_SLACK_CLIENT_SECRET
            )),
            SlackUseCase::PlatformActions | SlackUseCase::Bot => {
                general_purpose::STANDARD.encode(&format!(
                    "{}:{}",
                    *OAUTH_SLACK_BOT_CLIENT_ID, *OAUTH_SLACK_BOT_CLIENT_SECRET
                ))
            }
            SlackUseCase::PersonalActions => general_purpose::STANDARD.encode(&format!(
                "{}:{}",
                *OAUTH_SLACK_TOOLS_CLIENT_ID, *OAUTH_SLACK_TOOLS_CLIENT_SECRET
            )),
        }
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
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let app_type = match connection.metadata()["use_case"].as_str() {
            Some(use_case) => match use_case {
                "connection" => SlackUseCase::Connection,
                "bot" => SlackUseCase::Bot,
                "platform_actions" => SlackUseCase::PlatformActions,
                "personal_actions" => SlackUseCase::PersonalActions,
                _ => Err(anyhow!("Slack use_case format invalid"))?,
            },
            None => Err(anyhow!("Slack use_case missing"))?,
        };

        let req = self
            .reqwest_client()
            .post("https://slack.com/api/oauth.v2.access")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header(
                "Authorization",
                format!("Basic {}", self.basic_auth(app_type.clone())),
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

        // For Bot, Connection, and PlatformActions we receive a bot token (acces_token). For personal_actions (personal tools setup) we receive a user
        // token (authed_user.access_token).
        let access_token = match app_type {
            SlackUseCase::Connection | SlackUseCase::Bot | SlackUseCase::PlatformActions => {
                raw_json["access_token"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing `access_token` in response from Slack"))?
            }
            SlackUseCase::PersonalActions => raw_json["authed_user"]["access_token"]
                .as_str()
                .ok_or_else(|| anyhow!("Missing `access_token` in response from Slack"))?,
        };

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
