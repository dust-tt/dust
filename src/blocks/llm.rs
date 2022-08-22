use crate::blocks::block::{Block, Env};
use crate::providers::provider;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use regex::Regex;
use serde_json::Value;

pub struct LLM {
    introduction: Option<String>,
    examples_count: Option<usize>,
    examples_prompt: Option<String>,
    prompt: Option<String>,
}

impl LLM {
    fn find_variables(text: &str) -> Vec<(String, String)> {
        lazy_static! {
            static ref RE: Regex =
                Regex::new(r"\$\{(?P<name>[A-Z0-9_]+)\.(?P<key>[a-zA-Z0-9_\.]+)\}").unwrap();
        }

        RE.captures_iter(text)
            .map(|c| {
                let name = c.name("name").unwrap().as_str();
                let key = c.name("key").unwrap().as_str();
                println!("{} {}", name, key);
                (String::from(name), String::from(key))
            })
            .collect::<Vec<_>>()
    }

    fn replace_examples_prompt_variables(text: &str, env: &Env) -> Result<Vec<String>> {
        let variables = LLM::find_variables(text);

        if variables.len() == 0 {
            Err(anyhow!(
                "`examples_prompt` must contain variables refering to a block output"
            ))?
        }

        // Check that all variables refer to the same block.
        let name = variables[0].0.clone();
        for (n, _) in &variables {
            if n != &name {
                Err(anyhow!(
                    "Variables in `examples_prompt` must refer to the same block (`{}` != `{}`)",
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
            Err(anyhow!("Block `{}` output is not an array", name))?;
        }
        let output = output.as_array().unwrap();

        // Check that the block output elements are objects.
        for o in output {
            if !o.is_object() {
                Err(anyhow!("Block `{}` output element is not an object", name))?;
            }
        }

        // Check that all the keys are present in the block output.
        for key in keys {
            if !output[0].as_object().unwrap().contains_key(&key) {
                Err(anyhow!(
                    "`{}` is not present in block `{}` output",
                    key,
                    name
                ))?;
            }
            // check that output[0][key] is a string.
            if !output[0]
                .as_object()
                .unwrap()
                .get(&key)
                .unwrap()
                .is_string()
            {
                Err(anyhow!(
                    "`{}` in block `{}` output is not a string",
                    key,
                    name
                ))?;
            }
        }

        Ok(output
            .iter()
            .map(|o| {
                let mut text = text.to_string();
                for (name, key) in &variables {
                    text = text.replace(
                        &format!("${{{}.{}}}", name, key),
                        &o[key].as_str().unwrap(),
                    );
                }
                text
            })
            .collect())
    }

    fn replace_variables(text: &str, env: &Env) -> Result<String> {
        let variables = LLM::find_variables(text);
        let value = |(name, key): (&str, &str)| -> Result<String> {
            println!("{:?}", env.state.get(name));
            match env.state.get(name) {
                None => Err(anyhow!("Block output {} not found", name))?,
                Some(o) => match o.get(key) {
                    None => Err(anyhow!("Variable {}.{} not found", name, key))?,
                    Some(v) => match v.is_string() {
                        false => Err(anyhow!("Variable {}.{} is not a string", name, key))?,
                        true => Ok(v.as_str().unwrap().to_string()),
                    },
                },
            }
        };

        let mut text = String::from(text);
        for (name, key) in variables {
            let v = value((name.as_str(), key.as_str()))?;
            text = text.replace(&format!("${{{}.{}}}", name, key), v.as_str());
        }

        Ok(text)
    }

    // fn prompt(&self) -> String {
    //     // initialize a mutable prompt String
    //     let mut prompt = String::new();
    //     // if there is an introduction, add it to the prompt
    //     if let Some(introduction) = &self.introduction {
    //         prompt.push_str(introduction);
    //     }
    // }
}

#[async_trait]
impl Block for LLM {
    async fn execute(&self, env: &Env) -> Result<Value> {
        let provider = provider::provider(env.provider);

        let mut model = provider.llm(env.model_id.clone());
        model.initialize()?;

        Ok(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::provider::ProviderID;

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
    fn replace_examples_prompt_variables() -> Result<()> {
        let env = Env {
            provider: ProviderID::OpenAI,
            model_id: "foo".to_string(),
            state: serde_json::from_str(
                r#"{"RETRIEVE":[{"question":"What is your name?"},{"question":"What is your dob"}],"DATA":{"answer":"John"}}"#,
            )
            .unwrap(),
            input: serde_json::from_str(r#"{"question":"Who is it?"}"#).unwrap(),
        };
        assert_eq!(
            LLM::replace_examples_prompt_variables(r#"QUESTION: ${RETRIEVE.question}"#, &env)?,
            vec![
                r#"QUESTION: What is your name?"#.to_string(),
                r#"QUESTION: What is your dob"#.to_string(),
            ]
        );

        Ok(())
    }
}
