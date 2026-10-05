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
use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref SHOPIFY_STORE_DOMAIN_RE: Regex =
        Regex::new(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$")
            .expect("Shopify store domain regex must be valid");
}

pub struct ShopifyConnectionProvider {}

impl ShopifyConnectionProvider {
    pub fn new() -> Self {
        Self {}
    }

    /// @cc [owner:spolu,label:security] connection-app-credentials
    /// Token exchanges MUST use client_id and client_secret from the connection's encrypted
    /// related credential. Missing credentials MUST fail without a shared-app fallback.
    fn get_credentials(credentials: Option<Credential>) -> Result<(String, String)> {
        let credentials =
            credentials.ok_or_else(|| anyhow!("Missing credentials for Shopify connection"))?;
        let content = credentials.unseal_encrypted_content()?;
        let client_id = content
            .get("client_id")
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .ok_or_else(|| anyhow!("Missing client_id in Shopify credential"))?;
        let client_secret = content
            .get("client_secret")
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .ok_or_else(|| anyhow!("Missing client_secret in Shopify credential"))?;

        Ok((client_id.to_string(), client_secret.to_string()))
    }

    fn store_domain<'a>(&self, connection: &'a Connection) -> Result<&'a str, ProviderError> {
        let store_domain = connection.metadata()["shopify_store_domain"]
            .as_str()
            .ok_or_else(|| {
                ProviderError::InvalidMetadataError(
                    "Shopify store domain is missing from connection metadata".to_string(),
                )
            })?;

        if !SHOPIFY_STORE_DOMAIN_RE.is_match(store_domain) {
            return Err(ProviderError::InvalidMetadataError(
                "Shopify store domain format is invalid".to_string(),
            ));
        }

        Ok(store_domain)
    }

    fn access_token_expiry(raw_json: &serde_json::Value) -> Result<u64, ProviderError> {
        let expires_in = raw_json["expires_in"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing `expires_in` in response from Shopify"))?;
        Ok(crate::utils::now()
            + expires_in
                .saturating_sub(PROVIDER_TIMEOUT_SECONDS)
                .saturating_mul(1000))
    }

    fn access_token(raw_json: &serde_json::Value) -> Result<String, ProviderError> {
        Ok(raw_json["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `access_token` in response from Shopify"))?
            .to_string())
    }

    fn refresh_token(raw_json: &serde_json::Value) -> Result<String, ProviderError> {
        Ok(raw_json["refresh_token"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing `refresh_token` in response from Shopify"))?
            .to_string())
    }

    fn extra_metadata(
        raw_json: &serde_json::Value,
    ) -> Option<serde_json::Map<String, serde_json::Value>> {
        raw_json["scope"].as_str().map(|scope| {
            serde_json::Map::from_iter([(
                "scope".to_string(),
                serde_json::Value::String(scope.to_string()),
            )])
        })
    }
}

#[async_trait]
impl Provider for ShopifyConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Shopify
    }

    async fn finalize(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
        code: &str,
        redirect_uri: &str,
    ) -> Result<FinalizeResult, ProviderError> {
        let store_domain = self.store_domain(connection)?;
        let (client_id, client_secret) = Self::get_credentials(related_credentials)?;
        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code),
            ("expiring", "1"),
        ];
        let req = self
            .reqwest_client()
            .post(format!("https://{store_domain}/admin/oauth/access_token"))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Accept", "application/json")
            .form(&params);
        let raw_json = execute_request(ConnectionProvider::Shopify, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        let access_token = Self::access_token(&raw_json)?;
        let access_token_expiry = Self::access_token_expiry(&raw_json)?;
        let refresh_token = Self::refresh_token(&raw_json)?;
        let extra_metadata = Self::extra_metadata(&raw_json);

        Ok(FinalizeResult {
            redirect_uri: redirect_uri.to_string(),
            code: code.to_string(),
            access_token,
            access_token_expiry: Some(access_token_expiry),
            refresh_token: Some(refresh_token),
            raw_json,
            extra_metadata,
        })
    }

    async fn refresh(
        &self,
        connection: &Connection,
        related_credentials: Option<Credential>,
    ) -> Result<RefreshResult, ProviderError> {
        let store_domain = self.store_domain(connection)?;
        let (client_id, client_secret) = Self::get_credentials(related_credentials)?;
        let refresh_token = connection
            .unseal_refresh_token()?
            .ok_or_else(|| anyhow!("Missing refresh token in Shopify connection"))?;
        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
        ];
        let req = self
            .reqwest_client()
            .post(format!("https://{store_domain}/admin/oauth/access_token"))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Accept", "application/json")
            .form(&params);
        let raw_json = execute_request(ConnectionProvider::Shopify, req)
            .await
            .map_err(|e| self.handle_provider_request_error(e))?;

        Ok(RefreshResult {
            access_token: Self::access_token(&raw_json)?,
            access_token_expiry: Some(Self::access_token_expiry(&raw_json)?),
            refresh_token: Some(Self::refresh_token(&raw_json)?),
            raw_json,
        })
    }

    fn scrubbed_raw_json(&self, raw_json: &serde_json::Value) -> Result<serde_json::Value> {
        let mut scrubbed = raw_json.clone();
        let object = scrubbed
            .as_object_mut()
            .ok_or_else(|| anyhow!("Invalid raw_json, not an object"))?;
        object.remove("access_token");
        object.remove("refresh_token");
        Ok(scrubbed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::oauth::{
        credential::{CredentialMetadata, CredentialProvider},
        encryption::seal_str,
    };
    use serde_json::json;

    #[test]
    fn scrubs_tokens_from_raw_response() -> Result<()> {
        let provider = ShopifyConnectionProvider::new();
        let scrubbed = provider.scrubbed_raw_json(&json!({
            "access_token": "access",
            "refresh_token": "refresh",
            "scope": "read_products"
        }))?;
        assert_eq!(scrubbed, json!({ "scope": "read_products" }));
        Ok(())
    }

    fn credential(content: serde_json::Value) -> Result<Credential> {
        Ok(Credential::new(
            "credential-id".to_string(),
            0,
            CredentialProvider::Shopify,
            CredentialMetadata {
                workspace_id: "workspace-id".to_string(),
                user_id: "user-id".to_string(),
            },
            seal_str(&content.to_string())?,
        ))
    }

    #[test]
    fn uses_the_related_app_credentials() -> Result<()> {
        assert_eq!(
            CredentialProvider::from(ConnectionProvider::Shopify),
            CredentialProvider::Shopify
        );
        let credentials = credential(json!({
            "client_id": "shopify-client",
            "client_secret": "shopify-secret"
        }))?;
        assert_eq!(
            ShopifyConnectionProvider::get_credentials(Some(credentials))?,
            ("shopify-client".to_string(), "shopify-secret".to_string())
        );
        Ok(())
    }

    #[test]
    fn rejects_missing_or_incomplete_credentials() -> Result<()> {
        assert!(ShopifyConnectionProvider::get_credentials(None).is_err());
        for content in [
            json!({ "client_id": "client" }),
            json!({ "client_secret": "secret" }),
            json!({ "client_id": "client", "client_secret": "" }),
            json!({ "client_id": 123, "client_secret": "secret" }),
        ] {
            assert!(
                ShopifyConnectionProvider::get_credentials(Some(credential(content)?)).is_err()
            );
        }
        Ok(())
    }
}
