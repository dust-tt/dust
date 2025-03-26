use anyhow::{anyhow, Result};
use lazy_static::lazy_static;
use serde::Deserialize;

use crate::{
    oauth::app::ConnectionAccessTokenResponse, oauth::credential::CredentialProvider,
    utils::APIResponse,
};

lazy_static! {
    static ref OAUTH_API: String = std::env::var("OAUTH_API").unwrap();
    static ref OAUTH_API_KEY: String = std::env::var("OAUTH_API_KEY").unwrap_or_default();
}

#[derive(Debug, Deserialize)]
struct CredentialReponse {
    provider: CredentialProvider,
    content: serde_json::Map<String, serde_json::Value>,
}

// Meant to query the `oauth`` service from `core`
pub struct OauthClient {}

impl OauthClient {
    pub async fn get_credential(
        credential_id: &str,
    ) -> Result<(
        CredentialProvider,
        serde_json::Map<String, serde_json::Value>,
    )> {
        let res = reqwest::Client::new()
            .get(format!("{}/credentials/{}", *OAUTH_API, credential_id))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", *OAUTH_API_KEY))
            .send()
            .await?;

        match res.status().as_u16() {
            200 => {
                let body = res.text().await?;
                let response = serde_json::from_str::<APIResponse>(&body)?
                    .response
                    .ok_or_else(|| {
                        anyhow!("Failed to get credential: missing response from `oauth`")
                    })?;
                let credential = response.get("credential").ok_or_else(|| {
                    anyhow!("Failed to get credential: missing credential from `oauth`")
                })?;
                let credential = serde_json::from_value::<CredentialReponse>(credential.to_owned())
                    .map_err(|e| anyhow!("Failed to parse credential: {}", e))?;

                Ok((credential.provider, credential.content))
            }
            s => Err(anyhow!("Failed to get credential. Status: {}", s)),
        }
    }

    pub async fn get_connection_access_token(
        secret_id: &str,
    ) -> Result<ConnectionAccessTokenResponse> {
        let res = reqwest::Client::new()
            .get(format!(
                "{}/connections/{}/access_token",
                *OAUTH_API, secret_id
            ))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", *OAUTH_API_KEY))
            .send()
            .await?;

        match res.status().as_u16() {
            200 => {
                let r = res.json::<APIResponse>().await?;
                let connection = match r.response {
                    Some(response) => {
                        serde_json::from_value::<ConnectionAccessTokenResponse>(response)?
                    }
                    None => {
                        return Err(anyhow!(
                            "Failed to get access token. Missing response from `oauth`"
                        ))
                    }
                };
                Ok(connection)
            }
            s => Err(anyhow!("Failed to get access token. Status: {}", s)),
        }
    }
}
