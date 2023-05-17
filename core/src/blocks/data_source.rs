use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::data_sources::data_source::{Document, SearchFilter};
use crate::project::Project;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::header;
use hyper::{body::Buf, http::StatusCode, Body, Client, Method, Request};
use hyper_tls::HttpsConnector;
use pest::iterators::Pair;
use serde_json::Value;
use std::collections::HashMap;
use std::io::prelude::*;
use tokio::sync::mpsc::UnboundedSender;
use url::Url;
use urlencoding::encode;

#[derive(Clone)]
pub struct DataSource {
    query: String,
    full_text: bool,
}

impl DataSource {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;
        let mut full_text: bool = false;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
                        "full_text" => match value.as_str() {
                            "true" => full_text = true,
                            "false" => full_text = false,
                            _ => Err(anyhow!(
                                "Invalid value for `full_text`, must be `true` or `false`"
                            ))?,
                        },
                        _ => Err(anyhow!("Unexpected `{}` in `data_source` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!(
                    "`expected` is not yet supported in `data_source` block"
                ))?,
                _ => unreachable!(),
            }
        }

        if !query.is_some() {
            Err(anyhow!("Missing required `query` in `data_source` block"))?;
        }

        Ok(DataSource {
            query: query.unwrap(),
            full_text,
        })
    }

    fn replace_query_variables(text: &str, env: &Env) -> Result<String> {
        replace_variables_in_string(text, "query", env)
    }

    fn query(&self, env: &Env) -> Result<String> {
        let mut query = Self::replace_query_variables(&self.query, env)?;

        // replace <DUST_TRIPLE_BACKTICKS> with ```
        query = query.replace("<DUST_TRIPLE_BACKTICKS>", "```");
        // println!("QUERY: {}", query);

        Ok(query)
    }

    /// This helper searches one Data Source (multiple can be searched in parallel) and return the
    /// documents retrieved from the search.
    async fn search_data_source(
        &self,
        env: &Env,
        workspace_id: Option<String>,
        data_source_id: String,
        top_k: usize,
        filter: Option<SearchFilter>,
    ) -> Result<Vec<Document>> {
        let data_source_project = match workspace_id {
            Some(workspace_id) => {
                let dust_workspace_id = match env.credentials.get("DUST_WORKSPACE_ID") {
                    None => Err(anyhow!(
                        "DUST_WORKSPACE_ID credentials missing, but `workspace_id` \
                           is set in `data_source` block config"
                    ))?,
                    Some(v) => v.clone(),
                };
                let registry_secret = match std::env::var("DUST_REGISTRY_SECRET") {
                    Ok(key) => key,
                    Err(_) => Err(anyhow!(
                        "Environment variable `DUST_REGISTRY_SECRET` is not set."
                    ))?,
                };
                let front_api = match std::env::var("DUST_FRONT_API") {
                    Ok(key) => key,
                    Err(_) => Err(anyhow!("Environment variable `DUST_FRONT_API` is not set."))?,
                };

                let url = format!(
                    "{}/api/registry/data_sources/lookup?workspace_id={}&data_source_id={}",
                    front_api.as_str(),
                    encode(&workspace_id),
                    encode(&data_source_id),
                );
                let parsed_url = Url::parse(url.as_str())?;

                let mut req = Request::builder().method(Method::GET).uri(url.as_str());

                {
                    let headers = match req.headers_mut() {
                        Some(h) => h,
                        None => Err(anyhow!("Invalid URL: {}", url.as_str()))?,
                    };
                    headers.insert(
                        header::AUTHORIZATION,
                        header::HeaderValue::from_bytes(
                            format!("Bearer {}", registry_secret.as_str()).as_bytes(),
                        )?,
                    );
                    headers.insert(
                        header::HeaderName::from_bytes("X-Dust-Workspace-Id".as_bytes())?,
                        header::HeaderValue::from_bytes(dust_workspace_id.as_bytes())?,
                    );
                }
                let req = req.body(Body::empty())?;

                let res = match parsed_url.scheme() {
                    "https" => {
                        let https = HttpsConnector::new();
                        let cli = Client::builder().build::<_, hyper::Body>(https);
                        cli.request(req).await?
                    }
                    "http" => {
                        let cli = Client::new();
                        cli.request(req).await?
                    }
                    _ => Err(anyhow!(
                        "Only the `http` and `https` schemes are authorized."
                    ))?,
                };

                let status = res.status();
                if status != StatusCode::OK {
                    Err(anyhow!(
                        "Failed to retrieve DataSource `{} > {}`",
                        workspace_id,
                        data_source_id,
                    ))?;
                }

                let body = hyper::body::aggregate(res).await?;
                let mut b: Vec<u8> = vec![];
                body.reader().read_to_end(&mut b)?;

                let response_body = String::from_utf8_lossy(&b).into_owned();

                let body = match serde_json::from_str::<serde_json::Value>(&response_body) {
                    Ok(body) => body,
                    Err(_) => Err(anyhow!("Failed to parse registry response"))?,
                };

                match body.get("project_id") {
                    Some(Value::Number(p)) => match p.as_i64() {
                        Some(p) => Project::new_from_id(p),
                        None => Err(anyhow!("Failed to parse registry response"))?,
                    },
                    _ => Err(anyhow!("Failed to parse registry response"))?,
                }
            }
            None => env.project.clone(),
        };

        let ds = match env
            .store
            .load_data_source(&data_source_project, &data_source_id)
            .await?
        {
            Some(ds) => ds,
            None => Err(anyhow!("Data source `{}` not found", data_source_id))?,
        };

        let q = self.query(env)?;

        let documents = ds
            .search(
                env.credentials.clone(),
                env.store.clone(),
                &q,
                top_k,
                filter,
                self.full_text,
            )
            .await?;

        Ok(documents)
    }

    /// This function is in charge given a set of Documents with scored chunks possibly coming from
    /// multiple data sources, to return the documents associated with the `top_k` chunks (including
    /// only these `top_k` chunks), sorted by top chunk.
    fn top_k_sorted_documents(top_k: usize, documents: &Vec<Document>) -> Vec<Document> {
        // Extract all chunks, keeping their source `document_id`.
        let mut chunks = documents
            .iter()
            .map(|d| d.chunks.iter().map(|c| (d.document_id.clone(), c.clone())))
            .flatten()
            .collect::<Vec<_>>();

        // Sort them by score and truncate to `top_k`
        chunks.sort_by(|a, b| b.1.score.partial_cmp(&a.1.score).unwrap());
        chunks.truncate(top_k);

        // Get the documents without chunks.
        let mut documents = documents
            .iter()
            .map(|d| {
                let mut d = d.clone();
                d.chunks = vec![];
                (d.document_id.clone(), d)
            })
            .collect::<HashMap<_, _>>();

        // Reinsert the `top_k` chunks in their respective documents.
        for (document_id, chunk) in chunks {
            documents.get_mut(&document_id).unwrap().chunks.push(chunk);
        }

        // Remove all documents that have no chunks.
        let mut d = documents
            .into_iter()
            .filter(|(_, d)| d.chunks.len() > 0)
            .map(|(_, d)| d)
            .collect::<Vec<_>>();

        // Order documents by top chunk score.
        d.sort_by(|a, b| b.chunks[0].score.partial_cmp(&a.chunks[0].score).unwrap());
        d.truncate(top_k);

        return d;
    }
}

