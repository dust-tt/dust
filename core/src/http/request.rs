use crate::info;
use crate::stores::store::Store;
use crate::utils;
use crate::{cached_request::CachedRequest, project::Project};
use anyhow::{anyhow, Result};
use hyper::body::Buf;
use reqwest::redirect::Policy;
use reqwest::{header, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io::prelude::*, str::FromStr};

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
}

impl CachedRequest for HttpRequest {
    /// The version of the cache. This should be incremented whenever the inputs or
    /// outputs of the request are changed, to ensure that the cached data is invalidated.
    const VERSION: i32 = 1;

    const REQUEST_TYPE: &'static str = "http";
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

    pub async fn execute(&self) -> Result<HttpResponse> {
        let method = match self.method.as_str() {
            "GET" => Method::GET,
            "POST" => Method::POST,
            "PUT" => Method::PUT,
            "PATCH" => Method::PATCH,
            _ => Err(anyhow!(
                "Invalid method {}, supported methods are GET, POST, PUT.",
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
                // Log the redirect for debugging.
                println!(
                    "Redirect attempt from: {:?} to: {}",
                    attempt.previous(),
                    attempt.url()
                );

                // Ensure the URL is not pointing to a private IP.
                match NetworkUtils::check_url_for_private_ip(attempt.url().as_str()) {
                    Ok(_) => attempt.follow(),
                    Err(e) => {
                        println!("Attempt to follow redirect to private IP: {}", e);
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

        let res = req.send().await?;

        let status = res.status();
        let headers = res.headers().clone();

        let body = res.bytes().await?;
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
                info!(
                    method = self.method.as_str(),
                    url = self.url.as_str(),
                    hash = self.hash.as_str(),
                    "Retrieved cached HTTPRequest"
                );
                Ok(response)
            }
            None => {
                let response = self.execute().await?;
                info!(
                    method = self.method.as_str(),
                    url = self.url.as_str(),
                    hash = self.hash.as_str(),
                    "Performed fresh HTTPRequest"
                );
                store.http_cache_store(&project, self, &response).await?;
                Ok(response)
            }
        }
    }
}
