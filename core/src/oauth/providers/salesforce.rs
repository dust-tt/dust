use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        },
        credential::{Credential, CredentialProvider},
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::json;

pub struct SalesforceConnectionProvider {}

impl SalesforceConnectionProvider {
    pub fn new() -> Self {
        SalesforceConnectionProvider {}
    }

    pub fn get_instance_url(metadata: &serde_json::Value) -> Result<String> {
        match metadata["instance_url"].as_str() {
            Some(url) => Ok(url.to_string()),
            None => Err(anyhow!("Salesforce instance URL is missing")),
        }
    }

    /// Gets the Salesforce credentials (client_id and client_secret) from the related credential
    pub async fn get_credentials(credentials: Option<Credential>) -> Result<(String, String)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for Salesforce connection"))?;

        let content = credentials.unseal_encrypted_content()?;
        let provider = credentials.provider();

        // Fetch credential
        if provider != CredentialProvider::Salesforce {
            return Err(anyhow!(
                "Invalid credential provider: {:?}, expected Salesforce",
                provider
            ));
        }

        // Extract client ID and secret
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_id in Salesforce credential"))?;

        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing client_secret in Salesforce credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
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
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let instance_url = Self::get_instance_url(&connection.metadata())?;

        let code_verifier = connection.metadata()["code_verifier"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `code_verifier` in Salesforce connection"))?;

        // Get Salesforce client_id and client_secret using the helper
        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        // Use a HashMap instead of json! for form data
        let mut form_data = std::collections::HashMap::new();
        form_data.insert("grant_type", "authorization_code");
        form_data.insert("client_id", &client_id);
        form_data.insert("client_secret", &client_secret);
        form_data.insert("code", code);
        form_data.insert("redirect_uri", redirect_uri);
        form_data.insert("code_verifier", code_verifier);

        let req = reqwest::Client::new()
            .post(format!("{}/services/oauth2/token", instance_url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form_data);

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

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let instance_url = Self::get_instance_url(&connection.metadata())?;
        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing `refresh_token` in Salesforce connection"))?;

        let (client_id, client_secret) = Self::get_credentials(related_credentials).await?;

        // Use a HashMap instead of json! for form data
        let mut form_data = std::collections::HashMap::new();
        form_data.insert("grant_type", "refresh_token");
        form_data.insert("client_id", &client_id);
        form_data.insert("client_secret", &client_secret);
        form_data.insert("refresh_token", &refresh_token);

        let req = reqwest::Client::new()
            .post(format!("{}/services/oauth2/token", instance_url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form_data);

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
