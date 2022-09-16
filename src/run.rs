use crate::blocks::block::BlockType;
use crate::store::SQLiteStore;
use crate::store::Store;
use crate::utils;
use anyhow::{anyhow, Result};
use async_fs::File;
use futures::prelude::*;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{to_string_pretty, Value};
use std::collections::HashMap;

/// BlockExecution represents the execution of a block:
/// - `env` used
/// - `value` returned by successful execution
/// - `error` message returned by a failed execution
#[derive(Serialize, Deserialize, PartialEq, Debug)]
pub struct BlockExecution {
    // pub env: Env,
    pub value: Option<Value>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct RunConfig {
    pub blocks: HashMap<String, Value>,
}

impl RunConfig {
    pub fn config_for_block(&self, name: &str) -> Option<&Value> {
        self.blocks.get(name)
    }

    pub async fn load(run_id: &str) -> Result<Self> {
        let root_path = utils::init_check().await?;
        let runs_dir = root_path.join(".runs");

        assert!(runs_dir.is_dir().await);
        let run_dir = runs_dir.join(run_id);

        if !run_dir.exists().await {
            Err(anyhow!("Run `{}` does not exist", run_id))?;
        }

        let config_path = run_dir.join("config.json");

        let config_data = async_std::fs::read_to_string(config_path).await?;
        let config: RunConfig = serde_json::from_str(&config_data)?;

        Ok(config)
    }
}

/// Execution represents the full execution of an app on input data.
#[derive(PartialEq, Debug)]
pub struct Run {
    run_id: String,
    created: u64,
    app_hash: String,
    config: RunConfig,
    // List of blocks (in order with name) and their execution.
    // The outer vector represents blocks
    // The inner-outer vector represents inputs
    // The inner-inner vector represents mapped outputs
    // If execution was interrupted by errors, the non-executed block won't be present. If a block
    // on a particular Env was not executed due to a conditional execution, its BlockExecution will
    // be present but both output and error will be None.
    // TODO(spolu): note that there is a lot of repetition here in particular through the env
    // variables, will need to be revisited but that's a fair enough starting point.
    pub traces: Vec<((BlockType, String), Vec<Vec<BlockExecution>>)>,
}

impl Run {
    pub fn new(app_hash: &str, config: RunConfig) -> Self {
        Run {
            run_id: utils::new_id(),
            created: utils::now(),
            app_hash: app_hash.to_string(),
            config,
            traces: vec![],
        }
    }

    /// Creates a new Run object in memory from raw data (used by Store implementations)
    pub fn new_from_store(
        run_id: &str,
        created: u64,
        app_hash: &str,
        config: &RunConfig,
        traces: Vec<((BlockType, String), Vec<Vec<BlockExecution>>)>,
    ) -> Self {
        Run {
            run_id: run_id.to_string(),
            created,
            app_hash: app_hash.to_string(),
            config: config.clone(),
            traces,
        }
    }

    pub fn config(&self) -> &RunConfig {
        &self.config
    }

    pub async fn store(&self, store: &dyn Store) -> Result<()> {
        store.store_run(self).await
        // let root_path = utils::init_check().await?;
        // let runs_dir = root_path.join(".runs");

        // assert!(runs_dir.is_dir().await);
        // let run_dir = runs_dir.join(&self.run_id);
        // assert!(!run_dir.exists().await);

        // utils::action(&format!("Creating directory {}", run_dir.display()));
        // async_std::fs::create_dir_all(&run_dir).await?;

        // let config_path = run_dir.join("config.json");
        // utils::action(&format!("Writing run config in {}", config_path.display()));
        // {
        //     let mut file = File::create(config_path).await?;
        //     file.write_all(serde_json::to_string(&self.config)?.as_bytes())
        //         .await?;
        //     file.flush().await?;
        // }

        // for (block_idx, ((block_type, name), block_execution)) in self.traces.iter().enumerate() {
        //     let block_dir =
        //         run_dir.join(format!("{}:{}:{}", block_idx, block_type.to_string(), name));
        //     utils::action(&format!("Creating directory {}", block_dir.display()));
        //     async_std::fs::create_dir_all(&block_dir).await?;
        //     for (input_idx, executions) in block_execution.iter().enumerate() {
        //         let executions_path = block_dir.join(format!("{}.json", input_idx));
        //         {
        //             let mut file = File::create(executions_path).await?;
        //             file.write_all(serde_json::to_string(executions)?.as_bytes())
        //                 .await?;
        //             file.flush().await?;
        //         }
        //     }
        // }
        // utils::done(&format!(
        //     "Run `{}` for app version `{}` stored",
        //     self.run_id, self.app_hash
        // ));

        // Ok(())
    }

