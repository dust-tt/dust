use crate::blocks::block::{parse_pair, Block, BlockResult, BlockType, Env};
use crate::deno::script::Script;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone)]
pub struct Code {
    code: String,
}

impl Code {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut code: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "code" => code = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `code` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `code` block"))?,
                _ => unreachable!(),
            }
        }

        if !code.is_some() {
            Err(anyhow!("Missing required `code` in `code` block"))?;
        }

        Ok(Code {
            code: code.unwrap(),
        })
    }
}

#[async_trait]
impl Block for Code {
    fn block_type(&self) -> BlockType {
        BlockType::Code
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("code".as_bytes());
        hasher.update(self.code.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        _name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        // Assumes there is a _fun function defined in `source`.
        // TODO(spolu): revisit, not sure this is optimal.
        let env = env.clone();
        let code = self.code.clone();
        let (result, logs): (Value, Vec<Value>) = tokio::task::spawn_blocking(move || {
            let mut script = Script::from_string(code.as_str())?
                .with_timeout(std::time::Duration::from_secs(10));
            script.call("_fun", &env)
        })
        .await??;
        Ok(BlockResult {
            value: result.clone(),
            meta: Some(json!({ "logs": logs })),
        })
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
