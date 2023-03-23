use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::project::Project;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone)]
pub struct DataSource {
    data_sources: Vec<String>,
    query: String,
    top_k: usize,
}

impl DataSource {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut project_id: Option<usize> = None;
        let mut data_source_id: Option<String> = None;
        let mut data_sources: Vec<(usize, String)> = vec![];
        let mut query: Option<String> = None;
        let mut top_k: Option<usize> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "project_id" => match value.parse::<usize>() {
                            Ok(n) => project_id = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `project_id` in `data_source` block, \
                                  expecting unsigned integer"
                            ))?,
                        },
                        "data_source_id" => data_source_id = Some(value),
                        "data_sources" => {
                            data_sources = value
                                .split("\n")
                                .map(|s| String::from(s.trim()))
                                .map(|ds| {
                                    let err_msg = "Invalid `data_sources` in `data_source` block, \
                                      expecting a list of data sources (one per line) with format: \
                                      `project_id:data_source_id`";
                                    let re = regex::Regex::new(r"(\d+):(.+)")?;
                                    let caps = match re.captures(&ds) {
                                        Some(caps) => caps,
                                        None => Err(anyhow!(err_msg))?,
                                    };
                                    let project_id = match caps.get(1) {
                                        Some(c) => match c.as_str().parse::<usize>() {
                                            Ok(n) => n,
                                            Err(_) => Err(anyhow!(err_msg))?,
                                        },
                                        None => Err(anyhow!(err_msg))?,
                                    };

                                    let data_source_id = match caps.get(2) {
                                        Some(c) => c.as_str().to_string(),
                                        None => Err(anyhow!(err_msg))?,
                                    };

                                    Ok((project_id, data_source_id))
                                })
                                .collect::<Result<Vec<_>>>()?;
                        }
                        "query" => query = Some(value),
                        "top_k" => match value.parse::<usize>() {
                            Ok(n) => top_k = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `top_k` in `data_source` block, expecting unsigned integer"
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

        match (project_id, data_source_id) {
            (Some(p), Some(d)) => {
                data_sources.push((p, d));
            }
            (None, None) => (),
            _ => Err(anyhow!(
                "Missing required `project_id` and/or `data_source_id` in `data_source` block"
            ))?,
        }

        if !query.is_some() {
            Err(anyhow!("Missing required `query` in `data_source` block"))?;
        }
        if !top_k.is_some() {
            Err(anyhow!("Missing required `top_k` in `data_source` block"))?;
        }

        Ok(DataSource {
            project_id: project_id.unwrap(),
            data_source_id: data_source_id.unwrap(),
            query: query.unwrap(),
            top_k: top_k.unwrap(),
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
}

#[async_trait]
impl Block for DataSource {
    fn block_type(&self) -> BlockType {
        BlockType::DataSource
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("data_source".as_bytes());
        hasher.update(self.project_id.to_string().as_bytes());
        hasher.update(self.data_source_id.as_bytes());
        hasher.update(self.query.as_bytes());
        hasher.update(self.top_k.to_string().as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        _name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<Value> {
        let data_source_project = Project::new_from_id(self.project_id as i64);
        let ds = match env
            .store
            .load_data_source(&data_source_project, &self.data_source_id)
            .await?
        {
            Some(ds) => ds,
            None => Err(anyhow!("Data source `{}` not found", self.data_source_id))?,
        };

        let q = self.query(env)?;

        let documents = ds
            .search(env.credentials.clone(), env.store.clone(), &q, self.top_k)
            .await?;

        Ok(serde_json::to_value(documents)?)
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
