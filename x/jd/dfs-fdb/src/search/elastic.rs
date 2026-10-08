use anyhow::{Context, Result, bail, ensure};
use reqwest::{Client, Method, StatusCode, Url};
use serde_json::{Value, json};
use std::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};

pub(super) struct Elastic {
    client: Client,
    endpoints: Vec<Url>,
    next: AtomicUsize,
}

impl Elastic {
    pub fn new(endpoints: Vec<String>) -> Result<Self> {
        ensure!(
            !endpoints.is_empty() && endpoints.len() <= 16,
            "Elasticsearch endpoints"
        );
        let endpoints = endpoints
            .into_iter()
            .map(|endpoint| {
                let url = Url::parse(&endpoint)?;
                ensure!(
                    matches!(url.scheme(), "http" | "https")
                        && url.host_str().is_some()
                        && url.username().is_empty()
                        && url.password().is_none()
                        && url.query().is_none()
                        && url.fragment().is_none()
                        && url.path() == "/",
                    "invalid Elasticsearch endpoint"
                );
                Ok(url)
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            client: Client::builder()
                .connect_timeout(Duration::from_secs(2))
                .timeout(Duration::from_secs(15))
                .pool_max_idle_per_host(8)
                .build()?,
            endpoints,
            next: AtomicUsize::new(0),
        })
    }

    pub async fn request(
        &self,
        method: Method,
        path: &str,
        body: Vec<u8>,
    ) -> Result<(StatusCode, Value)> {
        ensure!(body.len() <= 64 << 20, "Elasticsearch request size");
        let start = self.next.fetch_add(1, Ordering::Relaxed);
        let mut last = None;
        for offset in 0..self.endpoints.len() {
            let url =
                self.endpoints[(start.wrapping_add(offset)) % self.endpoints.len()].join(path)?;
            let response = self
                .client
                .request(method.clone(), url)
                .header(
                    "content-type",
                    if path.contains("_bulk") {
                        "application/x-ndjson"
                    } else {
                        "application/json"
                    },
                )
                .body(body.clone())
                .send()
                .await;
            match response {
                Ok(mut response) => {
                    let status = response.status();
                    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                        last = Some(format!("Elasticsearch HTTP {status}"));
                        continue;
                    }
                    let mut bytes = Vec::new();
                    while let Some(chunk) = response.chunk().await? {
                        ensure!(
                            bytes.len().saturating_add(chunk.len()) <= 32 << 20,
                            "Elasticsearch response size"
                        );
                        bytes.extend_from_slice(&chunk);
                    }
                    return Ok((
                        status,
                        serde_json::from_slice(&bytes).context("Elasticsearch response JSON")?,
                    ));
                }
                Err(error) => last = Some(error.without_url().to_string()),
            }
        }
        bail!(
            "Elasticsearch endpoints unavailable: {}",
            last.unwrap_or_default()
        )
    }

    pub async fn ensure_index(&self, index: &str) -> Result<String> {
        let (status, body) = self
            .request(Method::GET, &format!("{index}/_settings"), Vec::new())
            .await?;
        if status == StatusCode::NOT_FOUND {
            let (created, result) = self.request(Method::PUT, index, serde_json::to_vec(&json!({
                "settings": { "number_of_shards": 3, "number_of_replicas": 1, "refresh_interval": "1s" },
                "mappings": { "dynamic": "strict", "properties": {
                    "node_id": {"type":"keyword"}, "source_version":{"type":"keyword"},
                    "entry_token":{"type":"keyword"}, "basename":{"type":"keyword"},
                    "kind":{"type":"keyword"}, "size":{"type":"long"}, "mtime_ms":{"type":"unsigned_long"},
                    "deleted":{"type":"boolean"}, "source_head":{"type":"long"},
                    "content_status":{"type":"keyword"}, "text":{"type":"text","fields":{"literal":{"type":"wildcard"}}}
                }}
            }))?).await?;
            ensure!(
                created.is_success()
                    || result["error"]["type"] == "resource_already_exists_exception",
                "Elasticsearch index creation failed: {created}"
            );
            return self.index_uuid(index).await;
        }
        ensure!(
            status.is_success(),
            "Elasticsearch settings failed: {status}"
        );
        uuid(&body, index)
    }

    pub async fn index_uuid(&self, index: &str) -> Result<String> {
        let (status, body) = self
            .request(Method::GET, &format!("{index}/_settings"), Vec::new())
            .await?;
        ensure!(
            status.is_success(),
            "Elasticsearch index unavailable: {status}"
        );
        uuid(&body, index)
    }

    pub async fn bulk(&self, index: &str, body: Vec<u8>, count: usize) -> Result<()> {
        let (status, result) = self
            .request(
                Method::POST,
                &format!("{index}/_bulk?refresh=false&wait_for_active_shards=1"),
                body,
            )
            .await?;
        ensure!(status.is_success(), "Elasticsearch bulk failed: {status}");
        let items = result["items"].as_array().context("missing bulk results")?;
        ensure!(items.len() == count, "incomplete bulk results");
        for item in items {
            let result = &item["index"];
            let status = result["status"].as_u64().context("missing bulk status")?;
            ensure!(
                (200..300).contains(&status)
                    || (status == 409
                        && result["error"]["type"] == "version_conflict_engine_exception"),
                "Elasticsearch item failed: {status}"
            );
            if status != 409 {
                ensure!(
                    result["_shards"]["failed"].as_u64() == Some(0),
                    "Elasticsearch shard write failure"
                );
            }
        }
        Ok(())
    }

    pub async fn refresh(&self, index: &str) -> Result<()> {
        let (status, result) = self
            .request(Method::POST, &format!("{index}/_refresh"), Vec::new())
            .await?;
        ensure!(
            status.is_success() && result["_shards"]["failed"].as_u64() == Some(0),
            "Elasticsearch checkpoint refresh failed"
        );
        Ok(())
    }
}

fn uuid(body: &Value, index: &str) -> Result<String> {
    body[index]["settings"]["index"]["uuid"]
        .as_str()
        .map(str::to_owned)
        .context("missing Elasticsearch index UUID")
}
