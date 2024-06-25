use crate::blocks::block::{
    find_variables, parse_pair, replace_variables_in_string, Block, BlockResult, BlockType, Env,
};
use crate::providers::chat_messages::{ChatMessage, ContentBlock, UserChatMessage};
use crate::providers::llm::{ChatMessageRole, LLMChatRequest, LLMRequest, Tokens};
use crate::providers::provider::ProviderID;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde::Serialize;
use serde_json::{json, Value};
use std::str::FromStr;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

#[derive(Clone)]
pub struct LLM {
    few_shot_preprompt: Option<String>,
    few_shot_count: Option<usize>,
    few_shot_prompt: Option<String>,
    prompt: Option<String>,
    max_tokens: i32,
    temperature: f32,
    stop: Vec<String>,
    frequency_penalty: Option<f32>,
    presence_penalty: Option<f32>,
    top_p: Option<f32>,
    top_logprobs: Option<i32>,
}

impl LLM {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut few_shot_preprompt: Option<String> = None;
        let mut few_shot_count: Option<usize> = None;
        let mut few_shot_prompt: Option<String> = None;
        let mut prompt: Option<String> = None;
        let mut max_tokens: Option<i32> = None;
        let mut temperature: Option<f32> = None;
        let mut stop: Vec<String> = vec![];
        let mut frequency_penalty: Option<f32> = None;
        let mut presence_penalty: Option<f32> = None;
        let mut top_p: Option<f32> = None;
        let mut top_logprobs: Option<i32> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "few_shot_preprompt" => few_shot_preprompt = Some(value),
                        "few_shot_count" => match value.parse::<usize>() {
                            Ok(n) => few_shot_count = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `few_shot_count` in `llm` block, \
                                 expecting unsigned integer"
                            ))?,
                        },
                        "few_shot_prompt" => few_shot_prompt = Some(value),
                        "prompt" => prompt = Some(value),
                        "max_tokens" => match value.parse::<i32>() {
                            Ok(n) => max_tokens = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `max_tokens` in `llm` block, expecting integer"
                            ))?,
                        },
                        "temperature" => match value.parse::<f32>() {
                            Ok(n) => temperature = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `temperature` in `llm` block, expecting float"
                            ))?,
                        },
                        "stop" => stop = value.split("\n").map(|s| String::from(s)).collect(),
                        "frequency_penalty" => match value.parse::<f32>() {
                            Ok(n) => frequency_penalty = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `frequency_penalty` in `llm` block, expecting float"
                            ))?,
                        },
                        "presence_penalty" => match value.parse::<f32>() {
                            Ok(n) => presence_penalty = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `presence_penalty` in `llm` block, expecting float"
                            ))?,
                        },
                        "top_p" => match value.parse::<f32>() {
                            Ok(n) => top_p = Some(n),
                            Err(_) => {
                                Err(anyhow!("Invalid `top_p` in `llm` block, expecting float"))?
                            }
                        },
                        "top_logprobs" => match value.parse::<i32>() {
                            Ok(n) => top_logprobs = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `top_logprobs` in `llm` block, expecting integer"
                            ))?,
                        },
                        _ => Err(anyhow!("Unexpected `{}` in `llm` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `llm` block"))?,
                _ => unreachable!(),
            }
        }

        if !max_tokens.is_some() {
            Err(anyhow!("Missing required `max_tokens` in `llm` block"))?;
        }
        if !temperature.is_some() {
            Err(anyhow!("Missing required `temperature` in `llm` block"))?;
        }

        Ok(LLM {
            few_shot_preprompt,
            few_shot_count,
            few_shot_prompt,
            prompt,
            max_tokens: max_tokens.unwrap(),
            temperature: temperature.unwrap(),
            stop,
            frequency_penalty,
            presence_penalty,
            top_p,
            top_logprobs,
        })
    }

    fn replace_few_shot_prompt_variables(text: &str, env: &Env) -> Result<Vec<String>> {
        let variables = find_variables(text);

        if variables.len() == 0 {
            Err(anyhow!(
                "`few_shot_prompt` must contain variables \
                 refering to a block output (${{BLOCK.key}})"
            ))?
        }

        // Check that all variables refer to the same block.
        let name = variables[0].0.clone();
        for (n, _) in &variables {
            if n != &name {
                Err(anyhow!(
                    "Variables in `few_shot_prompt` must refer to the same block (`{}` != `{}`)",
                    n,
                    name
                ))?;
            }
        }

        let keys = variables.iter().map(|v| v.1.clone()).collect::<Vec<_>>();

        // Check that the block output exists and is an array.
        let output = env
            .state
            .get(&name)
            .ok_or_else(|| anyhow!("Block `{}` output not found", name))?;
        if !output.is_array() {
            Err(anyhow!(
                "Block `{}` output is not an array, the block output referred in \
                 `few_shot_prompt` must be an array",
                name
            ))?;
        }
        let output = output.as_array().unwrap();

        // Check that the block output elements are objects.
        for o in output {
            if !o.is_object() {
                Err(anyhow!(
                    "Block `{}` output elements are not objects, the block output referred \
                     in `few_shot_prompt` must be an array of objects",
                    name
                ))?;
            }
        }

        // Check that all the keys are present in the block output.
        for key in keys {
            if output.len() > 0 && !output[0].as_object().unwrap().contains_key(&key) {
                Err(anyhow!(
                    "Key `{}` is not present in block `{}` output objects",
                    key,
                    name
                ))?;
            }
            // Check that output[0][key] is a string.
            if output.len() > 0
                && !output[0]
                    .as_object()
                    .unwrap()
                    .get(&key)
                    .unwrap()
                    .is_string()
            {
                Err(anyhow!("`{}.{}` is not a string", name, key,))?;
            }
        }

        Ok(output
            .iter()
            .map(|o| {
                let mut text = text.to_string();
                for (name, key) in &variables {
                    text =
                        text.replace(&format!("${{{}.{}}}", name, key), &o[key].as_str().unwrap());
                }
                text
            })
            .collect())
    }

    fn replace_prompt_variables(text: &str, env: &Env) -> Result<String> {
        replace_variables_in_string(text, "prompt", env)
    }

    fn prompt(&self, env: &Env) -> Result<String> {
        let mut prompt = String::new();

        // If there is a `few_shot_preprompt`, reaplce variables and add it to the prompt.
        if let Some(few_shot_preprompt) = &self.few_shot_preprompt {
            prompt.push_str(Self::replace_prompt_variables(few_shot_preprompt, env)?.as_str());
        }

        // If `few_shot_prompt` is defined check that `few_shot_count` and add few shots to the
        // prompt.
        if let Some(few_shot_prompt) = &self.few_shot_prompt {
            if let None = &self.few_shot_count {
                Err(anyhow!(
                    "If `few_shot_prompt` is defined, `few_shot_count` is required"
                ))?;
            }

            // We take the `few_shot_count` first elements (leaving to the user the decision to
            // shuffle the few_shots in a preprocessing code step).
            Self::replace_few_shot_prompt_variables(few_shot_prompt, env)?
                .iter()
                .take(self.few_shot_count.unwrap())
                .for_each(|p| prompt.push_str(p));
        }

        // If `prompt` is defined, replace variables in it and add it.
        if let Some(p) = &self.prompt {
            prompt.push_str(Self::replace_prompt_variables(p, env)?.as_str());
        }

        // replace <DUST_TRIPLE_BACKTICKS> with ```
        prompt = prompt.replace("<DUST_TRIPLE_BACKTICKS>", "```");
        // println!("PROMPT: {}", prompt);

        Ok(prompt)
    }
}

