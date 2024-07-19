use crate::{
    oauth::{
        connection::{
            Connection,
            ConnectionProvider,
            FinalizeResult,
            Provider,
            RefreshResult,
            // PROVIDER_TIMEOUT_SECONDS,
        },
        providers::utils::execute_request,
    },
    // utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use std::env;

lazy_static! {
    static ref OAUTH_SLACK_CLIENT_ID: String = env::var("OAUTH_SLACK_CLIENT_ID").unwrap();
    static ref OAUTH_SLACK_CLIENT_SECRET: String = env::var("OAUTH_SLACK_CLIENT_SECRET").unwrap();
}

pub struct SlackConnectionProvider {}

impl SlackConnectionProvider {
    pub fn new() -> Self {
        SlackConnectionProvider {}
    }

    fn basic_auth(&self) -> String {
        general_purpose::STANDARD.encode(&format!(
            "{}:{}",
            *OAUTH_SLACK_CLIENT_ID, *OAUTH_SLACK_CLIENT_SECRET
        ))
    }
}

#[async_trait]
impl Provider for SlackConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Slack
    }

    async fn finalize(
        &self,
        _connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult> {
        let req = reqwest::Client::new()
            .post("https://slack.com/api/oauth.v2.access")
            .header("Content-Type", "application/json; charset=utf-8")
            .header("Authorization", format!("Basic {}", self.basic_auth()))
            // Very important, this will *not* work with JSON body.
            .form(&[("code", code), ("redirect_uri", redirect_uri)]);

        let raw_json = execute_request(ConnectionProvider::Slack, req).await?;

        if !raw_json["ok"].as_bool().unwrap_or(false) {
            return Err(anyhow!(
                "Slack OAuth error: {}",
                raw_json["error"].as_str().unwrap_or("Unknown error")
            ));
        }

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Slack"))?;

        // let expires_in = raw_json["expires_in"].as_u64();
        // let refresh_token = raw_json["refresh_token"].as_str().map(String::from);

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry: None,
            refresh_token: None,
            // access_token_expiry: expires_in.map(|e| utils::now() + e * 1000),
            // refresh_token,
            raw_json,
        })
    }

    async fn refresh(&self, _connection: &Connection) -> Result<RefreshResult> {
        Err(anyhow!("Slack token rotation not implemented."))?
        // let refresh_token = connection
        //     .unseal_refresh_token()?
        //     .ok_or_else(|| anyhow!("Missing `refresh_token` in Slack connection"))?;

        // let req = reqwest::Client::new()
        //     .post("https://slack.com/api/oauth.v2.access")
        //     .header("Authorization", format!("Basic {}", self.basic_auth()))
        //     .header("Content-Type", "application/json; charset=utf-8")
        //     .form(&[
        //         ("grant_type", "refresh_token"),
        //         ("refresh_token", &refresh_token),
        //     ]);

        // let raw_json = execute_request(ConnectionProvider::Slack, req).await?;

        // if !raw_json["ok"].as_bool().unwrap_or(false) {
        //     return Err(anyhow!(
        //         "Slack OAuth error: {}",
        //         raw_json["error"].as_str().unwrap_or("Unknown error")
        //     ));
        // }

        // let access_token = raw_json["access_token"]
        //     .as_str()
        //     .ok_or_else(|| anyhow!("Missing `access_token` in response from Slack"))?;

        // let new_refresh_token = raw_json["refresh_token"]
        //     .as_str()
        //     .ok_or_else(|| anyhow!("Missing `refresh_token` in response from Slack"))?;

        // // Slack tokens expire in 12 hours (43200 seconds)
        // let expires_in = 43200;

        // Ok(RefreshResult {
        //     access_token: access_token.to_string(),
        //     access_token_expiry: Some(
        //         utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
        //     ),
        //     refresh_token: Some(new_refresh_token.to_string()),
        //     raw_json,
        // })
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
