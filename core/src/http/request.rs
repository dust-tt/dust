use crate::stores::store::Store;
use crate::utils;
use crate::{cached_request::CachedRequest, project::Project};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine as _};
use hyper::body::Buf;
use reqwest::redirect::Policy;
use reqwest::{header, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io::prelude::*, str::FromStr};
use tracing::info;
use url::Url;

use super::network::NetworkUtils;
use super::proxy_client::create_untrusted_egress_client_builder;

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct HttpRequest {
    hash: String,
    method: String,
    url: String,
    body: Value,
    headers: Value,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct HttpResponse {
    pub created: u64,
    pub status: u16,
    pub headers: Value,
    pub body: Value,
    pub body_base64: Option<String>,
}

impl CachedRequest for HttpRequest {
    /// The version of the cache. This should be incremented whenever the inputs or
    /// outputs of the request are changed, to ensure that the cached data is invalidated.
    const VERSION: i32 = 1;

    const REQUEST_TYPE: &'static str = "http";
}

/// Scheme, host, port, and path only. Query, fragment, and userinfo are dropped:
/// browser, search, and curl blocks put vendor keys and dust app secrets there.
fn redacted_url(url: &str) -> String {
    let Ok(mut parsed) = Url::parse(url) else {
        return "<unparseable-url>".to_string();
    };
    parsed.set_query(None);
    parsed.set_fragment(None);
    if parsed.set_password(None).is_err() || parsed.set_username("").is_err() {
        return "<unparseable-url>".to_string();
    }
    parsed.to_string()
}

impl HttpRequest {
    pub fn new(method: &str, url: &str, headers: Value, body: Value) -> Result<Self> {
        let mut hasher = blake3::Hasher::new();
        hasher.update(method.as_bytes());
        hasher.update(url.as_bytes());
        hasher.update(serde_json::to_string(&headers)?.as_bytes());
        hasher.update(serde_json::to_string(&body)?.as_bytes());
        hasher.update(HttpRequest::version().to_string().as_bytes());

        let hash = format!("{}", hasher.finalize().to_hex());

        Ok(Self {
            hash,
            method: method.to_string(),
            url: url.to_string(),
            headers,
            body,
        })
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    /// Copy safe to write to `cache.request`. The hash is unchanged so lookups still hit.
    /// Headers and body are dropped entirely: curl blocks interpolate secrets into both.
    fn redacted_for_storage(&self) -> Self {
        Self {
            hash: self.hash.clone(),
            method: self.method.clone(),
            url: redacted_url(&self.url),
            body: Value::Null,
            headers: Value::Object(serde_json::Map::new()),
        }
    }

    pub async fn execute(&self) -> Result<HttpResponse> {
        let method = match self.method.as_str() {
            "GET" => Method::GET,
            "POST" => Method::POST,
            "PUT" => Method::PUT,
            "PATCH" => Method::PATCH,
            "DELETE" => Method::DELETE,
            _ => Err(anyhow!(
                "Invalid method {}, supported methods are GET, POST, PUT, PATCH, DELETE.",
                self.method
            ))?,
        };

        // TODO(spolu): encode query
        // TODO(spolu): timeout requests

        // First check the initial URL.
        NetworkUtils::check_url_for_private_ip(&self.url)?;

        // Create the client with the untrusted egress proxy and custom redirect policy.
        let client_builder =
            create_untrusted_egress_client_builder().redirect(Policy::custom(|attempt| {
                let from = attempt
                    .previous()
                    .iter()
                    .map(|u| redacted_url(u.as_str()))
                    .collect::<Vec<_>>()
                    .join(" -> ");
                let to = redacted_url(attempt.url().as_str());
                info!(from = from.as_str(), to = to.as_str(), "HTTP redirect");

                // Ensure the URL is not pointing to a private IP.
                match NetworkUtils::check_url_for_private_ip(attempt.url().as_str()) {
                    Ok(_) => attempt.follow(),
                    Err(e) => {
                        info!(
                            error = %e,
                            to = to.as_str(),
                            "Refusing redirect to a private IP"
                        );
                        attempt.error(e)
                    }
                }
            }));

        let client = client_builder
            .build()
            .map_err(|e| anyhow!("Failed to build HTTP client: {}", e))?;

        let req = client.request(method, self.url.as_str()).headers(
            self.headers
                .as_object()
                .unwrap_or(&serde_json::Map::new())
                .iter()
                .map(|(k, v)| match v {
                    Value::String(v) => Ok((
                        header::HeaderName::from_str(k)?,
                        header::HeaderValue::from_str(v)?,
                    )),
                    _ => Err(anyhow!("Header value for header {} must be a string", k)),
                })
                .collect::<Result<header::HeaderMap>>()?,
        );

        let req = match &self.body {
            Value::Object(body) => req.json(&serde_json::to_string(body)?),
            Value::String(body) => req.body(body.to_string()),
            Value::Null => req,
            _ => Err(anyhow!("Returned body must be either a string or null."))?,
        };

        let safe_url = redacted_url(&self.url);
        // reqwest errors include the full URL. Drop it before the error can reach logs.
        let res = req.send().await.map_err(|e| {
            anyhow!(e.without_url()).context(format!("HTTP request failed ({safe_url})"))
        })?;

        let status = res.status();
        let headers = res.headers().clone();

        let body = res.bytes().await.map_err(|e| {
            anyhow!(e.without_url()).context(format!("HTTP response body failed ({safe_url})"))
        })?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;

        let response_body = String::from_utf8_lossy(&b).into_owned();

        Ok(HttpResponse {
            created: utils::now(),
            status: status.as_u16(),
            headers: Value::Object(
                headers
                    .iter()
                    .map(|(k, v)| {
                        (
                            k.as_str().to_string(),
                            Value::String(v.to_str().unwrap_or("").to_string()),
                        )
                    })
                    .collect::<serde_json::Map<String, Value>>(),
            ),
            body: match serde_json::from_str::<serde_json::Value>(&response_body) {
                Ok(body) => body,
                Err(_) => Value::String(response_body),
            },
            body_base64: {
                let is_textual = headers
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .is_some_and(|ct| {
                        ct.starts_with("text/")
                            || ct.starts_with("application/json")
                            || ct.starts_with("application/xml")
                            || ct.starts_with("application/javascript")
                    });
                (!is_textual).then(|| general_purpose::STANDARD.encode(&b))
            },
        })
    }

    pub async fn execute_with_cache(
        &self,
        project: Project,
        store: Box<dyn Store + Send + Sync>,
        use_cache: bool,
    ) -> Result<HttpResponse> {
        let response = {
            match use_cache {
                false => None,
                true => {
                    let mut responses = store.http_cache_get(&project, self).await?;
                    match responses.len() {
                        0 => None,
                        _ => Some(responses.remove(0)),
                    }
                }
            }
        };

        match response {
            Some(response) => {
                let url = redacted_url(&self.url);
                info!(
                    method = self.method.as_str(),
                    url = url.as_str(),
                    hash = self.hash.as_str(),
                    "Retrieved cached HTTPRequest"
                );
                Ok(response)
            }
            None => {
                let response = self.execute().await?;
                let url = redacted_url(&self.url);
                info!(
                    method = self.method.as_str(),
                    url = url.as_str(),
                    hash = self.hash.as_str(),
                    "Performed fresh HTTPRequest"
                );
                let stored = self.redacted_for_storage();
                store.http_cache_store(&project, &stored, &response).await?;
                Ok(response)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn redacted_url_keeps_scheme_host_port_and_path() {
        assert_eq!(
            redacted_url("https://chrome.browserless.io:443/scrape?token=secret-token"),
            "https://chrome.browserless.io/scrape"
        );
        assert_eq!(
            redacted_url("https://serpapi.com/search?q=hello&engine=google&api_key=sk-live"),
            "https://serpapi.com/search"
        );
        assert_eq!(
            redacted_url("https://api.example.com:8443/v1/run?access_token=abc#frag"),
            "https://api.example.com:8443/v1/run"
        );
    }

    #[test]
    fn redacted_url_drops_userinfo_and_unparseable_input() {
        assert_eq!(
            redacted_url("https://user:s3cret@example.com/path?token=abc"),
            "https://example.com/path"
        );
        assert_eq!(redacted_url("not a url token=abc"), "<unparseable-url>");
    }

    #[test]
    fn redacted_for_storage_drops_secrets_and_keeps_hash() {
        let request = HttpRequest::new(
            "POST",
            "https://google.serper.dev/search?api_key=sk-live",
            json!({ "X-API-KEY": "sk-live", "Content-Type": "application/json" }),
            json!({ "q": "hello", "secret": "dust-app-secret" }),
        )
        .unwrap();

        let stored = request.redacted_for_storage();
        assert!(request.url.contains("sk-live"));
        assert_eq!(stored.hash(), request.hash());
        assert_eq!(stored.method, "POST");
        assert_eq!(stored.url, "https://google.serper.dev/search");
        assert_eq!(stored.headers, json!({}));
        assert_eq!(stored.body, Value::Null);

        let serialized = serde_json::to_string(&stored).unwrap();
        assert!(!serialized.contains("sk-live"));
        assert!(!serialized.contains("dust-app-secret"));
        assert!(!serialized.contains("X-API-KEY"));
    }
}