#[async_trait]
impl Block for DataSource {
    fn block_type(&self) -> BlockType {
        BlockType::DataSource
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("data_source".as_bytes());
        hasher.update(self.query.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<Value> {
        let config = env.config.config_for_block(name);

        let err_msg = format!(
            "Invalid or missing `data_sources` in configuration for \
              `data_source` block `{}`, expecting `{{ \"data_sources\": \
              [ {{ [\"workspace_id\": ...,] \"data_source\": ... }}, ... ] }}`",
            name
        );

        let data_sources = match config {
            Some(v) => match v.get("data_sources") {
                Some(Value::Array(a)) => a
                    .iter()
                    .map(|v| {
                        let workspace_id = match v.get("workspace_id") {
                            Some(Value::String(p)) => Some(p.clone()),
                            _ => None,
                        };
                        let data_source_id = match v.get("data_source_id") {
                            Some(Value::String(i)) => i.clone(),
                            _ => Err(anyhow!(err_msg.clone()))?,
                        };
                        Ok((workspace_id, data_source_id))
                    })
                    .collect::<Result<Vec<_>>>()?,
                _ => Err(anyhow!(err_msg.clone()))?,
            },
            _ => Err(anyhow!(err_msg.clone()))?,
        };

        let top_k = match match config {
            Some(v) => match v.get("top_k") {
                Some(Value::Number(k)) => match k.as_u64() {
                    Some(k) => Some(k as usize),
                    None => None,
                },
                _ => None,
            },
            None => None,
        } {
            Some(k) => k,
            _ => 10,
        };

        let filter = match config {
            Some(v) => match v.get("filter") {
                Some(v) => Some(SearchFilter::from_json_str(v.to_string().as_str())?),
                _ => None,
            },
            _ => None,
        };

        // For each data_sources, retrieve documents concurrently.
        let mut futures = Vec::new();
        for (w_id, ds) in data_sources {
            futures.push(self.search_data_source(
                env,
                w_id.clone(),
                ds.clone(),
                top_k,
                filter.clone(),
            ));
        }

        let results = futures::future::try_join_all(futures).await?;

        // Extract top_k across all data_sources.
        let mut documents = Vec::new();
        for result in results {
            for doc in result {
                documents.push(doc);
            }
        }

        Ok(serde_json::to_value(Self::top_k_sorted_documents(
            top_k, &documents,
        ))?)
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
