use crate::providers::provider::{ModelError, ModelErrorRetryOptions};
use crate::run::Credentials;
use crate::utils;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use hyper::{body::Buf, Body, Client, Method, Request, Uri};
use hyper_tls::HttpsConnector;
use serde::{Deserialize, Serialize};
use std::io::prelude::*;
use std::str::FromStr;
use std::time::Duration;
use urlencoding::encode;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
pub enum ProviderID {
    Google,
}

impl ToString for ProviderID {
    fn to_string(&self) -> String {
        match self {
            ProviderID::Google => String::from("google_search"),
        }
    }
}

impl FromStr for ProviderID {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "google_search" => Ok(ProviderID::Google),
            _ => Err(ParseError::with_message(
                "Unknown provider ID (possible values: google)",
            ))?,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub message: String,
}

pub struct GoogleSearch {
    search_engine_id: Option<String>,
    api_key: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Clone, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub html_title: String,
    pub snippet: String,
    pub html_snippet: String,
    pub provider: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct SearchResponse {
    pub created: u64,
    pub items: Vec<SearchResult>,
    pub provider: String,
    pub query: String,
}

impl GoogleSearch {
    pub fn new() -> Self {
        GoogleSearch {
            search_engine_id: None,
            api_key: None,
        }
    }

    fn uri(&self, q: String) -> Result<Uri> {
        Ok(format!(
            "https://www.googleapis.com/customsearch/v1?cx={}&q={}&key={}",
            self.search_engine_id.clone().unwrap(),
            encode(&q),
            self.api_key.clone().unwrap(),
        )
        .parse::<Uri>()?)
    }

    pub async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("GOOGLE_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("GOOGLE_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `GOOGLE_API_KEY` is not set."
                ))?,
            },
        }
        match credentials.get("SEARCH_ENGINE_ID") {
            Some(search_engine_id) => {
                self.search_engine_id = Some(search_engine_id.clone());
            }
            None => {
                match tokio::task::spawn_blocking(|| std::env::var("SEARCH_ENGINE_ID")).await? {
                    Ok(key) => {
                        self.search_engine_id = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `SEARCH_ENGINE_ID` is not set."
                    ))?,
                }
            }
        }
        Ok(())
    }

    pub async fn query(&self, q: &str) -> Result<SearchResponse> {
        assert!(self.api_key.is_some());

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let req = Request::builder()
            .method(Method::GET)
            .uri(self.uri(q.to_string()).unwrap())
            .header("Content-Type", "application/json")
            .body(Body::empty())?;

        let res = cli.request(req).await?;
        let status = res.status();
        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let response = match status {
            hyper::StatusCode::OK => {
                let raw_response: serde_json::Value = serde_json::from_slice(c)?;
                let response = raw_response["items"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|item| SearchResult {
                        title: item["title"].as_str().unwrap().to_string(),
                        html_title: item["htmlTitle"].as_str().unwrap().to_string(),
                        snippet: item["snippet"].as_str().unwrap().to_string(),
                        html_snippet: item["htmlSnippet"].as_str().unwrap().to_string(),
                        provider: "google_search".to_string(),
                    })
                    .collect::<Vec<SearchResult>>();

                Ok(response)
            }
            hyper::StatusCode::TOO_MANY_REQUESTS => {
                let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                    message: "Too many requests".to_string(),
                });
                Err(ModelError {
                    message: format!("GogoleAPIError: {}", error.message),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                })
            }
            _ => {
                let error: Error = serde_json::from_slice(c)?;
                Err(ModelError {
                    message: format!("GoogleAPIError: {}", error.message),
                    retryable: None,
                })
            }
        }?;
        Ok(SearchResponse {
            created: utils::now(),
            items: response,
            provider: "google_search".to_string(),
            query: q.to_string(),
        })
    }
}
