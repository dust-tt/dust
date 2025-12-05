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
use zeroize::Zeroizing;

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
    let url = format!(
        "https://{account}.snowflakecomputing.com/session/v1/login-request",
        account = config.account
    );

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

    let response = match http
        .post(url)
        .query(&queries)
        .json(&json!({
            "data": login_data
        }))
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            return Err(e.into());
        }
    };

    let status = response.status();
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
    let pkcs8_pem = Zeroizing::new(private.to_pkcs8_pem(LineEnding::LF)?);
    let key = EncodingKey::from_rsa_pem(pkcs8_pem.as_bytes())?;
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
    let trimmed = pem.trim();

    // Detect PEM label to provide targeted guidance.
    let pem_label = trimmed
        .lines()
        .find_map(|l| l.strip_prefix("-----BEGIN "))
        .and_then(|rest| rest.strip_suffix("-----"))
        .map(|s| s.trim().to_string());

    if let Some(label) = pem_label.as_deref() {
        if label.eq_ignore_ascii_case("PUBLIC KEY") {
            return Err(Error::Decode(
                "A public key was provided. Please supply a private key PEM (-----BEGIN PRIVATE KEY----- or -----BEGIN RSA PRIVATE KEY-----). If you copied the Snowflake RSA_PUBLIC_KEY into this field, replace it with the corresponding private key.".to_string(),
            ));
        }
    }

    // Try formats in ordered sequence.
    if let Some(pass) = password {
        if let Ok(k) = RsaPrivateKey::from_pkcs8_encrypted_pem(trimmed, pass) {
            return Ok(k);
        }
    } else if let Ok(k) = RsaPrivateKey::from_pkcs8_encrypted_pem(trimmed, b"") {
        // Some encrypted keys use empty passphrases.
        return Ok(k);
    }

    if let Ok(k) = RsaPrivateKey::from_pkcs8_pem(trimmed) {
        return Ok(k);
    }

    if let Ok(k) = RsaPrivateKey::from_pkcs1_pem(trimmed) {
        return Ok(k);
    }

    // OpenSSL fallback for legacy/encrypted formats.
    if let Some(key) = try_parse_with_openssl(trimmed, password)? {
        return Ok(key);
    }

    let encrypted_label = pem_label
        .as_deref()
        .map(|l| l.eq_ignore_ascii_case("ENCRYPTED PRIVATE KEY"))
        .unwrap_or(false);
    let msg = if encrypted_label && password.is_none() {
        "Failed to parse private key. Encrypted key detected but no passphrase was provided. We attempted decryption with an empty passphrase and it failed. Provide 'private_key_passphrase' (non-empty) or use an unencrypted PKCS#8 private key (-----BEGIN PRIVATE KEY-----)."
            .to_string()
    } else {
        "Failed to parse private key. Supported formats: PKCS#8 (-----BEGIN PRIVATE KEY-----) and PKCS#1 (-----BEGIN RSA PRIVATE KEY-----). For encrypted keys, provide 'private_key_passphrase'."
            .to_string()
    };
    Err(Error::Decode(msg))
}

fn try_parse_with_openssl(pem: &str, password: Option<&[u8]>) -> Result<Option<RsaPrivateKey>> {
    use openssl::pkey::{Id, PKey};

    let parsed = if let Some(pass) = password {
        let mut pw = Zeroizing::new(pass.to_vec());
        PKey::private_key_from_pem_passphrase(pem.as_bytes(), &mut pw[..])
    } else {
        // Attempt with an empty passphrase first, then fall back to unencrypted parsing.
        let mut empty = Zeroizing::new(Vec::<u8>::new());
        match PKey::private_key_from_pem_passphrase(pem.as_bytes(), &mut empty[..]) {
            Ok(p) => Ok(p),
            Err(_) => PKey::private_key_from_pem(pem.as_bytes()),
        }
    };

    let pkey = match parsed {
        Ok(pkey) => pkey,
        Err(_) => return Ok(None),
    };

    if pkey.id() != Id::RSA {
        return Err(Error::UnsupportedFormat(
            "Unsupported private key algorithm; only RSA is supported.".to_string(),
        ));
    }

    // First try exporting PKCS#8 PEM then parse using rsa crate.
    if let Ok(pkcs8_pem_vec) = pkey.private_key_to_pem_pkcs8() {
        let pkcs8_pem = Zeroizing::new(pkcs8_pem_vec);
        if let Ok(s) = std::str::from_utf8(&pkcs8_pem) {
            if let Ok(k) = RsaPrivateKey::from_pkcs8_pem(s) {
                return Ok(Some(k));
            }
        }
    }

    // Fallback: export PKCS#1 DER and parse.
    match pkey.rsa() {
        Ok(r) => match r.private_key_to_der() {
            Ok(der_vec) => {
                let der = Zeroizing::new(der_vec);
                match RsaPrivateKey::from_pkcs1_der(&der) {
                    Ok(k) => Ok(Some(k)),
                    Err(_) => Ok(None),
                }
            }
            Err(_) => Ok(None),
        },
        Err(_) => Ok(None),
    }
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
