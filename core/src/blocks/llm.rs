use crate::blocks::block::{
    find_variables, parse_pair, replace_variables_in_string, serde_number_to_string, Block, BlockType, Env,
};
use crate::providers::llm::{LLMRequest, Tokens};
use crate::providers::provider::ProviderID;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde::Serialize;
use serde_json::{json, Value};
use std::str::FromStr;
use jsonpath_rust::JsonPathQuery;

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

    fn replace_few_shot_prompt_variables(text: &str, env: &Env) -> Result<Vec<String>> {
        let variables = find_variables(text);

        if variables.len() == 0 {
            Err(anyhow!(
                "`few_shot_prompt` must contain JSONPath variables inside ${{}} brackets. If you do \
                not want to include any variables, just move this text into the main llm prompt."
            ))?
        }

        // First run each of the JSONPath queries against the environment, and get the array of
        // results that comes back from each query. values_from_env will be a Vector of tuples
        // which are the JSONPath query and the array of results from that JSONPath query.
        let values_from_env : Vec<(String, Vec<String>)> = variables.iter().map(|jsonpath_query_raw| {
            // For whatever reason, the JSONPath library we use insists on queries starting with $,
            // which seems to be not required in general. If it's not there, we add it to make the
            // JSONPath library happy.
            let jsonpath_query = if !jsonpath_query_raw.starts_with("$.") {
                "$.".to_owned() + jsonpath_query_raw
            } else {
                jsonpath_query_raw.to_string()
            };

            let array_of_values = match json!(env.state).path(&jsonpath_query) {
                Ok(matched_values) =>  match matched_values {
                    Value::Number(number_value) => Ok([serde_number_to_string(&number_value)?].to_vec()),
                    Value::String(string_value) => Ok([string_value.to_string()].to_vec()),
                    Value::Array(array_value) => array_value.iter().map(|value| {
                            match value {
                                Value::Number(number_value) => Ok(serde_number_to_string(&number_value)?),
                                Value::String(string_value) => Ok(string_value.to_string()),
                                _ => Err(anyhow!("All the patterns that match the JSONPath query {} must be numbers or strings.", jsonpath_query))
                            }
                        })
                        .collect(),
                    Value::Null => Err(anyhow!("`few_shot_prompt` JSONPath queries must result in a number, \
                    a string, or a an array of numbers or strings, but the query `{}` resulted in \
                    the null.", jsonpath_query)),
                    Value::Bool(bool_value) => Err(anyhow!("`few_shot_prompt` JSONPath queries must result in a number, \
                    a string, or a an array of numbers or strings, but the query `{}` resulted in \
                    the boolean `{}`.", jsonpath_query, if bool_value  { "true" } else { "false" })),
                    Value::Object(object_value) => Err(anyhow!("`few_shot_prompt` JSONPath queries must result in a number, \
                    a string, or a an array of numbers or strings, but the query `{}` resulted in \
                    the object `{}`.", jsonpath_query, object_value.serialize(serde_json::value::Serializer)?)),
                },
                Err(e) => Err(anyhow!("Error applying JSONPath `{}`: {}", jsonpath_query, e)),
            }?;

            Ok((jsonpath_query_raw.clone(), array_of_values))

        }).collect::<Result<Vec<_>,anyhow::Error>>()?;

        // Check that all of the JSONPath queries returned the same number of results. If one 
        // JSONPath query returns more results than another, we won't know how many few shot 
        // prompts to return.
        let first_array_len = values_from_env[0].1.len();
        values_from_env.iter().map(|(jsonpath_query, values_for_one_query)| {
            if values_for_one_query.len() == first_array_len { 
                Ok(())
            } else {
                Err(anyhow!("`few_shot_prompt` JSONPath queries must result in the same number \
                    of results. The query `{}` returned {} result(s), while the query `{}` returned {} result(s). \
                    Results for `{}`: {:?}. \
                    Results for `{}`: {:?}.", 
                    values_from_env[0].0, first_array_len, jsonpath_query, values_for_one_query.len(), 
                    values_from_env[0].0, values_from_env[0].1,
                    jsonpath_query, values_for_one_query))
            }
        }).collect::<Result<Vec<_>,_>>()?;

        // Replace all the JSONPath queries with their respective values in text.
        // let mut i : usize = 0;
        let mut results : Vec<String> = Vec::new();
        for (i, _) in Vec::from_iter(0..first_array_len).iter().enumerate() {
            let mut single_result = text.clone().to_string();
            for (jsonpath_query, values) in &values_from_env {
                single_result = single_result.replace(&format!("${{{}}}", jsonpath_query), &values[i]);
            };
            results.push(single_result);
        }

        Ok(results)
    }

    fn replace_prompt_variables(text: &str, env: &Env) -> Result<String> {
        replace_variables_in_string(text, "prompt", env)
    }

    fn prompt(&self, env: &Env) -> Result<String> {
        // Initialize a mutable prompt String.
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

        let g = request
            .execute_with_cache(
                env.credentials.clone(),
                env.project.clone(),
                env.store.clone(),
            )
            .await?;
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
    use crate::project::Project;
    use crate::run::{Credentials, RunConfig};
    use crate::stores::sqlite::SQLiteStore;
    use std::collections::HashMap;

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
            project: Project::new_from_id(1),
            store: Box::new(SQLiteStore::new_in_memory()?),
            credentials: Credentials::new(),
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
            project: Project::new_from_id(1),
            store: Box::new(SQLiteStore::new_in_memory()?),
            credentials: Credentials::new(),
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
