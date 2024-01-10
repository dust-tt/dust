use anyhow::{anyhow, Result};
use hyper::{Body, Client, Request};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    databases::database::{QueryResult, Table},
    utils,
};

pub const HEARTBEAT_INTERVAL_MS: u64 = 3_000;

#[derive(Debug, Serialize, Clone)]
pub struct SqliteWorker {
    last_heartbeat: u64,
    url: String,
}

impl SqliteWorker {
    pub fn new(url: String, last_heartbeat: u64) -> Self {
        Self {
            last_heartbeat: last_heartbeat,
            url,
        }
    }

    pub fn is_alive(&self) -> bool {
        let now = utils::now();
        let elapsed = now - self.last_heartbeat;

        elapsed < HEARTBEAT_INTERVAL_MS
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub async fn execute_query(
        &self,
        database_unique_id: &str,
        tables: &Vec<Table>,
        query: &str,
    ) -> Result<Vec<QueryResult>> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("POST")
            .uri(format!("{}/databases/{}", worker_url, database_unique_id))
            .header("Content-Type", "application/json")
            .body(Body::from(
                json!({
                    "tables": tables,
                    "query": query,
                })
                .to_string(),
            ))?;

        let res = Client::new().request(req).await?;

        #[derive(Deserialize)]
        struct ExecuteQueryResponseBody {
            error: Option<String>,
            response: Option<Vec<QueryResult>>,
        }

        match res.status().as_u16() {
            200 => {
                let body = hyper::body::to_bytes(res.into_body()).await?;
                let res: ExecuteQueryResponseBody = serde_json::from_slice(&body)?;
                match res.error {
                    Some(e) => Err(anyhow!("Error executing query: {}", e))?,
                    None => match res.response {
                        Some(r) => Ok(r),
                        None => Err(anyhow!("No response found"))?,
                    },
                }
            }
            s => Err(anyhow!(
                "Failed to execute query on sqlite worker. Status: {}",
                s
            ))?,
        }
    }

    pub async fn invalidate_database(&self, database_unique_id: &str) -> Result<()> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!("{}/databases/{}", worker_url, database_unique_id))
            .body(Body::from(""))?;

        let res = Client::new().request(req).await?;

        match res.status().as_u16() {
            200 => Ok(()),
            s => Err(anyhow!(
                "Failed to invalidate database on sqlite worker. Status: {}",
                s
            ))?,
        }
    }

    pub async fn expire_all(&self) -> Result<()> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!("{}/databases", worker_url))
            .body(Body::from(""))?;

        let res = Client::new().request(req).await?;

        match res.status().as_u16() {
            200 => Ok(()),
            s => Err(anyhow!(
                "Failed to expire all databases on sqlite worker. Status: {}",
                s
            ))?,
        }
    }
}
