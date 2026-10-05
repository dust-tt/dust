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
use urlencoding;

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
        // RFC 6749 §2.3.1 requires URL-encoding client_id and client_secret before base64-encoding.
        general_purpose::STANDARD.encode(&format!(
            "{}:{}",
            urlencoding::encode(&*OAUTH_SLACK_TOOLS_CLIENT_ID),
            urlencoding::encode(&*OAUTH_SLACK_TOOLS_CLIENT_SECRET)
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
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
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

        // For both `platform_actions and `personal_actions we receive a user token.
        // `platform_actions` are used to setup the MCP server while `personal_actions` are used by
        // users at time of use.
        let access_token = raw_json["authed_user"]["access_token"]
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
        scrub_oauth_token_fields(&mut scrubbed);
        Ok(scrubbed)
    }
}

/// Recursively remove `access_token` / `refresh_token` from provider raw JSON.
///
/// Slack `oauth.v2.access` returns tokens both at the top level (bot) and under
/// `authed_user` (user). Only scrubbing top-level keys leaves live user tokens in
/// scrubbed metadata. The canonical connection credential is stored separately via
/// `FinalizeResult.access_token` and must not be read from scrubbed raw JSON.
fn scrub_oauth_token_fields(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            map.remove("access_token");
            map.remove("refresh_token");
            for child in map.values_mut() {
                scrub_oauth_token_fields(child);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                scrub_oauth_token_fields(item);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn scrubbed_raw_json_removes_top_level_tokens_and_keeps_metadata() {
        let provider = SlackToolsConnectionProvider::new();
        let scrubbed = provider
            .scrubbed_raw_json(&json!({
                "ok": true,
                "access_token": "xoxb-top-level-secret",
                "refresh_token": "xoxe-top-level-refresh",
                "token_type": "bot",
                "scope": "chat:write",
                "team": { "id": "T123", "name": "Dust" },
                "app_id": "A09361B9ULB"
            }))
            .unwrap();

        assert!(scrubbed.get("access_token").is_none());
        assert!(scrubbed.get("refresh_token").is_none());
        assert_eq!(scrubbed["ok"], json!(true));
        assert_eq!(scrubbed["token_type"], json!("bot"));
        assert_eq!(scrubbed["scope"], json!("chat:write"));
        assert_eq!(scrubbed["team"]["id"], json!("T123"));
        assert_eq!(scrubbed["team"]["name"], json!("Dust"));
        assert_eq!(scrubbed["app_id"], json!("A09361B9ULB"));
    }

    #[test]
    fn scrubbed_raw_json_removes_nested_authed_user_tokens_and_keeps_metadata() {
        let provider = SlackToolsConnectionProvider::new();
        let scrubbed = provider
            .scrubbed_raw_json(&json!({
                "ok": true,
                "access_token": "xoxb-bot-secret",
                "token_type": "bot",
                "scope": "chat:write",
                "bot_user_id": "U_BOT",
                "app_id": "A09361B9ULB",
                "team": { "id": "T123", "name": "Dust" },
                "authed_user": {
                    "id": "U_USER",
                    "scope": "search:read,chat:write",
                    "access_token": "xoxp-user-secret",
                    "refresh_token": "xoxe-user-refresh",
                    "token_type": "user"
                }
            }))
            .unwrap();

        assert!(scrubbed.get("access_token").is_none());
        assert!(scrubbed["authed_user"].get("access_token").is_none());
        assert!(scrubbed["authed_user"].get("refresh_token").is_none());

        assert_eq!(scrubbed["ok"], json!(true));
        assert_eq!(scrubbed["token_type"], json!("bot"));
        assert_eq!(scrubbed["scope"], json!("chat:write"));
        assert_eq!(scrubbed["bot_user_id"], json!("U_BOT"));
        assert_eq!(scrubbed["app_id"], json!("A09361B9ULB"));
        assert_eq!(scrubbed["team"]["id"], json!("T123"));
        assert_eq!(scrubbed["team"]["name"], json!("Dust"));
        assert_eq!(scrubbed["authed_user"]["id"], json!("U_USER"));
        assert_eq!(
            scrubbed["authed_user"]["scope"],
            json!("search:read,chat:write")
        );
        assert_eq!(scrubbed["authed_user"]["token_type"], json!("user"));

        let scrubbed_str = scrubbed.to_string();
        assert!(!scrubbed_str.contains("xoxb-bot-secret"));
        assert!(!scrubbed_str.contains("xoxp-user-secret"));
        assert!(!scrubbed_str.contains("xoxe-user-refresh"));
    }
}
