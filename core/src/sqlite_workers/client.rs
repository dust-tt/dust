use anyhow::{anyhow, Result};
use hyper::{body::Bytes, Body, Client, Request};
use serde::{Deserialize, Serialize};
use serde_json::json;
use urlencoding::encode;

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

#[derive(Debug)]
pub enum SqliteWorkerError {
    ClientError(anyhow::Error),
    ServerError(anyhow::Error, Option<String>, u16),
}

impl std::fmt::Display for SqliteWorkerError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Self::ClientError(e) => write!(f, "SqliteWorkerError: Client error: {}", e),
            Self::ServerError(e, code, status) => {
                write!(
                    f,
                    "SqliteWorkerError (code={}, status={}): Server error: {}",
                    code.clone().unwrap_or_default(),
                    status,
                    e
                )
            }
        }
    }
}

impl std::error::Error for SqliteWorkerError {}

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
    ) -> Result<Vec<QueryResult>, SqliteWorkerError> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("POST")
            .uri(format!(
                "{}/databases/{}",
                worker_url,
                encode(database_unique_id)
            ))
            .header("Content-Type", "application/json")
            .body(Body::from(
                json!({
                    "tables": tables,
                    "query": query,
                })
                .to_string(),
            ))
            .map_err(|e| {
                SqliteWorkerError::ClientError(anyhow!("Failed to build request: {}", e))
            })?;

        let res = Client::new().request(req).await.map_err(|e| {
            SqliteWorkerError::ClientError(anyhow!("Failed to execute request: {}", e))
        })?;

        let body_bytes = get_response_body(res).await?;

        #[derive(Deserialize)]
        struct ExecuteQueryResponseBody {
            error: Option<String>,
            response: Option<Vec<QueryResult>>,
        }

        let body: ExecuteQueryResponseBody = serde_json::from_slice(&body_bytes).map_err(|e| {
            SqliteWorkerError::ClientError(anyhow!("Failed to parse response: {}", e))
        })?;

        match body.error {
            Some(e) => Err(SqliteWorkerError::ServerError(anyhow!(e), None, 200))?,
            None => match body.response {
                Some(r) => Ok(r),
                None => Err(SqliteWorkerError::ServerError(
                    anyhow!("No response in body"),
                    None,
                    200,
                ))?,
            },
        }
    }

    pub async fn invalidate_database(
        &self,
        database_unique_id: &str,
    ) -> Result<(), SqliteWorkerError> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!("{}/databases/{}", worker_url, database_unique_id))
            .body(Body::from(""))
            .map_err(|e| {
                SqliteWorkerError::ClientError(anyhow!("Failed to build request: {}", e))
            })?;

        let res = Client::new().request(req).await.map_err(|e| {
            SqliteWorkerError::ClientError(anyhow!("Failed to execute request: {}", e))
        })?;

        let _ = get_response_body(res).await?;

        Ok(())
    }

    pub async fn expire_all(&self) -> Result<(), SqliteWorkerError> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!("{}/databases", worker_url))
            .body(Body::from(""))
            .map_err(|e| {
                SqliteWorkerError::ClientError(anyhow!("Failed to build request: {}", e))
            })?;

        let res = Client::new().request(req).await.map_err(|e| {
            SqliteWorkerError::ClientError(anyhow!("Failed to execute request: {}", e))
        })?;
        let _ = get_response_body(res).await?;

        Ok(())
    }
}

async fn get_response_body(res: hyper::Response<hyper::Body>) -> Result<Bytes, SqliteWorkerError> {
    let status = res.status().as_u16();
    let body = hyper::body::to_bytes(res.into_body())
        .await
        .map_err(|e| SqliteWorkerError::ClientError(anyhow!("Failed to read response: {}", e)))?;

    match status {
        200 => Ok(body),
        s => {
            let body_json: serde_json::Value = serde_json::from_slice(&body).map_err(|e| {
                SqliteWorkerError::ClientError(anyhow!("Failed to parse response: {}", e))
            })?;
            let error = body_json.get("error");
            let error_code = match error {
                Some(e) => e
                    .get("code")
                    .map(|c| c.as_str())
                    .flatten()
                    .map(|s| s.to_string()),
                None => None,
            };
            Err(SqliteWorkerError::ServerError(
                anyhow!("Received error response from SQLite worker",),
                error_code,
                s,
            ))?
        }
    }
}
