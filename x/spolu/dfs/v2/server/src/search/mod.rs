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
    #[arg(long, env = "DFS_ES_URL", default_value = "http://es:9200")]
    pub es_url: String,
    #[arg(long, env = "DFS_ES_INDEX", default_value = "dfs-v2-local")]
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
        let url = reqwest::Url::parse(&config.es_url)?;
        anyhow::ensure!(
            matches!(url.scheme(), "http" | "https")
                && url.query().is_none()
                && url.fragment().is_none()
                && url.path() == "/",
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
            format!("{}{path}", self.config.es_url.trim_end_matches('/')),
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
    async fn ensure_index(&self) -> Result<String, Status> {
        let path = format!("/{}", self.config.es_index);
        let (code, mut value) = Self::response(self.request(Method::GET, &path)).await?;
        if code == 404 {
            let (created, _) =
                Self::response(self.request(Method::PUT, &path).json(&index::schema())).await?;
            if created != 200 && created != 400 {
                return Err(status(ErrorCode::Unavailable));
            }
            value = self.json(Method::GET, &path, &json!({})).await?;
        } else if code != 200 {
            return Err(status(ErrorCode::Unavailable));
        }
        let info = &value[&self.config.es_index];
        if info["mappings"]["_meta"]["dfs_format"] != "dfs-v2-es-1" {
            return Err(status(ErrorCode::Unavailable));
        }
        info["settings"]["index"]["uuid"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| status(ErrorCode::Unavailable))
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

#[cfg(test)]
pub(crate) mod tests;