#[derive(Debug, Serialize, PartialEq)]
struct LLMValue {
    prompt: Tokens,
    completion: Tokens,
}

#[async_trait]
impl Block for LLM {
    fn block_type(&self) -> BlockType {
        BlockType::LLM
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("llm".as_bytes());
        if let Some(few_shot_preprompt) = &self.few_shot_preprompt {
            hasher.update(few_shot_preprompt.as_bytes());
        }
        if let Some(few_shot_count) = self.few_shot_count {
            hasher.update(few_shot_count.to_string().as_bytes());
        }
        if let Some(few_shot_prompt) = &self.few_shot_prompt {
            hasher.update(few_shot_prompt.as_bytes());
        }
        if let Some(prompt) = &self.prompt {
            hasher.update(prompt.as_bytes());
        }
        hasher.update(self.max_tokens.to_string().as_bytes());
        hasher.update(self.temperature.to_string().as_bytes());
        for s in self.stop.iter() {
            hasher.update(s.as_bytes());
        }
        if let Some(frequency_penalty) = &self.frequency_penalty {
            hasher.update(frequency_penalty.to_string().as_bytes());
        }
        if let Some(presence_penalty) = &self.presence_penalty {
            hasher.update(presence_penalty.to_string().as_bytes());
        }
        if let Some(top_p) = &self.top_p {
            hasher.update(top_p.to_string().as_bytes());
        }
        if let Some(top_logprobs) = &self.top_logprobs {
            hasher.update(top_logprobs.to_string().as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        name: &str,
        env: &Env,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        let config = env.config.config_for_block(name);

        let (provider_id, model_id, temperature) = match config {
            Some(v) => {
                let provider_id = match v.get("provider_id") {
                    Some(v) => match v {
                        Value::String(s) => match ProviderID::from_str(s) {
                            Ok(p) => p,
                            Err(e) => Err(anyhow!(
                                "Invalid `provider_id` `{}` in configuration \
                                 for llm block `{}`: {}",
                                s,
                                name,
                                e
                            ))?,
                        },
                        _ => Err(anyhow!(
                            "Invalid `provider_id` in configuration for llm block `{}`: \
                             string expected",
                            name
                        ))?,
                    },
                    _ => Err(anyhow!(
                        "Missing `provider_id` in configuration for llm block `{}`",
                        name
                    ))?,
                };

                let model_id = match v.get("model_id") {
                    Some(v) => match v {
                        Value::String(s) => s.clone(),
                        _ => Err(anyhow!(
                            "Invalid `model_id` in configuration for llm block `{}`",
                            name
                        ))?,
                    },
                    _ => Err(anyhow!(
                        "Missing `model_id` in configuration for llm block `{}`",
                        name
                    ))?,
                };

                let temperature = match v.get("temperature") {
                    Some(v) => match v {
                        Value::Number(t) => match t.as_f64() {
                            Some(t) => Some(t as f32),
                            None => Err(anyhow!(
                                "Invalid `temperature` in configuration for chat block `{}`",
                                name
                            ))?,
                        },
                        _ => Err(anyhow!(
                            "Invalid `temperature` in configuration for chat block `{}`",
                            name
                        ))?,
                    },
                    _ => None,
                };

                (provider_id, model_id, temperature)
            }
            _ => Err(anyhow!(
                "Missing configuration for llm block `{}`, \
                 expecting `{{ \"provider_id\": ..., \"model_id\": ... }}`",
                name
            ))?,
        };

        let use_cache = match config {
            Some(v) => match v.get("use_cache") {
                Some(v) => match v {
                    Value::Bool(b) => *b,
                    _ => true,
                },
                None => true,
            },
            None => true,
        };

        let use_stream = match config {
            Some(v) => match v.get("use_stream") {
                Some(v) => match v {
                    Value::Bool(b) => *b,
                    _ => true,
                },
                None => false,
            },
            None => false,
        } && event_sender.is_some();

        let extras = match config {
            Some(v) => {
                let mut extras = json!({});

                if let Some(Value::String(s)) = v.get("openai_user") {
                    extras["openai_user"] = json!(s.clone());
                }
                if let Some(Value::String(s)) = v.get("openai_organization_id") {
                    extras["openai_organization_id"] = json!(s.clone());
                }
                if let Some(Value::String(s)) = v.get("response_format") {
                    extras["response_format"] = json!(s.clone());
                }

                match extras.as_object().unwrap().keys().len() {
                    0 => None,
                    _ => Some(extras),
                }
            }
            None => None,
        };

        // if model_id starts with gpt-3.5-turbo or gpt-4 use the chat interface (except for
        // gpt-3.5-turbo-instruct)
        match (model_id.starts_with("gpt-3.5-turbo")
            && !model_id.starts_with("gpt-3.5-turbo-instruct"))
            || model_id.starts_with("gpt-4")
        {
            true => {
                let prompt = self.prompt(env)?;
                let messages = vec![ChatMessage::User(UserChatMessage {
                    role: ChatMessageRole::User,
                    name: None,
                    content: ContentBlock::Text(prompt.clone()),
                })];

                let request = LLMChatRequest::new(
                    provider_id,
                    &model_id,
                    &messages,
                    &vec![],
                    None,
                    match temperature {
                        Some(t) => t,
                        None => self.temperature,
                    },
                    self.top_p,
                    1,
                    &self.stop,
                    Some(self.max_tokens),
                    self.presence_penalty,
                    self.frequency_penalty,
                    extras,
                );

                let g = match use_stream {
                    true => {
                        let (tx, mut rx) = unbounded_channel::<Value>();
                        {
                            let map = env.map.clone();
                            let input_index = env.input.index.clone();
                            let block_name = String::from(name);
                            tokio::task::spawn(async move {
                                while let Some(v) = rx.recv().await {
                                    let t = v.get("content");
                                    match event_sender.as_ref() {
                                        Some(sender) => {
                                            let _ = sender.send(json!({
                                                "type": "tokens",
                                                "content": {
                                                    "block_type": "llm",
                                                    "block_name": block_name,
                                                    "input_index": input_index,
                                                    "map": map,
                                                    "tokens": t,
                                                },
                                            }));
                                        }
                                        None => (),
                                    }
                                }
                                // move tx to event_sender
                            });
                        }
                        request
                            .execute(env.credentials.clone(), Some(tx), env.run_id.clone())
                            .await?
                    }
                    false => {
                        request
                            .execute_with_cache(
                                env.credentials.clone(),
                                env.project.clone(),
                                env.store.clone(),
                                use_cache,
                                env.run_id.clone(),
                            )
                            .await?
                    }
                };

                assert!(g.completions.len() == 1);

                Ok(BlockResult {
                    value: serde_json::to_value(LLMValue {
                        prompt: Tokens {
                            text: prompt,
                            tokens: None,
                            logprobs: None,
                            top_logprobs: None,
                        },
                        completion: Tokens {
                            text: g.completions[0]
                                .content
                                .as_ref()
                                .unwrap_or(&String::new())
                                .clone(),
                            tokens: None,
                            logprobs: None,
                            top_logprobs: None,
                        },
                    })?,
                    meta: None,
                })
            }
            false => {
                let request = LLMRequest::new(
                    provider_id,
                    &model_id,
                    self.prompt(env)?.as_str(),
                    Some(self.max_tokens),
                    match temperature {
                        Some(t) => t,
                        None => self.temperature,
                    },
                    1,
                    &self.stop,
                    self.frequency_penalty,
                    self.presence_penalty,
                    self.top_p,
                    self.top_logprobs,
                    extras,
                );

                let g = match use_stream {
                    true => {
                        let (tx, mut rx) = unbounded_channel::<Value>();
                        {
                            let map = env.map.clone();
                            let input_index = env.input.index.clone();
                            let block_name = String::from(name);
                            tokio::task::spawn(async move {
                                while let Some(v) = rx.recv().await {
                                    let t = v.get("content");
                                    match event_sender.as_ref() {
                                        Some(sender) => {
                                            let _ = sender.send(json!({
                                                "type": "tokens",
                                                "content": {
                                                    "block_type": "llm",
                                                    "block_name": block_name,
                                                    "input_index": input_index,
                                                    "map": map,
                                                    "tokens": t,
                                                },
                                            }));
                                        }
                                        None => (),
                                    }
                                }
                                // move tx to event_sender
                            });
                        }
                        request
                            .execute(env.credentials.clone(), Some(tx), env.run_id.clone())
                            .await?
                    }
                    false => {
                        request
                            .execute_with_cache(
                                env.credentials.clone(),
                                env.project.clone(),
                                env.store.clone(),
                                use_cache,
                                env.run_id.clone(),
                            )
                            .await?
                    }
                };

                assert!(g.completions.len() == 1);

                Ok(BlockResult {
                    value: serde_json::to_value(LLMValue {
                        prompt: g.prompt,
                        completion: g.completions[0].clone(),
                    })?,
                    meta: Some(json!({
                        "token_usage": g.usage,
                        "provider_request_id": g.provider_request_id,
                    })),
                })
            }
        }
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
