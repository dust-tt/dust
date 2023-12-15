use anyhow::{anyhow, Result};
use hyper::{Body, Client, Request};
use serde::Deserialize;
use serde_json::json;

use crate::{
    databases::database::{DatabaseResult, DatabaseRow, DatabaseTable},
    utils,
};

pub const HEARTBEAT_INTERVAL_MS: u64 = 3_000;

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

    pub async fn upsert_rows(
        &self,
        database_unique_id: &str,
        table_id: &str,
        rows: Vec<DatabaseRow>,
        truncate: bool,
    ) -> Result<()> {
        let url = self.url();
        let req = Request::builder()
            .method("POST")
            .uri(format!(
                "{}/databases/{}/tables/{}/rows",
                url, database_unique_id, table_id
            ))
            .header("Content-Type", "application/json")
            .body(Body::from(
                json!({
                    "rows": rows,
                    "truncate": truncate,
                })
                .to_string(),
            ))?;

        let res = Client::new().request(req).await?;

        match res.status().as_u16() {
            200 => Ok(()),
            s => Err(anyhow!(
                "Failed to send rows to sqlite worker. Status: {}",
                s
            )),
        }
    }

    pub async fn get_rows(
        &self,
        database_unique_id: &str,
        table_id: &str,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<DatabaseRow>, usize)> {
        let worker_url = self.url();

        let mut uri = format!(
            "{}/databases/{}/tables/{}/rows",
            worker_url, database_unique_id, table_id
        );

        if let Some((limit, offset)) = limit_offset {
            uri = format!("{}?limit={}&offset={}", uri, limit, offset);
        }

        let req = Request::builder()
            .method("GET")
            .uri(uri)
            .header("Content-Type", "application/json")
            .body(Body::empty())?;

        let res = Client::new().request(req).await?;

        #[derive(Deserialize)]
        struct GetRowsResponse {
            rows: Vec<DatabaseRow>,
            total: usize,
        }
        #[derive(Deserialize)]
        struct GetRowsResponseBody {
            error: Option<String>,
            response: Option<GetRowsResponse>,
        }

        match res.status().as_u16() {
            200 => {
                let body = hyper::body::to_bytes(res.into_body()).await?;
                let res: GetRowsResponseBody = serde_json::from_slice(&body)?;
                let (rows, total) = match res.error {
                    Some(e) => Err(anyhow!("Error retrieving rows: {}", e))?,
                    None => match res.response {
                        Some(r) => (r.rows, r.total),
                        None => Err(anyhow!("No rows found in response"))?,
                    },
                };

                Ok((rows, total))
            }
            s => Err(anyhow!(
                "Failed to retrieve rows from sqlite worker. Status: {}",
                s
            ))?,
        }
    }

    pub async fn get_row(
        &self,
        database_unique_id: &str,
        table_id: &str,
        row_id: &str,
    ) -> Result<Option<DatabaseRow>> {
        let worker_url = self.url();

        let uri = format!(
            "{}/databases/{}/tables/{}/rows/{}",
            worker_url, database_unique_id, table_id, row_id
        );

        let req = Request::builder()
            .method("GET")
            .uri(uri)
            .header("Content-Type", "application/json")
            .body(Body::empty())?;

        let res = Client::new().request(req).await?;

        #[derive(Deserialize)]
        struct GetRowResponseBody {
            error: Option<String>,
            response: Option<DatabaseRow>,
        }

        match res.status().as_u16() {
            200 => {
                let body = hyper::body::to_bytes(res.into_body()).await?;
                let res: GetRowResponseBody = serde_json::from_slice(&body)?;
                match res.error {
                    Some(e) => Err(anyhow!("Error retrieving row: {}", e))?,
                    None => match res.response {
                        Some(r) => Ok(Some(r)),
                        None => Ok(None),
                    },
                }
            }
            s => Err(anyhow!(
                "Failed to retrieve row from sqlite worker. Status: {}",
                s
            ))?,
        }
    }

    pub async fn execute_query(
        &self,
        database_unique_id: &str,
        tables: Vec<DatabaseTable>,
        query: &str,
    ) -> Result<Vec<DatabaseResult>> {
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
            response: Option<Vec<DatabaseResult>>,
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

    pub async fn delete_database_rows(&self, database_unique_id: &str) -> Result<()> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!("{}/databases/{}", worker_url, database_unique_id))
            .header("Content-Type", "application/json")
            .body(Body::empty())?;

        let res = Client::new().request(req).await?;

        match res.status().as_u16() {
            200 => Ok(()),
            s => Err(anyhow!(
                "Failed to delete database rows on sqlite worker. Status: {}",
                s
            )),
        }
    }

    pub async fn delete_database_table_rows(
        &self,
        database_unique_id: &str,
        table_id: &str,
    ) -> Result<()> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!(
                "{}/databases/{}/tables/{}",
                worker_url, database_unique_id, table_id
            ))
            .header("Content-Type", "application/json")
            .body(Body::empty())?;

        let res = Client::new().request(req).await?;

        match res.status().as_u16() {
            200 => Ok(()),
            s => Err(anyhow!(
                "Failed to delete database table rows on sqlite worker. Status: {}",
                s
            )),
        }
    }

    pub async fn delete_row(
        &self,
        database_unique_id: &str,
        table_id: &str,
        row_id: &str,
    ) -> Result<()> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!(
                "{}/databases/{}/tables/{}/rows/{}",
                worker_url, database_unique_id, table_id, row_id
            ))
            .header("Content-Type", "application/json")
            .body(Body::empty())?;

        let res = Client::new().request(req).await?;

        match res.status().as_u16() {
            200 => Ok(()),
            s => Err(anyhow!(
                "Failed to delete row on sqlite worker. Status: {}",
                s
            )),
        }
    }

    pub fn url(&self) -> &str {
        &self.url
    }
}
