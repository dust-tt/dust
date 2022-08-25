use crate::blocks::block::{parse_block, Block, BlockType, Env};
use crate::data::Data;
use crate::providers::provider::ProviderID;
use crate::utils;
use crate::{DustParser, Rule};
use anyhow::{anyhow, Result};
use pest::Parser;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::str::FromStr;

/// BlockExecution represents the execution of a block:
/// - `env` used
/// - returned value from `should_run`
/// - if `should_run` is true:
///   - `output` of a successful execution
///   - or `error` message returned
#[derive(Serialize, PartialEq)]
pub struct BlockExecution {
    pub env: Env,
    pub should_run: bool,
    pub output: Option<Value>,
    pub error: Option<String>,
}

/// ExecutionTrace represents the execution trace of a full app on one input value.
#[derive(Serialize, PartialEq)]
pub struct ExecutionTrace {
    pub input: Value,
    pub block_executions: Vec<(String, Vec<BlockExecution>)>,
}

/// Execution represents the full execution of an app on input data.
#[derive(Serialize, PartialEq)]
pub struct Execution {
    hash: String,
    data_id: String,
    data_hash: String,
    app_hash: String,
    traces: Vec<ExecutionTrace>,
}

/// An App is a collection of versioned Blocks.
///
/// Blocks are versioned by their hash (inner_hash) and the hash of their predecessor in the App
/// specification. The App hash is computed from its constituting blocks hashes.
pub struct App {
    hash: String,
    blocks: Vec<(String, String, Box<dyn Block>)>, // (hash, name, Block)
}

impl App {
    pub fn len(&self) -> usize {
        self.blocks.len()
    }

    pub async fn new() -> Result<Self> {
        let root_path = utils::init_check().await?;
        let spec_path = root_path.join("index.dust");

        let unparsed_file = async_std::fs::read_to_string(spec_path).await?;
        let parsed = DustParser::parse(Rule::dust, &unparsed_file)?
            .next()
            .unwrap();

        // Block names and parsed instantiations.
        let mut blocks: Vec<(String, Box<dyn Block>)> = Vec::new();

        for pair in parsed.into_inner() {
            match pair.as_rule() {
                Rule::block => {
                    let mut block_type: Option<BlockType> = None;
                    let mut block_name: Option<String> = None;
                    for pair in pair.into_inner() {
                        match pair.as_rule() {
                            Rule::block_type => {
                                block_type = Some(BlockType::from_str(pair.as_str())?);
                            }
                            Rule::block_name => {
                                block_name = Some(pair.as_str().to_string());
                            }
                            Rule::block_body => {
                                assert!(block_type.as_ref().is_some());
                                assert!(block_name.as_ref().is_some());

                                blocks.push((
                                    block_name.as_ref().unwrap().clone(),
                                    parse_block(block_type.unwrap(), pair)?,
                                ));
                            }
                            _ => unreachable!(),
                        }
                    }
                }
                Rule::EOI => {}
                _ => unreachable!(),
            }
        }

        // Check that maps are matched by a reduce and that they are not nested.
        let mut current_map: Option<String> = None;
        for (name, block) in &blocks {
            if block.block_type() == BlockType::Map {
                if current_map.is_some() {
                    return Err(anyhow!(
                        "Nested maps are not currently supported, \
                         found `map {}` nested in `map {}`",
                        name,
                        current_map.unwrap()
                    ));
                } else {
                    current_map = Some(name.clone());
                }
            }
            if block.block_type() == BlockType::Reduce {
                match current_map.clone() {
                    None => {
                        Err(anyhow!(
                            "Block `reduce {}` is not matched by a previous `map {}` block",
                            name.as_str(),
                            name.as_str()
                        ))?;
                    }
                    Some(map) => {
                        if map.as_str() != name.as_str() {
                            Err(anyhow!(
                                "Block `reduce {}` does not match the current `map {}` block",
                                name.as_str(),
                                map.as_str()
                            ))?;
                        } else {
                            current_map = None;
                        }
                    }
                }
            }
        }

        // At this point the app looks valid (of course code blocks can fail in arbitrary ways).
        // Let's compute the hash of each block and the hash of the app.
        let mut hashes: Vec<String> = Vec::new();
        let mut prev_hash: String = "".to_string();
        for (name, block) in &blocks {
            let mut hasher = blake3::Hasher::new();
            hasher.update(prev_hash.as_bytes());
            hasher.update(name.as_bytes());
            hasher.update(block.inner_hash().as_bytes());
            prev_hash = format!("{}", hasher.finalize().to_hex());
            hashes.push(prev_hash.clone());
        }

        Ok(App {
            hash: prev_hash,
            blocks: blocks
                .into_iter()
                .zip(hashes.into_iter())
                .map(|((name, block), hash)| (hash, name, block))
                .collect(),
        })
    }

