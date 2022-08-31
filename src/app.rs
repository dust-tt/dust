use crate::blocks::block::{parse_block, Block, BlockType, Env};
use crate::data::Data;
use crate::providers::provider::ProviderID;
use crate::utils;
use crate::{DustParser, Rule};
use anyhow::{anyhow, Result};
use futures::StreamExt;
use futures::TryStreamExt;
use pest::Parser;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::str::FromStr;
use uuid::Uuid;

/// BlockExecution represents the execution of a block:
/// - `env` used
/// - `output` of a successful execution
/// - or `error` message returned
#[derive(Serialize, PartialEq)]
pub struct BlockExecution {
    pub env: Env,
    pub output: Option<Value>,
    pub error: Option<String>,
}

/// ExecutionTrace represents the execution trace of a full app on one input value.
#[derive(Serialize, PartialEq)]
pub struct ExecutionTrace {
    pub input: Value,
    // 0 means no execution at all (if, post error)
    // >1 means multiple executions (map)
    pub block_executions: Vec<(String, Vec<BlockExecution>)>,
}

/// Execution represents the full execution of an app on input data.
#[derive(Serialize, PartialEq)]
pub struct Run {
    uuid: String,
    app_hash: String,
    data_id: String,
    data_hash: String,
    provider_id: ProviderID,
    model_id: String,
    traces: Vec<ExecutionTrace>,
}

impl Run {
    pub fn new(
        app_hash: &str,
        data_id: &str,
        data_hash: &str,
        provider_id: ProviderID,
        model_id: &str,
    ) -> Self {
        Self {
            uuid: format!("{}", Uuid::new_v4()),
            app_hash: String::from(app_hash),
            data_id: String::from(data_id),
            data_hash: String::from(data_hash),
            provider_id,
            model_id: String::from(model_id),
            traces: vec![],
        }
    }
}

/// An App is a collection of versioned Blocks.
///
/// Blocks are versioned by their hash (inner_hash) and the hash of their predecessor in the App
/// specification. The App hash is computed from its constituting blocks hashes.
pub struct App {
    hash: String,
    blocks: Vec<(String, String, Box<dyn Block + Send + Sync>)>, // (hash, name, Block)
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
        let mut blocks: Vec<(String, Box<dyn Block + Send + Sync>)> = Vec::new();

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

