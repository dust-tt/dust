use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
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
    static ref OAUTH_SLACK_TOOLS_CLIENT_ID: String =
        env::var("OAUTH_SLACK_TOOLS_CLIENT_ID").expect("OAUTH_SLACK_TOOLS_CLIENT_ID must be set");
    static ref OAUTH_SLACK_TOOLS_CLIENT_SECRET: String =
        env::var("OAUTH_SLACK_TOOLS_CLIENT_SECRET")
            .expect("OAUTH_SLACK_TOOLS_CLIENT_SECRET must be set");
}

/// Slack tools use cases for MCP actions (personal tools setup).
/// Both platform_actions and personal_actions use the same Slack Tools app (A09361B9ULB).
#[derive(Debug, PartialEq, Clone)]
pub enum SlackToolsUseCase {
    PlatformActions,
    PersonalActions,
}

pub struct SlackToolsConnectionProvider {}

impl SlackToolsConnectionProvider {
    pub fn new() -> Self {
        SlackToolsConnectionProvider {}
    }

    fn basic_auth(&self) -> String {
        general_purpose::STANDARD.encode(&format!(
            "{}:{}",
            OAUTH_SLACK_TOOLS_CLIENT_ID.clone(),
            OAUTH_SLACK_TOOLS_CLIENT_SECRET.clone()
        ))
    }
}

#[async_trait]
impl Provider for SlackToolsConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::SlackTools
    }

    async fn finalize(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let use_case = match connection.metadata()["use_case"].as_str() {
            Some(use_case) => match use_case {
                "platform_actions" => SlackToolsUseCase::PlatformActions,
                "personal_actions" => SlackToolsUseCase::PersonalActions,
                _ => Err(anyhow!("Slack tools use_case format invalid"))?,
            },
            None => Err(anyhow!("Slack tools use_case missing"))?,
        };

        let client_id = OAUTH_SLACK_TOOLS_CLIENT_ID.clone();

        let req = self
            .reqwest_client()
            .post("https://slack.com/api/oauth.v2.access")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Authorization", format!("Basic {}", self.basic_auth()))
            // Very important, this will *not* work with JSON body.
            .form(&[("code", code), ("redirect_uri", redirect_uri)]);

        let raw_json = execute_request(ConnectionProvider::SlackTools, req)
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

        // For platform_actions we receive a bot token (access_token). For personal_actions
        // (personal tools setup) we receive a user token (authed_user.access_token).
        let access_token = match use_case {
            SlackToolsUseCase::PlatformActions => raw_json["access_token"]
                .as_str()
                .ok_or_else(|| anyhow!("Missing `access_token` in response from Slack"))?,
            SlackToolsUseCase::PersonalActions => raw_json["authed_user"]["access_token"]
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
