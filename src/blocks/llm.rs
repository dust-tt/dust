use crate::blocks::block::{parse_pair, Block, BlockType, Env};
use crate::providers::llm::{LLMRequest, Tokens};
use crate::providers::provider::ProviderID;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use pest::iterators::Pair;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use std::str::FromStr;

#[derive(Clone)]
pub struct LLM {
    few_shot_preprompt: Option<String>,
    few_shot_count: Option<usize>,
    few_shot_prompt: Option<String>,
    prompt: Option<String>,
    max_tokens: i32,
    temperature: f32,
    stop: Vec<String>,
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
        })
    }

    fn find_variables(text: &str) -> Vec<(String, String)> {
        lazy_static! {
            static ref RE: Regex =
                Regex::new(r"\$\{(?P<name>[A-Z0-9_]+)\.(?P<key>[a-zA-Z0-9_\.]+)\}").unwrap();
        }

        RE.captures_iter(text)
            .map(|c| {
                let name = c.name("name").unwrap().as_str();
                let key = c.name("key").unwrap().as_str();
                // println!("{} {}", name, key);
                (String::from(name), String::from(key))
            })
            .collect::<Vec<_>>()
    }

    fn replace_few_shot_prompt_variables(text: &str, env: &Env) -> Result<Vec<String>> {
        let variables = LLM::find_variables(text);

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
            if !output[0].as_object().unwrap().contains_key(&key) {
                Err(anyhow!(
                    "Key `{}` is not present in block `{}` output objects",
                    key,
                    name
                ))?;
            }
            // Check that output[0][key] is a string.
            if !output[0]
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
        let variables = LLM::find_variables(text);

        let mut prompt = text.to_string();

        variables
            .iter()
            .map(|(name, key)| {
                // Check that the block output exists and is an object.
                let output = env
                    .state
                    .get(name)
                    .ok_or_else(|| anyhow!("Block `{}` output not found", name))?;
                if !output.is_object() {
                    Err(anyhow!(
                        "Block `{}` output is not an object, the blocks output referred in \
                         `prompt` must be objects",
                        name
                    ))?;
                }
                let output = output.as_object().unwrap();

                if !output.contains_key(key) {
                    Err(anyhow!(
                        "Key `{}` is not present in block `{}` output",
                        key,
                        name
                    ))?;
                }
                // Check that output[key] is a string.
                if !output.get(key).unwrap().is_string() {
                    Err(anyhow!("`{}.{}` is not a string", name, key,))?;
                }
                prompt = prompt.replace(
                    &format!("${{{}.{}}}", name, key),
                    &output[key].as_str().unwrap(),
                );

                Ok(())
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(prompt)
    }

    fn prompt(&self, env: &Env) -> Result<String> {
        // Initialize a mutable prompt String.
        let mut prompt = String::new();

        // If there is a few_shot_preprompt add it to the prompt.
        if let Some(few_shot_preprompt) = &self.few_shot_preprompt {
            prompt.push_str(few_shot_preprompt);
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
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, name: &str, env: &Env) -> Result<Value> {
        let config = env.config.config_for_block(name);

        let (provider_id, model_id) = match config {
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

                (provider_id, model_id)
            }
            _ => Err(anyhow!(
                "Missing configuration for llm block `{}`, \
                 expecting `{{ \"provider_id\": ..., \"model_id\": ... }}`",
                name
            ))?,
        };

        let request = LLMRequest::new(
            provider_id,
            &model_id,
            self.prompt(env)?.as_str(),
            Some(self.max_tokens),
            self.temperature,
            1,
            &self.stop,
        );

        let g = request.execute_with_cache(env.llm_cache.clone()).await?;
        assert!(g.completions.len() == 1);

        Ok(serde_json::to_value(LLMValue {
            prompt: g.prompt,
            completion: g.completions[0].clone(),
        })?)
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::block::InputState;
    use crate::providers::llm::LLMCache;
    use crate::run::RunConfig;
    use crate::stores::sqlite::SQLiteStore;
    use parking_lot::RwLock;
    use std::collections::HashMap;
    use std::sync::Arc;

    #[test]
    fn find_variables() -> Result<()> {
        assert_eq!(
            LLM::find_variables("QUESTION: ${RETRIEVE.question}\nANSWER: ${DATA.answer}"),
            vec![
                ("RETRIEVE".to_string(), "question".to_string()),
                ("DATA".to_string(), "answer".to_string()),
            ]
        );

        Ok(())
    }

    #[test]
    fn replace_few_shot_prompt_variables() -> Result<()> {
        let env = Env {
            config: RunConfig {
                blocks: HashMap::new(),
            },
            state: serde_json::from_str(
                r#"{"RETRIEVE":[
                    {"question":"What is your name?"},
                    {"question":"What is your dob"}
                    ],
                    "DATA":{"answer":"John"}}"#,
            )
            .unwrap(),
            input: InputState {
                value: Some(serde_json::from_str(r#"{"question":"Who is it?"}"#).unwrap()),
                index: 0,
            },
            map: None,
            llm_cache: Arc::new(RwLock::new(LLMCache::new())),
            store: Box::new(SQLiteStore::new_in_memory()?),
        };
        assert_eq!(
            LLM::replace_few_shot_prompt_variables("QUESTION: ${RETRIEVE.question}\n", &env)?,
            vec![
                "QUESTION: What is your name?\n".to_string(),
                "QUESTION: What is your dob\n".to_string(),
            ]
        );

        Ok(())
    }

    #[test]
    fn replace_prompt_variables() -> Result<()> {
        let env = Env {
            config: RunConfig {
                blocks: HashMap::new(),
            },
            state: serde_json::from_str(
                r#"{"RETRIEVE":{"question":"What is your name?"},"DATA":{"answer":"John"}}"#,
            )
            .unwrap(),
            input: InputState {
                value: Some(serde_json::from_str(r#"{"question":"Who is it?"}"#).unwrap()),
                index: 0,
            },
            map: None,
            llm_cache: Arc::new(RwLock::new(LLMCache::new())),
            store: Box::new(SQLiteStore::new_in_memory()?),
        };
        assert_eq!(
            LLM::replace_prompt_variables(
                r#"QUESTION: ${RETRIEVE.question} ANSWER: ${DATA.answer}"#,
                &env
            )?,
            r#"QUESTION: What is your name? ANSWER: John"#.to_string()
        );

        Ok(())
    }
}
