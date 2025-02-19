use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        },
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use serde_json::json;
use std::env;

lazy_static! {
    static ref OAUTH_SALESFORCE_CLIENT_ID: String = env::var("OAUTH_SALESFORCE_CLIENT_ID").unwrap();
    static ref OAUTH_SALESFORCE_CLIENT_SECRET: String =
        env::var("OAUTH_SALESFORCE_CLIENT_SECRET").unwrap();
}

pub struct SalesforceConnectionProvider {}

impl SalesforceConnectionProvider {
    pub fn new() -> Self {
        SalesforceConnectionProvider {}
    }
    fn get_instance_url(connection: &Connection) -> Result<String> {
        match connection.metadata()["instance_url"].as_str() {
            Some(url) => Ok(url.to_string()),
            None => Err(anyhow!("Salesforce instance URL is missing")),
        }
    }
}

#[async_trait]
impl Provider for SalesforceConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Salesforce
    }

    async fn finalize(
        &self,
        connection: &Connection,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let instance_url = Self::get_instance_url(connection)?;

        let code_verifier = connection.metadata()["code_verifier"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `code_verifier` in Salesforce connection"))?;

        let body = json!({
            "grant_type": "authorization_code",
            "client_id": *OAUTH_SALESFORCE_CLIENT_ID,
            "client_secret": *OAUTH_SALESFORCE_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        });

        let req = reqwest::Client::new()
            .post(format!("{}/services/oauth2/token", instance_url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&body);

        let raw_json = execute_request(ConnectionProvider::Salesforce, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Salesforce"))?;

        let refresh_token = raw_json["refresh_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `refresh_token` in response from Salesforce"))?;

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            // We don't know the expiry time, so we use 15 minutes as a default
            access_token_expiry: Some(utils::now() + 15 * 60 * 1000),
            refresh_token: Some(refresh_token.to_string()),
            raw_json,
        })
    }

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult, ProviderError> {
        let instance_url = Self::get_instance_url(connection)?;
        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing `refresh_token` in Salesforce connection"))?;

        let body = json!({
            "grant_type": "refresh_token",
            "client_id": *OAUTH_SALESFORCE_CLIENT_ID,
            "client_secret": *OAUTH_SALESFORCE_CLIENT_SECRET,
            "refresh_token": refresh_token,
        });

        let req = reqwest::Client::new()
            .post(format!("{}/services/oauth2/token", instance_url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&body);

        let raw_json = execute_request(ConnectionProvider::Salesforce, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Salesforce"))?;

        // Salesforce refresh tokens don't expire and stay the same
        Ok(RefreshResult {
            access_token: access_token.to_string(),
            // We don't know the expiry time, so we use 15 minutes as a default
            access_token_expiry: Some(utils::now() + 15 * 60 * 1000),
            refresh_token: Some(refresh_token),
            raw_json,
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("access_token");
                map.remove("refresh_token");
                map.remove("signature");
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };

        Ok(raw_json)
    }
}
