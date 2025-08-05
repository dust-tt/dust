use crate::oauth::{
    connection::{
        Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
        PROVIDER_TIMEOUT_SECONDS,
    },
    credential::Credential,
    providers::utils::execute_request,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use regex::Regex;
use std::env;

lazy_static! {
    static ref OAUTH_FRESHSERVICE_CLIENT_ID: String =
        env::var("OAUTH_FRESHSERVICE_CLIENT_ID").unwrap();
    static ref OAUTH_FRESHSERVICE_CLIENT_SECRET: String =
        env::var("OAUTH_FRESHSERVICE_CLIENT_SECRET").unwrap();
    static ref FRESHSERVICE_DOMAIN_RE: Regex =
        Regex::new(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.myfreshworks\.com$").unwrap();
}

pub struct FreshserviceConnectionProvider {}

impl FreshserviceConnectionProvider {
    pub fn new() -> Self {
        FreshserviceConnectionProvider {}
    }
}

#[async_trait]
impl Provider for FreshserviceConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Freshservice
    }

    async fn finalize(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let domain = match connection.metadata()["instance_url"].as_str() {
            Some(d) => {
                if !FRESHSERVICE_DOMAIN_RE.is_match(d) {
                    Err(anyhow!("Freshservice domain format invalid"))?
                }
                d
            }
            None => Err(anyhow!("Freshservice domain is missing"))?,
        };

        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        let auth_header = format!(
            "Basic {}",
            general_purpose::STANDARD.encode(format!(
                "{}:{}",
                *OAUTH_FRESHSERVICE_CLIENT_ID, *OAUTH_FRESHSERVICE_CLIENT_SECRET
            ))
        );

        let req = self
            .reqwest_client()
            .post(format!("https://{}/org/oauth/v2/token", domain))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Authorization", auth_header)
            .form(&params);

        let result = execute_request(ConnectionProvider::Freshservice, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let expires_in = result["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing expires_in in response"))?;

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: result["access_token"]
                .as_str()
                .ok_or_else(|| anyhow!("Missing access_token in response"))?
                .to_string(),
            access_token_expiry: Some(
                crate::utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: result["refresh_token"].as_str().map(|s| s.to_string()),
            raw_json: result,
            extra_metadata: Some(serde_json::Map::from_iter([(
                "instance_url".to_string(),
                serde_json::Value::String(domain.to_string()),
            )])),
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let domain = match connection.metadata()["instance_url"].as_str() {
            Some(d) => {
                if !FRESHSERVICE_DOMAIN_RE.is_match(d) {
                    Err(anyhow!("Freshservice domain format invalid"))?
                }
                d
            }
            None => Err(anyhow!("Freshservice domain is missing"))?,
        };

        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing refresh_token in Freshservice connection"))?;

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ];

        let auth_header = format!(
            "Basic {}",
            general_purpose::STANDARD.encode(format!(
                "{}:{}",
                *OAUTH_FRESHSERVICE_CLIENT_ID, *OAUTH_FRESHSERVICE_CLIENT_SECRET
            ))
        );

        let req = self
            .reqwest_client()
            .post(format!("https://{}/org/oauth/v2/token", domain))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Authorization", auth_header)
            .form(&params);

        let result = execute_request(ConnectionProvider::Freshservice, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let expires_in = result["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing expires_in in response"))?;

        Ok(RefreshResult {
            access_token: result["access_token"]
                .as_str()
                .ok_or_else(|| anyhow!("Missing access_token in response"))?
                .to_string(),
            access_token_expiry: Some(
                crate::utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000,
            ),
            refresh_token: result["refresh_token"].as_str().map(|s| s.to_string()),
            raw_json: result,
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