    pub async fn run(
        &mut self,
        data: &Data,
        provider_id: ProviderID,
        model_id: &str,
    ) -> Result<()> {
        // Initialize the envs from data-points as `Vec<Vec<Env>>`. The first vector represents the
        // data-point the second is used to handle map/reduces.
        let mut envs = data
            .iter()
            .map(|d| {
                vec![Env {
                    provider_id,
                    model_id: String::from(model_id),
                    state: HashMap::new(),
                    input: d.clone(),
                    map: None,
                }]
            })
            .collect::<Vec<Vec<Env>>>();
        assert!(envs.len() > 0);

        let mut current_map: Option<String> = None;
        let mut current_map_blocks: Vec<String> = vec![];

        for (hash, name, block) in &self.blocks {
            // Special pre-processing for reduce blocks. Reduce the envs of the blocks that were
            // executed as part of the map. If the env does not include an output we fail
            // conservatively for now.
            // TODO(spolu): re-evaluate or maybe parametrize behavior in maps. If we allow errors to
            // go through we have an alignment problem if future blocks use elements from different
            // blocks in the map assuming they are aligned. We would probably need to use
            // Value::None?
            if block.block_type() == BlockType::Reduce {
                envs = envs
                    .iter()
                    .map(|item_envs| {
                        assert!(item_envs.len() > 0);
                        let mut env = item_envs[0].clone();
                        current_map_blocks
                            .iter()
                            .map(|n| {
                                env.state.insert(
                                    n.clone(),
                                    Value::Array(
                                        item_envs
                                            .iter()
                                            .map(|e| match e.state.get(n) {
                                                None => Err(anyhow!(
                                                "Missing block output block `{}`, at iteration {}",
                                                n, e.map.as_ref().unwrap().iteration
                                            ))?,
                                                Some(v) => Ok(v.clone()),
                                            })
                                            .collect::<Result<Vec<_>>>()?,
                                    ),
                                );
                                Ok(())
                            })
                            .collect::<Result<Vec<_>>>()?;
                        Ok(vec![env])
                    })
                    .collect::<Result<Vec<_>>>()?;
                // No block execution for reduce, env coallescing only.
            } else {
                envs = envs
                    .iter()
                    .map(|item_envs| {
                        assert!(item_envs.len() > 0);
                        Ok(item_envs
                            .iter()
                            .map(|env| {
                                // TODO(spolu): stream execution
                                let v = block.execute(env).await?;
                                let mut env = env.clone();
                                env.state.insert(name.clone(), v);
                                Ok(env)
                            })
                            .collect::<Result<Vec<_>>>()?)
                    })
                    .collect::<Result<Vec<_>>>()?;
            }

            // Special post-processing for map blocks.
            if block.block_type() == BlockType::Map {}
        }

        Ok(())
    }
}

pub async fn cmd_run(data_id: &str, provider_id: ProviderID, model_id: &str) -> Result<()> {
    let mut app = App::new().await?;
    utils::info(format!("Parsed app specification, found {} blocks.", app.len()).as_str());

    let d = Data::new_from_latest(data_id).await?;
    if d.len() == 0 {
        Err(anyhow!("Retrieved 0 records from `{data_id}`"))?
    }
    utils::info(
        format!(
            "Retrieved {} records from latest data version for `{}`.",
            d.len(),
            data_id
        )
        .as_str(),
    );

    Ok(app.run(&d, provider_id, model_id).await?)
}
