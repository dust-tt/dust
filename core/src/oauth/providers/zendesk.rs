use crate::{
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
            PROVIDER_TIMEOUT_SECONDS,
        },
        credential::Credential,
        providers::utils::execute_request,
    },
    utils,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use regex::Regex;
use serde_json::json;
use std::env;

lazy_static! {
    static ref OAUTH_ZENDESK_CLIENT_ID: String = env::var("OAUTH_ZENDESK_CLIENT_ID").unwrap();
    static ref OAUTH_ZENDESK_CLIENT_SECRET: String =
        env::var("OAUTH_ZENDESK_CLIENT_SECRET").unwrap();
    static ref ZENDESK_SUBDOMAIN_RE: Regex =
        Regex::new(r"^[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?$").unwrap();
}

pub struct ZendeskConnectionProvider {}

impl ZendeskConnectionProvider {
    pub fn new() -> Self {
        ZendeskConnectionProvider {}
    }
}

#[async_trait]
impl Provider for ZendeskConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Zendesk
    }

    async fn finalize(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let body = json!({
            "grant_type": "authorization_code",
            "code": code,
            "client_id": *OAUTH_ZENDESK_CLIENT_ID,
            "client_secret": *OAUTH_ZENDESK_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "scope": "read write"
        });

        let subdomain = match connection.metadata()["zendesk_subdomain"].as_str() {
            Some(d) => {
                if !ZENDESK_SUBDOMAIN_RE.is_match(d) {
                    Err(anyhow!("Zendesk subdomain format invalid"))?
                }
                d
            }
            None => Err(anyhow!("Zendesk subdomain is missing"))?,
        };

        let url = format!("https://{}.zendesk.com/oauth/tokens", subdomain);

        let req = self
            .reqwest_client()
            .post(url)
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Zendesk, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => Err(anyhow!("Missing `access_token` in response from Zendesk"))?,
        };

        // Extract refresh token if available (for future OAuth updates)
        let refresh_token = raw_json["refresh_token"].as_str().map(|s| s.to_string());

        // Extract token expiry if available (for future OAuth updates)
        let access_token_expiry = raw_json["expires_in"]
            .as_u64()
            .map(|expires_in| utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000);

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token,
            raw_json,
            extra_metadata: None,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let refresh_token = match connection.encrypted_refresh_token() {
            Some(token) => token,
            None => {
                return Err(ProviderError::ActionNotSupportedError(
                    "No refresh token available for Zendesk connection".to_string(),
                ))
            }
        };

        let subdomain = match connection.metadata()["zendesk_subdomain"].as_str() {
            Some(d) => {
                if !ZENDESK_SUBDOMAIN_RE.is_match(d) {
                    return Err(ProviderError::InvalidMetadataError(
                        "Zendesk subdomain format invalid".to_string(),
                    ));
                }
                d
            }
            None => {
                return Err(ProviderError::InvalidMetadataError(
                    "Zendesk subdomain is missing".to_string(),
                ))
            }
        };

        let body = json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": *OAUTH_ZENDESK_CLIENT_ID,
            "client_secret": *OAUTH_ZENDESK_CLIENT_SECRET,
        });

        let url = format!("https://{}.zendesk.com/oauth/tokens", subdomain);

        let req = self
            .reqwest_client()
            .post(url)
            .header("Content-Type", "application/json")
            .json(&body);

        let raw_json = execute_request(ConnectionProvider::Zendesk, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = match raw_json["access_token"].as_str() {
            Some(token) => token,
            None => {
                return Err(ProviderError::InternalError(anyhow!(
                    "Missing `access_token` in refresh response from Zendesk"
                )))
            }
        };

        let new_refresh_token = raw_json["refresh_token"].as_str().map(|s| s.to_string());

        let access_token_expiry = raw_json["expires_in"]
            .as_u64()
            .map(|expires_in| utils::now() + (expires_in - PROVIDER_TIMEOUT_SECONDS) * 1000);

        Ok(RefreshResult {
            access_token: access_token.to_string(),
            access_token_expiry,
            refresh_token: new_refresh_token,
            raw_json,
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let raw_json = match raw_json.clone() {
            serde_json::Value::Object(mut map) => {
                map.remove("access_token");
                serde_json::Value::Object(map)
            }
            _ => Err(anyhow!("Invalid raw_json, not an object"))?,
        };

        Ok(raw_json)
    }
}
