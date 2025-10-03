use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey, LineEnding};
use reqwest::Client;
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::RsaPrivateKey;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tracing::debug;

use super::{
    client::SnowflakeAuthMethod, client::SnowflakeClientConfig, error::Error, error::Result,
};

/// Login to Snowflake and return a session token.
pub async fn login(
    http: &Client,
    username: &str,
    auth: &SnowflakeAuthMethod,
    config: &SnowflakeClientConfig,
) -> Result<String> {
    debug!("login() called");
    let url = format!(
        "https://{account}.snowflakecomputing.com/session/v1/login-request",
        account = config.account
    );
    debug!("Login URL: {}", url);

    let mut queries = vec![];
    if let Some(warehouse) = &config.warehouse {
        queries.push(("warehouse", warehouse));
    }
    if let Some(database) = &config.database {
        queries.push(("databaseName", database));
    }
    if let Some(schema) = &config.schema {
        queries.push(("schemaName", schema));
    }
    if let Some(role) = &config.role {
        queries.push(("roleName", role));
    }

    let login_data = login_request_data(username, auth, config)?;
    debug!("Sending login request...");
    debug!("Query params: {:?}", queries);

    let start_time = std::time::Instant::now();
    let response = match http
        .post(url)
        .query(&queries)
        .json(&json!({
            "data": login_data
        }))
        .send()
        .await
    {
        Ok(resp) => {
            debug!("Got response after {:?}", start_time.elapsed());
            resp
        }
        Err(e) => {
            debug!("Request failed after {:?}: {:?}", start_time.elapsed(), e);
            return Err(e.into());
        }
    };

    let status = response.status();
    debug!("Response status: {}", status);
    let body = response.text().await?;
    if !status.is_success() {
        debug!("Login failed with status {}: {}", status, body);
        return Err(Error::Communication(body));
    }

    let response: Response = serde_json::from_str(&body).map_err(|_| Error::Communication(body))?;
    if !response.success {
        return Err(Error::Communication(response.message.unwrap_or_default()));
    }

    Ok(response.data.token)
}

fn login_request_data(
    username: &str,
    auth: &SnowflakeAuthMethod,
    config: &SnowflakeClientConfig,
) -> Result<Value> {
    match auth {
        SnowflakeAuthMethod::Password(password) => Ok(json!({
            "LOGIN_NAME": username,
            "PASSWORD": password,
            "ACCOUNT_NAME": config.account
        })),
        SnowflakeAuthMethod::KeyPair { pem, password } => {
            let jwt = generate_jwt_from_key_pair(
                pem,
                password.as_ref().map(|p| p.as_slice()),
                username,
                &config.account,
                Utc::now().timestamp(),
            )?;
            Ok(json!({
                "LOGIN_NAME": username,
                "ACCOUNT_NAME": config.account,
                "TOKEN": jwt,
                "AUTHENTICATOR": "SNOWFLAKE_JWT"
            }))
        }
    }
}

fn generate_jwt_from_key_pair(
    pem: &str,
    password: Option<&[u8]>,
    username: &str,
    account: &str,
    timestamp: i64,
) -> Result<String> {
    let account = account
        .split('.')
        .next()
        .map(|s| s.to_ascii_uppercase())
        .unwrap_or_default();
    let username = username.to_ascii_uppercase();

    let private = try_parse_private_key(pem, password)?;

    let public = private.to_public_key();
    let der = public.to_public_key_der()?;
    let mut hasher = Sha256::new();
    hasher.update(der);
    let hash = hasher.finalize();
    let fingerprint = STANDARD.encode(hash);

    let payload = json!({
        "iss": format!("{}.{}.SHA256:{}", account, username, fingerprint),
        "sub": format!("{}.{}", account, username),
        "iat": timestamp,
        "exp": timestamp + 600
    });
    let key = EncodingKey::from_rsa_pem(private.to_pkcs8_pem(LineEnding::LF)?.as_bytes())?;
    let jwt = jsonwebtoken::encode(
        &Header {
            alg: Algorithm::RS256,
            ..Default::default()
        },
        &payload,
        &key,
    )?;
    Ok(jwt)
}

fn try_parse_private_key(pem: &str, password: Option<&[u8]>) -> Result<RsaPrivateKey> {
    if let Some(password) = password {
        if !password.is_empty() {
            if let Ok(private) = RsaPrivateKey::from_pkcs8_encrypted_pem(pem, password) {
                return Ok(private);
            }
        }
    }

    if let Ok(private) = RsaPrivateKey::from_pkcs8_encrypted_pem(pem, b"") {
        return Ok(private);
    }

    RsaPrivateKey::from_pkcs8_pem(pem).or_else(|pkcs8_err| {
        RsaPrivateKey::from_pkcs1_pem(pem).map_err(|pkcs1_err| {
            Error::Decode(format!(
                "Failed to parse private key. PKCS8 error: {}, PKCS1 error: {}",
                pkcs8_err, pkcs1_err
            ))
        })
    })
}

#[derive(serde::Deserialize)]
struct LoginResponse {
    token: String,
}

#[derive(serde:: Deserialize)]
struct Response {
    data: LoginResponse,
    message: Option<String>,
    success: bool,
}
