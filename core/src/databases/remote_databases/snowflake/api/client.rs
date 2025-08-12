use reqwest::{Client, ClientBuilder, Proxy};
use std::time::Duration;
use tracing::debug;

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
        let mut builder = ClientBuilder::new()
            .gzip(true)
            .use_rustls_tls()
            .timeout(std::time::Duration::from_secs(60));

        // Only enable verbose connection logging in debug mode
        if tracing::enabled!(tracing::Level::DEBUG) {
            builder = builder.connection_verbose(true);
        }

        let client = builder.build()?;
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

        let mut builder = ClientBuilder::new()
            .gzip(true)
            .use_rustls_tls()
            .proxy(proxy)
            .timeout(std::time::Duration::from_secs(60));

        // Only enable verbose connection logging in debug mode
        if tracing::enabled!(tracing::Level::DEBUG) {
            builder = builder.connection_verbose(true);
        }

        let client = builder.build()?;
        Ok(Self {
            http: client,
            username: self.username,
            auth: self.auth,
            config: self.config,
        })
    }

    pub async fn create_session(&self) -> Result<SnowflakeSession> {
        debug!("SnowflakeClient::create_session() called");
        debug!("Attempting login for user: {}", self.username);
        let session_token = match login(&self.http, &self.username, &self.auth, &self.config).await
        {
            Ok(token) => {
                debug!("Login successful, got session token");
                token
            }
            Err(e) => {
                debug!("Login failed: {:?}", e);
                return Err(e);
            }
        };

        let session = SnowflakeSession {
            http: self.http.clone(),
            account: self.config.account.clone(),
            session_token,
            timeout: self.config.timeout,
        };
        debug!("SnowflakeSession created successfully");
        Ok(session)
    }
}
