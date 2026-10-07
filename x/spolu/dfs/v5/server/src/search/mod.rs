mod index;
mod query;
pub(crate) mod queue;
mod worker;

use crate::State;
use clap::Args;
use dfs_protocol::{error::status, rpc::ErrorCode};
use reqwest::{Client, Method};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Mutex, Semaphore, watch};
use tonic::Status;

#[derive(Args, Clone, Debug)]
pub struct SearchConfig {
    #[arg(long, env = "DFS_ES_URL")]
    pub es_url: Option<String>,
    #[arg(long, env = "DFS_ES_INDEX", default_value = "dfs-v5-local")]
    pub es_index: String,
}

pub struct Search {
    http: Client,
    config: SearchConfig,
    admission: Semaphore,
    stop: watch::Sender<bool>,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}
impl Search {
    pub fn open(config: SearchConfig) -> anyhow::Result<Arc<Self>> {
        anyhow::ensure!(
            !config.es_index.is_empty()
                && config.es_index.len() <= 200
                && config
                    .es_index
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                && config.es_index.as_bytes()[0].is_ascii_alphanumeric(),
            "invalid ES index name"
        );
        let url = reqwest::Url::parse(
            config
                .es_url
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("ES URL required"))?,
        )?;
        anyhow::ensure!(
            matches!(url.scheme(), "http" | "https")
                && url.query().is_none()
                && url.fragment().is_none()
                && url.path() == "/"
                && url.username().is_empty()
                && url.password().is_none(),
            "ES URL must be an HTTP origin"
        );
        let (stop, _) = watch::channel(false);
        Ok(Arc::new(Self {
            http: Client::builder().timeout(Duration::from_secs(30)).build()?,
            config,
            admission: Semaphore::new(4),
            stop,
            task: Mutex::new(None),
        }))
    }
    fn request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {
        self.http.request(
            method,
            format!(
                "{}{path}",
                self.config
                    .es_url
                    .as_deref()
                    .unwrap_or("")
                    .trim_end_matches('/')
            ),
        )
    }
    /// @cc [owner:spolu,label:security;performance] bounded-es-response
    /// Backend bodies MUST be bounded and MUST NOT appear in client errors or logs.
    async fn response(request: reqwest::RequestBuilder) -> Result<(u16, Value), Status> {
        let mut response = request
            .send()
            .await
            .map_err(|_| status(ErrorCode::Unavailable))?;
        let code = response.status().as_u16();
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| status(ErrorCode::Unavailable))?
        {
            if bytes.len() + chunk.len() > 16 * 1024 * 1024 {
                return Err(status(ErrorCode::Capacity));
            }
            bytes.extend_from_slice(&chunk);
        }
        let body = serde_json::from_slice(&bytes).map_err(|_| status(ErrorCode::Unavailable))?;
        Ok((code, body))
    }
    async fn json(&self, method: Method, path: &str, body: &Value) -> Result<Value, Status> {
        let request = self.request(method, path);
        let request = if body.as_object().is_some_and(|value| value.is_empty()) {
            request
        } else {
            request.json(body)
        };
        let (code, result) = Self::response(request).await?;
        if !(200..300).contains(&code) {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(result)
    }
    /// @cc [owner:spolu,label:backend;concurrency] generation-bound-write-target
    /// Every index incarnation MUST atomically create its own unique write alias. Bulk writes MUST
    /// require that alias so a delayed request cannot auto-create an unmapped index or write into a
    /// replacement incarnation after deletion. Existing foreign or incomplete schemas MUST fail.
    async fn ensure_index(&self) -> Result<(String, String), Status> {
        let path = format!("/{}", self.config.es_index);
        let (code, mut value) = Self::response(self.request(Method::GET, &path)).await?;
        if code == 404 {
            let alias = format!(
                "{}-write-{}",
                self.config.es_index,
                uuid::Uuid::new_v4().simple()
            );
            let (created, _) = Self::response(
                self.request(Method::PUT, &path)
                    .json(&index::schema(&alias)),
            )
            .await?;
            if created != 200 && created != 400 {
                return Err(status(ErrorCode::Unavailable));
            }
            value = self.json(Method::GET, &path, &json!({})).await?;
        } else if code != 200 {
            return Err(status(ErrorCode::Unavailable));
        }
        let info = &value[&self.config.es_index];
        if info["mappings"]["_meta"]["dfs_format"] != "dfs-v5-es-2" {
            return Err(status(ErrorCode::Unavailable));
        }
        let alias = info["mappings"]["_meta"]["write_alias"]
            .as_str()
            .filter(|alias| {
                alias.starts_with(&format!("{}-write-", self.config.es_index))
                    && info["aliases"].get(*alias).is_some()
            })
            .ok_or_else(|| status(ErrorCode::Unavailable))?;
        let generation = info["settings"]["index"]["uuid"]
            .as_str()
            .ok_or_else(|| status(ErrorCode::Unavailable))?;
        Ok((generation.to_owned(), alias.to_owned()))
    }
    pub async fn start(self: &Arc<Self>, state: &Arc<State>) -> anyhow::Result<()> {
        let mut task = self.task.lock().await;
        anyhow::ensure!(task.is_none(), "search worker already started");
        let search = self.clone();
        let state = Arc::downgrade(state);
        *task = Some(tokio::spawn(async move { search.run(state).await }));
        Ok(())
    }
    pub async fn stop(&self) -> anyhow::Result<()> {
        self.stop.send_replace(true);
        if let Some(task) = self.task.lock().await.take() {
            task.await?;
        }
        Ok(())
    }
}
