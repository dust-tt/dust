use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        PROVIDER_TIMEOUT_SECONDS,
    },
    credential::Credential,
    providers::utils::execute_request,
};
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use std::env;

lazy_static! {
    static ref OAUTH_FATHOM_CLIENT_ID: String = env::var("OAUTH_FATHOM_CLIENT_ID")
        .expect("OAUTH_FATHOM_CLIENT_ID environment variable must be set");
    static ref OAUTH_FATHOM_CLIENT_SECRET: String = env::var("OAUTH_FATHOM_CLIENT_SECRET")
        .expect("OAUTH_FATHOM_CLIENT_SECRET environment variable must be set");
}

#[derive(Debug, PartialEq, Clone)]
pub enum FathomUseCase {
    Webhooks,
}

pub struct FathomConnectionProvider {}

impl FathomConnectionProvider {
    pub fn new() -> Self {
        FathomConnectionProvider {}
    }

    async fn exchange_token(
        &self,
        form_data: Vec<(&str, &str)>,
    ) -> Result<serde_json::Value, ProviderError> {
        let req = self
            .reqwest_client()
            .post("https://fathom.video/external/v1/oauth2/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form_data);

        let raw_json = execute_request(ConnectionProvider::Fathom, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        Ok(raw_json)
    }

    fn parse_token_response(
        &self,
        raw_json: &serde_json::Value,
    ) -> Result<(String, Option<u64>, Option<String>), ProviderError> {
        let access_token = raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Fathom"))?
            .to_string();

        let expires_in = raw_json["expires_in"].as_u64();
        let refresh_token = raw_json["refresh_token"].as_str().map(|s| s.to_string());

        Ok((access_token, expires_in, refresh_token))
    }

    fn calculate_expiry(&self, expires_in: Option<u64>) -> Option<u64> {
        expires_in.map(|expires| utils::now() + (expires - PROVIDER_TIMEOUT_SECONDS) * 1000)
    }
}

#[async_trait]
impl Provider for FathomConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Fathom
    }

    async fn finalize(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let _use_case = match connection.metadata()["use_case"].as_str() {
            Some(use_case) => match use_case {
                "webhooks" => FathomUseCase::Webhooks,
                _ => Err(anyhow!("Fathom use_case format invalid"))?,
            },
            None => Err(anyhow!("Fathom use_case missing"))?,
        };

        let form_data = vec![
            ("client_id", OAUTH_FATHOM_CLIENT_ID.as_str()),
            ("client_secret", OAUTH_FATHOM_CLIENT_SECRET.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        let raw_json = self.exchange_token(form_data).await?;
        let (access_token, expires_in, refresh_token) = self.parse_token_response(&raw_json)?;

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token,
            access_token_expiry: self.calculate_expiry(expires_in),
            refresh_token,
            extra_metadata: None,
            raw_json,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        // Fathom tokens can be refreshed if we have a refresh token
        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("No refresh token available"))?;

        let form_data = vec![
            ("client_id", OAUTH_FATHOM_CLIENT_ID.as_str()),
            ("client_secret", OAUTH_FATHOM_CLIENT_SECRET.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ];

        let raw_json = self.exchange_token(form_data).await?;
        let (access_token, expires_in, refresh_token) = self.parse_token_response(&raw_json)?;

        Ok(RefreshResult {
            access_token,
            access_token_expiry: self.calculate_expiry(expires_in),
            refresh_token,
            raw_json,
        })
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
