use crate::{
    http::proxy_client::create_untrusted_egress_client_builder,
    oauth::{
        connection::{
            Connection, ConnectionProvider, FinalizeResult, Provider, ProviderError, RefreshResult,
            PROVIDER_TIMEOUT_SECONDS,
        },
        credential::Credential,
        providers::utils::execute_request,
    },
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use regex::Regex;
use std::env;
use tracing::error;
use urlencoding;

lazy_static! {
    static ref OAUTH_FRESHWORKS_CLIENT_ID: String = env::var("OAUTH_FRESHWORKS_CLIENT_ID").unwrap();
    static ref OAUTH_FRESHWORKS_CLIENT_SECRET: String =
        env::var("OAUTH_FRESHWORKS_CLIENT_SECRET").unwrap();
    // Hostname only (no scheme, path, port, or IP). Accepts standard Freshworks
    // hosts (*.myfreshworks.com) and custom organization domains
    static ref FRESHWORKS_ORG_DOMAIN_RE: Regex = Regex::new(
        r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$"
    )
    .unwrap();
}

/// Parses a Freshworks organization URL into a hostname suitable for token requests.
fn parse_freshworks_org_url(raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);
    let domain = without_scheme.trim_end_matches('/');

    if domain.is_empty() || domain.len() > 253 || !FRESHWORKS_ORG_DOMAIN_RE.is_match(domain) {
        return Err(anyhow!("Freshservice domain format invalid"));
    }

    Ok(domain.to_string())
}

fn freshworks_org_url_from_connection(connection: &Connection) -> Result<String> {
    match connection.metadata()["freshworks_org_url"].as_str() {
        Some(raw) => parse_freshworks_org_url(raw),
        None => Err(anyhow!("Freshservice domain is missing")),
    }
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

    fn reqwest_client(&self) -> reqwest::Client {
        // Token requests go to a user-provided org URL (including custom domains).
        match create_untrusted_egress_client_builder().build() {
            Ok(client) => client,
            Err(e) => {
                error!(error = ?e, "Failed to create client with untrusted egress proxy");
                reqwest::Client::new()
            }
        }
    }

    async fn finalize(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let domain = freshworks_org_url_from_connection(connection)?;

        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ];

        // RFC 6749 §2.3.1 requires URL-encoding client_id and client_secret before base64-encoding.
        let auth_header = format!(
            "Basic {}",
            general_purpose::STANDARD.encode(format!(
                "{}:{}",
                urlencoding::encode(&*OAUTH_FRESHWORKS_CLIENT_ID),
                urlencoding::encode(&*OAUTH_FRESHWORKS_CLIENT_SECRET)
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
                "freshworks_org_url".to_string(),
                serde_json::Value::String(domain),
            )])),
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        _related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let domain = freshworks_org_url_from_connection(connection)?;

        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing refresh_token in Freshservice connection"))?;

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ];

        // RFC 6749 §2.3.1 requires URL-encoding client_id and client_secret before base64-encoding.
        let auth_header = format!(
            "Basic {}",
            general_purpose::STANDARD.encode(format!(
                "{}:{}",
                urlencoding::encode(&*OAUTH_FRESHWORKS_CLIENT_ID),
                urlencoding::encode(&*OAUTH_FRESHWORKS_CLIENT_SECRET)
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

#[cfg(test)]
mod tests {
    use super::parse_freshworks_org_url;

    #[test]
    fn accepts_standard_myfreshworks_domain() {
        assert_eq!(
            parse_freshworks_org_url("acme.myfreshworks.com").unwrap(),
            "acme.myfreshworks.com"
        );
    }

    #[test]
    fn accepts_custom_organization_domain() {
        assert_eq!(
            parse_freshworks_org_url("it.test.com").unwrap(),
            "it.test.com"
        );
    }

    #[test]
    fn strips_scheme_and_trailing_slash() {
        assert_eq!(
            parse_freshworks_org_url("https://it.test.com/").unwrap(),
            "it.test.com"
        );
    }

    #[test]
    fn rejects_ips_paths_ports_and_bare_hosts() {
        assert!(parse_freshworks_org_url("127.0.0.1").is_err());
        assert!(parse_freshworks_org_url("it.test.com/org").is_err());
        assert!(parse_freshworks_org_url("it.test.com:443").is_err());
        assert!(parse_freshworks_org_url("localhost").is_err());
        assert!(parse_freshworks_org_url("").is_err());
    }
}
