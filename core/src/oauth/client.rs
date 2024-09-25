use anyhow::{anyhow, Result};
use lazy_static::lazy_static;
use std::str::FromStr;

use crate::oauth::credential::CredentialProvider;

lazy_static! {
    static ref OAUTH_API: String = std::env::var("OAUTH_API").unwrap();
    static ref OAUTH_API_KEY: String = std::env::var("OAUTH_API_KEY").unwrap();
}

// Meant to query the `oauth`` service from `core`
pub struct OauthClient {}

impl OauthClient {
    pub async fn get_credential(credential_id: &str) -> Result<(CredentialProvider, String)> {
        let res = reqwest::Client::new()
            .get(format!("{}/credentials/{}", *OAUTH_API, credential_id))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", *OAUTH_API_KEY))
            .send()
            .await?;

        match res.status().as_u16() {
            200 => {
                let body = res.text().await?;
                let json = serde_json::from_str::<serde_json::Value>(&body)?;
                let content = json["content"].to_string();
                let provider =
                    CredentialProvider::from_str(&json["provider"].as_str().ok_or_else(|| {
                        anyhow!("Invalid response from `oauth`: missing provider")
                    })?)?;

                Ok((provider, content))
            }
            s => Err(anyhow!("Failed to get credential. Status: {}", s)),
        }
    }
}
