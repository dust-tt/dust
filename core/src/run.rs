use crate::blocks::block::BlockType;
use crate::utils;
use anyhow::Result;
use serde::ser::Serializer;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::str::FromStr;

/// BlockExecution represents the execution of a block:
/// - `env` used
/// - `value` returned by successful execution
/// - `error` message returned by a failed execution
#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct BlockExecution {
    // pub env: Env,
    pub value: Option<Value>,
    pub error: Option<String>,
    pub meta: Option<Value>,
}

// TODO(2024-04-29 flav) Temporary step until we remove `hash` from the `block_executions` table.
#[derive(Serialize)]
pub struct ExecutionWithTimestamp {
    pub execution: BlockExecution,
    pub created: i64,
}

pub type Credentials = HashMap<String, String>;

#[derive(Clone)]
pub struct Secrets {
    pub redacted: bool,
    pub secrets: HashMap<String, String>,
}

impl Serialize for Secrets {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        if self.redacted {
            let redacted_secrets: HashMap<String, String> = self
                .secrets
                .keys()
                .map(|key| (key.clone(), String::from("••••••")))
                .collect();
            redacted_secrets.serialize(serializer)
        } else {
            self.secrets.serialize(serializer)
        }
    }
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct RunConfig {
    pub blocks: HashMap<String, Value>,
}

impl RunConfig {
    pub fn config_for_block(&self, name: &str) -> Option<&Value> {
        self.blocks.get(name)
    }

    pub fn concurrency_for_block(&self, block_type: BlockType, name: &str) -> usize {
        let block_config = self.config_for_block(name);

        if let Some(block_config) = block_config {
            if let Some(concurrency) = block_config.get("concurrency") {
                if let Some(concurrency) = concurrency.as_u64() {
                    return concurrency as usize;
                }
            }
        }

        // Default concurrency parameters
        match block_type {
            BlockType::Input => 64,
            BlockType::Data => 64,
            BlockType::DataSource => 8,
            BlockType::Code => 64,
            BlockType::LLM => 32,
            BlockType::Chat => 32,
            BlockType::Map => 64,
            BlockType::Reduce => 64,
            BlockType::Search => 8,
            BlockType::Curl => 8,
            BlockType::Browser => 8,
            BlockType::While => 64,
            BlockType::End => 64,
            BlockType::DatabaseSchema => 8,
            BlockType::Database => 8,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Running,
    Succeeded,
    Errored,
}

impl ToString for Status {
    fn to_string(&self) -> String {
        match self {
            Status::Running => "running".to_string(),
            Status::Succeeded => "succeeded".to_string(),
            Status::Errored => "errored".to_string(),
        }
    }
}

impl FromStr for Status {
    type Err = utils::ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "running" => Ok(Status::Running),
            "succeeded" => Ok(Status::Succeeded),
            "errored" => Ok(Status::Errored),
            _ => Err(utils::ParseError::with_message("Unknown Status"))?,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BlockStatus {
    pub block_type: BlockType,
    pub name: String,
    pub status: Status,
    pub success_count: usize,
    pub error_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct RunStatus {
    run: Status,
    blocks: Vec<BlockStatus>,
}

impl RunStatus {
    pub fn set_block_status(&mut self, status: BlockStatus) {
        match self
            .blocks
            .iter()
            .position(|s| (s.block_type == status.block_type && s.name == status.name))
        {
            Some(i) => {
                let _ = std::mem::replace(&mut self.blocks[i], status);
            }
            None => {
                self.blocks.push(status);
            }
        }
    }

    pub fn set_run_status(&mut self, status: Status) {
        self.run = status;
    }

    pub fn run_status(&self) -> Status {
        self.run.clone()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RunType {
    Deploy,
    Local,
    Execute,
}

impl ToString for RunType {
    fn to_string(&self) -> String {
        match self {
            RunType::Deploy => "deploy".to_string(),
            RunType::Local => "local".to_string(),
            RunType::Execute => "execute".to_string(),
        }
    }
}

impl FromStr for RunType {
    type Err = utils::ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "deploy" => Ok(RunType::Deploy),
            "local" => Ok(RunType::Local),
            "execute" => Ok(RunType::Execute),
            _ => Err(utils::ParseError::with_message("Unknown RunType"))?,
        }
    }
}

/// Execution represents the full execution of an app on input data.
#[derive(PartialEq, Debug, Serialize, Clone)]
pub struct Run {
    run_id: String,
    created: u64,
    run_type: RunType,
    app_hash: String,
    config: RunConfig,
    status: RunStatus,
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
    pub fn new(run_type: RunType, app_hash: &str, config: RunConfig) -> Self {
        Run {
            run_id: utils::new_id(),
            created: utils::now(),
            run_type,
            app_hash: app_hash.to_string(),
            config,
            status: RunStatus {
                run: Status::Running,
                blocks: vec![],
            },
            traces: vec![],
        }
    }

    /// Creates a new Run object in memory from raw data (used by Store implementations)
    pub fn new_from_store(
        run_id: &str,
        created: u64,
        run_type: RunType,
        app_hash: &str,
        config: &RunConfig,
        status: &RunStatus,
        traces: Vec<((BlockType, String), Vec<Vec<BlockExecution>>)>,
    ) -> Self {
        Run {
            run_id: run_id.to_string(),
            created,
            run_type,
            app_hash: app_hash.to_string(),
            config: config.clone(),
            status: status.clone(),
            traces,
        }
    }

    pub fn run_id(&self) -> &str {
        &self.run_id
    }

    pub fn created(&self) -> u64 {
        self.created
    }

    pub fn run_type(&self) -> RunType {
        self.run_type.clone()
    }

    pub fn app_hash(&self) -> &str {
        &self.app_hash
    }

    pub fn config(&self) -> &RunConfig {
        &self.config
    }

    pub fn status(&self) -> &RunStatus {
        &self.status
    }

    pub fn set_status(&mut self, status: RunStatus) {
        self.status = status;
    }

    pub fn set_run_status(&mut self, status: Status) {
        self.status.run = status;
    }

    pub fn set_block_status(&mut self, status: BlockStatus) {
        self.status.set_block_status(status);
    }

    /// Cancel the run by marking it and all running blocks as errored
    pub fn cancel(&mut self) {
        self.status.run = Status::Errored;
        for block in &mut self.status.blocks {
            if block.status == Status::Running {
                block.status = Status::Errored;
            }
        }
    }
}
