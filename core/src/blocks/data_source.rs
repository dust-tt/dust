use crate::blocks::block::{
    parse_pair, replace_variables_in_string, Block, BlockResult, BlockType, Env,
};
use crate::blocks::helpers::get_data_source_project_and_view_filter;
use crate::data_sources::data_source::Document;
use crate::deno::js_executor::JSExecutor;
use crate::search_filter::SearchFilter;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::mpsc::UnboundedSender;
#[derive(Clone)]
pub struct DataSource {
    query: String,
    full_text: bool,
    filter_code: Option<String>,
}

impl DataSource {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;
        let mut full_text: bool = false;
        let mut filter_code: Option<String> = None;

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
                        "filter_code" => filter_code = Some(value),
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
            filter_code,
        })
    }

    fn query(&self, env: &Env) -> Result<String> {
        let mut query = replace_variables_in_string(&self.query, "query", env)?;

        // replace <DUST_TRIPLE_BACKTICKS> with ```
        query = query.replace("<DUST_TRIPLE_BACKTICKS>", "```");
        // println!("QUERY: {}", query);

        Ok(query)
    }

    /// This helper searches one data source (multiple can be searched in parallel) and return the
    /// documents retrieved from the search.
    async fn search_data_source(
        &self,
        env: &Env,
        workspace_id: String,
        data_source_or_data_source_view_id: String,
        top_k: usize,
        filter: Option<SearchFilter>,
        target_document_tokens: Option<usize>,
        project_id: i64,
    ) -> Result<Vec<Document>> {
        let (data_source_project, view_filter, data_source_id) =
            get_data_source_project_and_view_filter(
                &workspace_id,
                &data_source_or_data_source_view_id,
                env,
                format!("data_source_project_id_{}", project_id).as_str(),
            )
            .await?;

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
                env.qdrant_clients.clone(),
                &Some(q.to_string()),
                top_k,
                match filter {
                    Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                    None => None,
                },
                view_filter,
                self.full_text,
                target_document_tokens,
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
        hasher.update(self.full_text.to_string().as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
        project_id: i64,
    ) -> Result<BlockResult> {
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
                            Some(Value::String(p)) => p.clone(),
                            _ => Err(anyhow!(err_msg.clone()))?,
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

        let target_document_tokens = match config {
            Some(v) => match v.get("target_document_tokens") {
                Some(Value::Number(k)) => match k.as_u64() {
                    Some(k) => Some(k as usize),
                    None => None,
                },
                _ => None,
            },
            None => None,
        };

        // Process filter code.
        let (mut filter, filter_logs) = match self.filter_code.as_ref() {
            None => (None, vec![]),
            Some(c) => {
                let e = env.clone();
                let filter_code = c.clone().replace("<DUST_TRIPLE_BACKTICKS>", "```");
                let (filter_value, filter_logs): (Value, Vec<Value>) = JSExecutor::client()?
                    .exec(&filter_code, "_fun", &e, std::time::Duration::from_secs(10))
                    .await
                    .map_err(|e| anyhow!("Error in `filter_code`: {}", e))?;
                (
                    match filter_value {
                        Value::Null => None,
                        Value::Object(o) => Some(SearchFilter::from_json(&Value::Object(o))?),
                        _ => Err(anyhow!(
                            "Invalid filter code output, expecting a filter objects with
                             fields `tags`, `parents`, and `timestamp`."
                        ))?,
                    },
                    filter_logs,
                )
            }
        };

        match config {
            Some(v) => match v.get("filter") {
                Some(v) => {
                    let mut f = SearchFilter::from_json_str(v.to_string().as_str())?;

                    match f.tags.as_mut() {
                        Some(tags) => {
                            let replace_tags = |tags: &mut Vec<String>, field: &str| {
                                *tags = tags
                                    .iter()
                                    .map(|t| {
                                        let t = replace_variables_in_string(t, field, env)?;
                                        // Attempt ot parse t as a JSON Array. If possible consider
                                        // the tag as an array, otherwise consider it as a single
                                        // value.
                                        match serde_json::from_str::<Vec<String>>(t.as_str()) {
                                            Ok(v) => Ok(v),
                                            Err(_) => Ok(vec![t]),
                                        }
                                    })
                                    .collect::<Result<Vec<_>>>()?
                                    .into_iter()
                                    .flatten()
                                    .collect();
                                Ok::<_, anyhow::Error>(())
                            };

                            match tags.is_in.as_mut() {
                                Some(is_in) => {
                                    replace_tags(is_in, "filter.tags.is_in")?;
                                }
                                None => (),
                            };
                            match tags.is_not.as_mut() {
                                Some(is_not) => {
                                    replace_tags(is_not, "filter.tags.is_not")?;
                                }
                                None => (),
                            };
                        }
                        None => (),
                    };

                    // Update the filter retrieved from code with the filter extracted from the
                    // configuration.
                    match filter.as_mut() {
                        Some(ff) => ff.apply(&f),
                        None => filter = Some(f),
                    }
                }
                _ => (),
            },
            _ => (),
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
                target_document_tokens,
                project_id,
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

        Ok(BlockResult {
            value: serde_json::to_value(Self::top_k_sorted_documents(top_k, &documents))?,
            meta: Some(json!({
                "logs": filter_logs,
            })),
        })
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