    pub async fn load(run_id: &str, store: &dyn Store) -> Result<Self> {
        store.load_run(run_id).await
        // let config = RunConfig::load(run_id).await?;

        // let root_path = utils::init_check().await?;
        // let runs_dir = root_path.join(".runs");

        // assert!(runs_dir.is_dir().await);
        // let run_dir = runs_dir.join(run_id);

        // if !run_dir.exists().await {
        //     Err(anyhow!("Run `{}` does not exist", run_id))?;
        // }

        // let mut entries = async_std::fs::read_dir(run_dir.clone()).await?;
        // let mut blocks: Vec<(usize, BlockType, String)> = vec![];
        // while let Some(entry) = entries.next().await {
        //     let entry = entry?;
        //     let path = entry.path();
        //     if path.is_dir().await {
        //         lazy_static! {
        //             static ref RE: Regex =
        //                 Regex::new(r"(\d+):([a-z0-9\._]+):([A-Z0-9_]+)").unwrap();
        //         }
        //         let captures = RE
        //             .captures(path.file_name().unwrap().to_str().unwrap())
        //             .unwrap();
        //         blocks.push((
        //             captures.get(1).unwrap().as_str().parse::<usize>()?,
        //             captures.get(2).unwrap().as_str().parse::<BlockType>()?,
        //             captures.get(3).unwrap().as_str().to_string(),
        //         ));
        //     }
        // }
        // blocks.sort_by(|a, b| a.0.cmp(&b.0));

        // // println!("BLOCKS: {:?}", blocks);

        // let mut traces: Vec<((BlockType, String), Vec<Vec<BlockExecution>>)> = vec![];

        // for (index, block_type, name) in blocks.iter() {
        //     let block_dir = run_dir.join(format!("{}:{}:{}", index, block_type.to_string(), name));
        //     let mut entries = async_std::fs::read_dir(block_dir).await?;
        //     let mut executions: Vec<(usize, Vec<BlockExecution>)> = vec![];
        //     while let Some(entry) = entries.next().await {
        //         let entry = entry?;
        //         let path = entry.path();
        //         if path.is_file().await {
        //             lazy_static! {
        //                 static ref RE: Regex = Regex::new(r"(\d+).json").unwrap();
        //             }
        //             match RE.captures(path.file_name().unwrap().to_str().unwrap()) {
        //                 Some(captures) => {
        //                     let input_idx = captures.get(1).unwrap().as_str().parse::<usize>()?;
        //                     let data = async_std::fs::read_to_string(path).await?;
        //                     executions.push((input_idx, serde_json::from_str(&data)?));
        //                 }
        //                 None => {}
        //             }
        //         }
        //     }
        //     executions.sort_by(|a, b| a.0.cmp(&b.0));

        //     traces.push((
        //         (block_type.clone(), name.clone()),
        //         executions.into_iter().map(|(_, v)| v).collect(),
        //     ));
        // }

        // Ok(Run {
        //     run_id: run_id.to_string(),
        //     config,
        //     traces,
        // })
    }
}

pub async fn all_runs(store: &dyn Store) -> Result<Vec<(String, u64, String, RunConfig)>> {
    store.all_runs().await
    // let root_path = utils::init_check().await?;
    // let runs_dir = root_path.join(".runs");

    // let mut entries = async_std::fs::read_dir(runs_dir).await?;
    // let mut runs: Vec<(String, RunConfig)> = vec![];
    // while let Some(entry) = entries.next().await {
    //     let entry = entry?;
    //     let path = entry.path();
    //     if path.is_dir().await {
    //         let run_id = path.file_name().unwrap().to_str().unwrap();
    //         let config = RunConfig::load(run_id).await?;
    //         runs.push((run_id.to_string(), config));
    //     }
    // }

    // runs.sort_by(|a, b| b.1.created.cmp(&a.1.created));

    // Ok(runs)
}

pub async fn cmd_inspect(run_id: &str, block: &str) -> Result<()> {
    let mut run_id = run_id.to_string();

    if run_id == "latest" {
        let runs = all_runs().await?;
        if runs.len() == 0 {
            Err(anyhow!("No run found"))?;
        }
        run_id = runs[0].0.clone();
        utils::info(&format!("Latest run is `{}`", run_id));
    }

    let run = Run::load(run_id.as_str()).await?;
    let mut found = false;
    run.traces.iter().for_each(|((_, name), input_executions)| {
        if name == block {
            input_executions
                .iter()
                .enumerate()
                .for_each(|(input_idx, map_executions)| {
                    map_executions
                        .iter()
                        .enumerate()
                        .for_each(|(map_idx, execution)| {
                            found = true;
                            utils::info(&format!(
                                "Execution: input_idx={}/{} map_idx={}/{}",
                                input_idx,
                                input_executions.len(),
                                map_idx,
                                map_executions.len()
                            ));
                            match execution.value.as_ref() {
                                Some(v) => println!("{}", to_string_pretty(v).unwrap()),
                                None => {}
                            }
                            match execution.error.as_ref() {
                                Some(e) => utils::error(&format!("Error: {}", e)),
                                None => {}
                            }
                        });
                });
        }
    });

    if !found {
        Err(anyhow!("Block `{}` not found in run `{}`", block, run_id))?;
    }

    Ok(())
}

pub async fn cmd_list() -> Result<()> {
    let s = SQLiteStore::new_in_memory()?;
    s.init().await?;
    println!("INIT DONE");

    let runs = all_runs().await?;

    runs.iter().for_each(|(run_id, config)| {
        utils::info(&format!(
            "Run: {} app_hash={} created={}",
            run_id,
            config.app_hash,
            utils::utc_date_from(config.created),
        ));
    });
    Ok(())
}
