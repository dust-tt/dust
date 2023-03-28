use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::data_sources::data_source::Document;
use crate::project::Project;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::header;
use hyper::{body::Buf, http::StatusCode, Body, Client, Method, Request};
use hyper_tls::HttpsConnector;
use pest::iterators::Pair;
use serde_json::Value;
use std::io::prelude::*;
use tokio::sync::mpsc::UnboundedSender;
use url::Url;
use urlencoding::encode;

#[derive(Clone)]
pub struct DataSource {
    query: String,
}

impl DataSource {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
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

    async fn search_data_source(
        &self,
        env: &Env,
        username: Option<String>,
        data_source_id: String,
        top_k: usize,
    ) -> Result<Vec<Document>> {
        // println!("USERNAME: {:?}", username);
        // println!("DATA_SOURCE_ID: {:?}", data_source_id);
        // println!("TOP_K: {:?}", top_k);
        // println!("CREDENTIALS: {:?}", env.credentials);

        let data_source_project = match username {
            Some(username) => {
                let dust_user_id = match env.credentials.get("DUST_USER_ID") {
                    None => Err(anyhow!(
                        "DUST_USER_ID credentials missing, but `username` \
                           is set in `data_source` block"
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
                    "{}/api/registry/data_sources/lookup?username={}&data_source_id={}",
                    front_api.as_str(),
                    encode(&username),
                    encode(&data_source_id),
                );
                let parsed_url = Url::parse(url.as_str())?;

                // println!(
                //     "Running DataSource retrieval {:?} / {} ({} {})",
                //     username,
                //     data_source_id,
                //     registry_secret.as_str(),
                //     url.as_str()
                // );

                // GET DUST_FRONT_API/api/registry/data_sources/lookup?data_source_id=&username=
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
                        header::HeaderName::from_bytes("X-Dust-User-Id".as_bytes())?,
                        header::HeaderValue::from_bytes(dust_user_id.as_bytes())?,
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
                        username,
                        data_source_id,
                    ))?;
                }

                let body = hyper::body::aggregate(res).await?;
                let mut b: Vec<u8> = vec![];
                body.reader().read_to_end(&mut b)?;

                let response_body = String::from_utf8_lossy(&b).into_owned();

                // println!("response_body: {}", response_body);
                // parse response_body to JSON

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
            .search(env.credentials.clone(), env.store.clone(), &q, top_k)
            .await?;

        Ok(documents)
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
              [ {{ [\"username\": ...,] \"data_source\": ... }}, ... ] }}`",
            name
        );

        let data_sources = match config {
            Some(v) => match v.get("data_sources") {
                Some(Value::Array(a)) => a
                    .iter()
                    .map(|v| {
                        let username = match v.get("username") {
                            Some(Value::String(p)) => Some(p.clone()),
                            _ => None,
                        };
                        let data_source_id = match v.get("data_source_id") {
                            Some(Value::String(i)) => i.clone(),
                            _ => Err(anyhow!(err_msg.clone()))?,
                        };
                        Ok((username, data_source_id))
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

        // For each data_sources, retrieve documents.
        let mut futures = Vec::new();
        for (u, ds) in data_sources {
            futures.push(self.search_data_source(env, u.clone(), ds.clone(), top_k));
        }

        let results = futures::future::try_join_all(futures).await?;

        // Extract top_k across all data_sources.
        let mut documents = Vec::new();
        for result in results {
            for doc in result {
                documents.push(doc);
            }
        }
        documents.sort_by(|a, b| b.chunks[0].score.partial_cmp(&a.chunks[0].score).unwrap());
        documents.truncate(top_k);

        Ok(serde_json::to_value(documents)?)
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