        // Check that:
        // - maps are matched by a reduce and that they are not nested.
        // - there is only one root.
        // - map blocks are preceded by the root block
        //   TODO(spolu): probably waivable in the future
        let mut current_map: Option<String> = None;
        let mut root_found = false;
        for (name, block) in &blocks {
            if block.block_type() == BlockType::Root {
                if root_found {
                    Err(anyhow!(
                        "Extraneous `root {}` block, only one root block is allowed",
                        name
                    ))?;
                }
                root_found = true;
            }
            if block.block_type() == BlockType::Map {
                if !root_found {
                    Err(anyhow!(
                        "Map blocks must be preceded by the root block, found `map {}` before root",
                        name
                    ))?;
                }
                if current_map.is_some() {
                    Err(anyhow!(
                        "Nested maps are not currently supported, \
                         found `map {}` nested in `map {}`",
                        name,
                        current_map.as_ref().unwrap()
                    ))?;
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
        if !root_found {
            Err(anyhow!("No root block found"))?;
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

    pub async fn register_version(&self) -> Result<()> {
        let root_path = utils::init_check().await?;
        let spec_path = root_path.join("index.dust");
        let versions_dir = root_path.join(".versions");

        assert!(versions_dir.is_dir().await);

        let version_path = versions_dir.join(&self.hash);
        if !version_path.exists().await {
            utils::action(&format!(
                "Copying latest app's index.dust to {}",
                version_path.display()
            ));
            async_std::fs::copy(spec_path, version_path).await?;
            utils::done(&format!(
                "Registered new app version ({}) with {} blocks",
                self.hash,
                self.blocks.len()
            ));
        } else {
            utils::done(&format!("App version ({}) already registered", self.hash));
        }

        Ok(())
    }

    pub async fn update_latest(&self) -> Result<()> {
        let root_path = utils::init_check().await?;
        let versions_dir = root_path.join(".versions");
        let latest_path = versions_dir.join("latest");

        utils::action(&format!("Updating {}", latest_path.display()));
        async_std::fs::write(latest_path, self.hash.as_bytes()).await?;

        Ok(())
    }

    pub async fn run(
        &self,
        data: &Data,
        provider_id: ProviderID,
        model_id: &str,
        concurrency: usize,
    ) -> Result<()> {
        let mut run = Run::new(
            self.hash.as_str(),
            data.id(),
            data.hash(),
            provider_id,
            model_id,
        );

        // Initialize the ExecutionEnv as a PreRoot. Blocks executed before the ROOT node is found
        // are executed only once instead of once per input data.
        let mut envs = vec![vec![Env {
            provider_id,
            model_id: String::from(model_id),
            state: HashMap::new(),
            input: None,
            map: None,
        }]];

        let mut current_map: Option<String> = None;
        let mut current_map_blocks: Vec<String> = vec![];

        for (_, name, block) in &self.blocks {
            // Special pre-processing of the root blocks, injects data as input and build
            // input_envs.
            if block.block_type() == BlockType::Root {
                assert!(envs.len() == 1 && envs[0].len() == 1);
                envs = data
                    .iter()
                    .map(|d| {
                        vec![Env {
                            input: Some(d.clone()),
                            ..envs[0][0].clone()
                        }]
                    })
                    .collect::<Vec<_>>();
            }

            // Special pre-processing for reduce blocks. Reduce the envs of the blocks that were
            // executed as part of the map. If the env does not include an output we fail
            // conservatively for now.
            // TODO(spolu): re-evaluate or maybe parametrize behavior in maps. If we allow errors to
            // go through we have an alignment problem if future blocks use elements from different
            // blocks in the map assuming they are aligned. We would probably need to use
            // Value::None?
            if block.block_type() == BlockType::Reduce {
                assert!(current_map.is_some());
                envs =
                    envs.iter()
                        .map(|map_envs| {
                            assert!(map_envs.len() > 0);
                            let mut env = map_envs[0].clone();
                            current_map_blocks
                                .iter()
                                .map(|n| {
                                    env.state.insert(
                                        n.clone(),
                                        Value::Array(
                                            map_envs
                                                .iter()
                                                .map(|e| match e.state.get(n) {
                                                    None => Err(anyhow!(
                                                "Missing block `{}` output, at iteration {}",
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
                current_map = None;
                current_map_blocks = vec![];
            }

            // Generic block execution (except for reduce blocks).
            if block.block_type() != BlockType::Reduce {
                // We flatten the envs for concurrent and parrallel execution of the block which
                // requires us to keep track of the potential input and map indices of each Env,
                // depending on the state of ExecutionEnvs.
                let e = futures::stream::iter(
                    envs.iter()
                        .cloned()
                        .enumerate()
                        .map(|(input_idx, map_envs)| {
                            map_envs
                                .into_iter()
                                .enumerate()
                                .map(move |(map_idx, env)| (input_idx, map_idx, env))
                        })
                        .flatten(),
                )
                .map(|(input_idx, map_idx, mut e)| {
                    // `block.clone()` calls the implementation of Clone on Box<dyn Block + ...>
                    // that calls into the Block trait's `clone_box` implemented on each Block. This
                    // allows cloning the Block (as a Trait) to use from parallel threads!
                    let b = block.clone();
                    let name = name.clone();
                    tokio::spawn(async move {
                        let v = b.execute(&e).await?;
                        utils::info(format!("EXECUTION {}: {:?}", name, v).as_str());
                        e.state.insert(name, v);
                        Ok((input_idx, map_idx, e)) as Result<(usize, usize, Env), anyhow::Error>
                    })
                })
                .buffer_unordered(concurrency)
                .map(|r| match r {
                    Err(e) => Err(anyhow!("Block execution spawn error: {}", e))?,
                    Ok(r) => r,
                })
                .try_collect::<Vec<_>>()
                .await?;

                // There was no error so all envs have been updated and returned flattened, we can
                // just update the original envs mutable object directly.
                e.into_iter()
                    .for_each(|(input_idx, map_idx, e)| envs[input_idx][map_idx] = e);

                // If we're currently in a map, stack the current block.
                if current_map.is_some() {
                    current_map_blocks.push(name.clone());
                }
            }

            // Special post-processing for map blocks.
            // TODO(spolu): extract some configs from Map such as `on_error` (fail, null) and
            // potentially `concurrency` override.
            if block.block_type() == BlockType::Map {
                current_map = Some(name.clone());
                current_map_blocks = vec![];

                envs = envs
                    .iter()
                    .map(|map_envs| {
                        assert!(map_envs.len() == 1);
                        let env = map_envs[0].clone();
                        match env.state.get(name) {
                            None => unreachable!(), // Checked at map block execution.
                            Some(v) => match v.as_array() {
                                None => unreachable!(), // Checked at map block execution.
                                Some(v) => v
                                    .iter()
                                    .map(|v| {
                                        let mut e = env.clone();
                                        e.state.insert(name.clone(), v.clone());
                                        e
                                    })
                                    .collect::<Vec<_>>(),
                            },
                        }
                    })
                    .collect::<Vec<_>>();
            }
        }

        Ok(())
    }
}

pub async fn cmd_run(data_id: &str, provider_id: ProviderID, model_id: &str) -> Result<()> {
    let app = App::new().await?;
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

    app.register_version().await?;
    app.update_latest().await?;

    Ok(app.run(&d, provider_id, model_id, 8).await?)
}
