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
    static ref OAUTH_SLACK_BOT_CLIENT_ID: String =
        env::var("OAUTH_SLACK_BOT_CLIENT_ID").expect("OAUTH_SLACK_BOT_CLIENT_ID must be set");
    static ref OAUTH_SLACK_BOT_CLIENT_SECRET: String = env::var("OAUTH_SLACK_BOT_CLIENT_SECRET")
        .expect("OAUTH_SLACK_BOT_CLIENT_SECRET must be set");
}

pub struct SlackBotConnectionProvider {}

impl SlackBotConnectionProvider {
    pub fn new() -> Self {
        SlackBotConnectionProvider {}
    }

    fn basic_auth(&self) -> String {
        general_purpose::STANDARD.encode(&format!(
            "{}:{}",
            *OAUTH_SLACK_BOT_CLIENT_ID, *OAUTH_SLACK_BOT_CLIENT_SECRET
        ))
    }
}

#[async_trait]
impl Provider for SlackBotConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::SlackBot
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let req = self
            .reqwest_client()
            .post("https://slack.com/api/oauth.v2.access")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Authorization", format!("Basic {}", self.basic_auth()))
            // Very important, this will *not* work with JSON body.
            .form(&[("code", code), ("redirect_uri", redirect_uri)]);

        let raw_json = execute_request(ConnectionProvider::SlackBot, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        if !raw_json["ok"].as_bool().unwrap_or(false) {
            return Err(ProviderError::UnknownError(format!(
                "Slack bot OAuth error: {}",
                raw_json["error"].as_str().unwrap_or("Unknown error")
            )));
        }

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Slack"))?;

        // Slack bot tokens do not expire, similar to regular Slack tokens
        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        _connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        Err(ProviderError::ActionNotSupportedError(
            "Slack bot access tokens do not expire.".to_string(),
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
