use reqwest::{Client, ClientBuilder, Proxy};
use std::time::Duration;

use super::{auth::login, error::Result, session::SnowflakeSession};

#[derive(Clone)]
pub struct SnowflakeClient {
    http: Client,

    username: String,
    auth: SnowflakeAuthMethod,
    config: SnowflakeClientConfig,
}

#[derive(Default, Clone)]
pub struct SnowflakeClientConfig {
    pub account: String,

    pub warehouse: Option<String>,
    pub database: Option<String>,
    pub schema: Option<String>,
    pub role: Option<String>,
    pub timeout: Option<Duration>,
}

#[derive(Clone)]
pub enum SnowflakeAuthMethod {
    Password(String),
    KeyPair {
        pem: String,
        password: Option<Vec<u8>>,
    },
}

impl SnowflakeClient {
    pub fn new(
        username: &str,
        auth: SnowflakeAuthMethod,
        config: SnowflakeClientConfig,
    ) -> Result<Self> {
        let client = ClientBuilder::new().gzip(true).use_rustls_tls().build()?;
        Ok(Self {
            http: client,
            username: username.to_string(),
            auth,
            config,
        })
    }

    pub fn with_proxy(self, host: &str, port: u16, username: &str, password: &str) -> Result<Self> {
        let proxy = Proxy::all(format!("http://{}:{}", host, port).as_str())?
            .basic_auth(username, password);

        let client = ClientBuilder::new()
            .gzip(true)
            .use_rustls_tls()
            .proxy(proxy)
            .build()?;
        Ok(Self {
            http: client,
            username: self.username,
            auth: self.auth,
            config: self.config,
        })
    }

    pub async fn create_session(&self) -> Result<SnowflakeSession> {
        let session_token = login(&self.http, &self.username, &self.auth, &self.config).await?;
        Ok(SnowflakeSession {
            http: self.http.clone(),
            // Replace any `_` with `-` in the account name for nginx proxy.
            account: self.config.account.clone().replace('_', "-"),
            session_token,
            timeout: self.config.timeout,
        })
    }
}
