use crate::project::Project;
use crate::stores::store::Store;
use crate::utils;
use anyhow::{anyhow, Result};
use dns_lookup::lookup_host;
use hyper::body::Buf;
use lazy_static::lazy_static;
use regex::Regex;
use reqwest::{header, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io::prelude::*, str::FromStr};
use tracing::info;
use url::{Host, Url};

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

impl HttpRequest {
    pub fn new(method: &str, url: &str, headers: Value, body: Value) -> Result<Self> {
        let mut hasher = blake3::Hasher::new();
        hasher.update(method.as_bytes());
        hasher.update(url.as_bytes());
        hasher.update(serde_json::to_string(&headers)?.as_bytes());
        hasher.update(serde_json::to_string(&body)?.as_bytes());

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

        let parsed_url = Url::parse(self.url.as_str())?;

        let _: Vec<std::net::Ipv4Addr> = match parsed_url.host() {
            Some(h) => match h {
                Host::Domain(d) => {
                    let ipv4: Vec<std::net::Ipv4Addr> = lookup_host(d)?
                        .into_iter()
                        .filter_map(|ip| match ip {
                            std::net::IpAddr::V4(ip) => Some(ip),
                            _ => None,
                        })
                        .collect::<Vec<_>>();
                    match ipv4.len() {
                        0 => Err(anyhow!("Could not find an ipv4 address for host: {}", d))?,
                        _ => ipv4,
                    }
                }
                Host::Ipv4(ip) => vec![ip],
                Host::Ipv6(_) => Err(anyhow!("Ipv6 addresses are not supported."))?,
            },
            None => Err(anyhow!("Provided URL has an empty host"))?,
        }
        .into_iter()
        .map(|ip| {
            lazy_static! {
                static ref RE: Regex = Regex::new(r"^(0|127|10|192\.168)\..*").unwrap();
            }
            // println!("IP {}", ip.to_string());
            match RE.is_match(ip.to_string().as_str()) {
                true => Err(anyhow!("Forbidden IP range"))?,
                false => Ok(ip),
            }
        })
        .collect::<Result<Vec<_>>>()?;

        // TODO(spolu): encode query
        // TODO(spolu): timeout requests

        let req = reqwest::Client::new()
            .request(method, self.url.as_str())
            .headers(
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
