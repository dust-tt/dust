use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;
use serde_json::json;
use hyper::{body::Buf, Body, Client, Method, Request};
use hyper_tls::HttpsConnector;
use std::io::prelude::*;
use urlencoding::encode;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct GoogleAnswer {
    question: String,
    // hash: String,
}

impl GoogleAnswer {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut question: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "question" => question = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `google_answer` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `google_answer` block"))?,
                _ => unreachable!(),
            }
        }

        if !question.is_some() {
            Err(anyhow!("Missing required `question` in `google_answer` block"))?;
        }

        Ok(GoogleAnswer {
            question: question.unwrap(),
        })
    }
}

#[derive(Serialize, Deserialize)]
struct SerpApiAnswerBoxResult {
    answer: String,
}


#[derive(Serialize, Deserialize)]
struct SerpApiResult {
    answer_box: SerpApiAnswerBoxResult,
}

#[async_trait]
impl Block for GoogleAnswer {
    fn block_type(&self) -> BlockType {
        BlockType::Google_Answer
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("google answer".as_bytes());
        hasher.update(self.question.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, _name: &str, env: &Env) -> Result<Value> {
        // expand any macros that might be in the question.
        let formatted_question = replace_variables_in_string(&self.question, &"question", env)?;

        // TODO (sashaa): this code was copied from openai.rs. I tried to factor it out 
        // into a utility function, but the borrow checker was giving me a hard time, so I ended
        // up just copying and modifying it here.
        let serp_api_key = match env.credentials.get("SERP_API_KEY") {
            Some(api_key) => Ok(api_key.clone()),
            None => match std::env::var("SERP_API_KEY") {
                Ok(key) => Ok(key),
                Err(_) =>  Err(anyhow!(
                        "Credentials or environment variable `SERP_API_KEY` is not set."
                )),
            },
        }?;

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let req = Request::builder()
        .method(Method::GET)
        .uri(
            format!("https://serpapi.com/search?q={}&engine={}&api_key={}", 
                encode(&formatted_question),
                "google",
                serp_api_key)
        )
        .body(Body::empty())?;

        let res = cli.request(req).await?;

        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let google_answer : SerpApiResult = match serde_json::from_slice(c) {
            Ok(c) => c,
            Err(_) => return Ok(json!({"question": formatted_question, "answer": null}))
        };

        let str = json!({"question": formatted_question, "answer": google_answer.answer_box.answer});

        Ok(str)
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
