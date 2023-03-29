use crate::providers::embedder::Embedder;
use crate::providers::provider::{provider, ProviderID};

use crate::run::Credentials;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{cmp, str::FromStr};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SplitterID {
    BaseV0,
}

impl ToString for SplitterID {
    fn to_string(&self) -> String {
        match self {
            SplitterID::BaseV0 => String::from("base_v0"),
        }
    }
}

impl FromStr for SplitterID {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "base_v0" => Ok(SplitterID::BaseV0),
            _ => Err(ParseError::with_message(
                "Unknown splitter ID (possible values: base_v0)",
            ))?,
        }
    }
}

#[async_trait]
pub trait Splitter {
    fn id(&self) -> SplitterID;

    async fn decode_chunk_with_remainder(
        &self,
        embedder: &Box<dyn Embedder + Sync + Send>,
        chunk: &[usize],
    ) -> Result<(Option<String>, Option<Vec<usize>>)>;   

    async fn split(
        &self,
        credentials: Credentials,
        provider_id: ProviderID,
        model_id: &str,
        max_chunk_size: usize,
        text: &str,
    ) -> Result<Vec<String>>;
}

pub fn splitter(s: SplitterID) -> Box<dyn Splitter + Sync + Send> {
    match s {
        SplitterID::BaseV0 => Box::new(BaseV0Splitter::new()),
    }
}

pub struct BaseV0Splitter {}

impl BaseV0Splitter {
    pub fn new() -> Self {
        BaseV0Splitter {}
    }
}

#[async_trait]
impl Splitter for BaseV0Splitter {
    fn id(&self) -> SplitterID {
        SplitterID::BaseV0
    }

    async fn decode_chunk_with_remainder(
        &self,
        embedder: &Box<dyn Embedder + Sync + Send>,
        chunk: &[usize],
    ) -> Result<(Option<String>, Option<Vec<usize>>)> {
        
        // The maximum number of tokens to slide the window by when decoding fails.
        const MAX_ERROR_SLIDE: usize = 4;

        let mut end = chunk.len();

        while end > 0 {
            if chunk.len() - end > MAX_ERROR_SLIDE {
                return Err(anyhow!("Could not tokenize the provided document"));
            }
            match embedder.decode(chunk[0..end].to_vec()).await {
                Ok(decoded_string) => {
                    let mut remaining: Option<Vec<usize>> = None;
                    if end != chunk.len() {
                        remaining = Some(chunk[end..].to_vec());
                    }
                    return Ok((Some(decoded_string), remaining));
                }
                Err(_) => {
                    end -= 1;
                    continue;
                }
            }
        }

        return Err(anyhow!(
            "Could not tokenize the provided document."
        ));
    }


    async fn split(
        &self,
        credentials: Credentials,
        provider_id: ProviderID,
        model_id: &str,
        max_chunk_size: usize,
        text: &str,
    ) -> Result<Vec<String>> {
        // Replace all \s+ with " " and trim.
        let re = Regex::new(r"\s+").unwrap();
        let clean = re.replace_all(text, " ");
        let clean = clean.trim();
        // Get the embedder and initialize.
        let mut embedder = provider(provider_id).embedder(model_id.to_string());
        embedder.initialize(credentials).await?;

        // Encode the clean text.
        let mut encoded = embedder.encode(clean).await?;

        let mut decoded = vec![];

        while encoded.len() > 0 {
            let mut current_chunk_size = cmp::min(max_chunk_size, encoded.len());
            let tokenized_chunk = &encoded[0..current_chunk_size];

            match self.decode_chunk_with_remainder(&embedder, tokenized_chunk).await {
                Ok((chunk_decoded, chunk_remainder)) => {
                    if chunk_remainder.is_some() {
                        let chunk_remainder_value = chunk_remainder.unwrap();
                        if chunk_remainder_value.len() >= max_chunk_size {
                            return Err(anyhow!("Could not tokenize the provided document.."));
                        }
                        current_chunk_size = current_chunk_size - chunk_remainder_value.len();
                    }

                    if chunk_decoded.is_some() {
                        decoded.push(chunk_decoded.unwrap());
                    }
                }
                Err(e) => {
                    return Err(e);
                }
            }
            encoded = encoded[current_chunk_size..].to_vec();
        }


        Ok(decoded)
    }
}

mod tests {
    use super::*;

    async fn test_splitter(input: &String, expected: &String, max_chunk_size: usize) -> Result<()> {
        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";

        let credentials = Credentials::new();

        let text = input;
        let splitted = splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, max_chunk_size, &text)
            .await?;

        assert_eq!(&splitted.join(""), expected);
        Ok(())
    }
    #[tokio::test]
    async fn test_splitter_one_utf8_char_maps_to_multiple_tokens() {
        let max_chunk_size: usize = 4;

        // A single '🔥' emoji gets tokenized as : [9468, 242, 98].
        // So the string '🔥🔥' gets tokenized as : [9468, 242, 98, 9468, 242, 98]
        // With max_chunk_size=4, we end up with two chunks : [9468, 242, 98, 9468] and [242, 98].
        // Without proper handling, the decoding of the first chunk would fail because the token "9468" alone is incomplete.
        // We test that the splitter() function is properly handling this case.
        let input = "🔥🔥".to_string();

        test_splitter(&input, &input, max_chunk_size).await.unwrap();
    }

    #[tokio::test]
    async fn test_splitter_basic_text() {
        let cases : [String; 2] = [
            "a random document string with no double space".repeat(10),
            "a  random  document string WITH double spaces".repeat(10),
        ];
        let re = Regex::new(r"\s+").unwrap();
        
        let max_chunk_size = 8;

        for case in cases {
            let expected = re.replace_all(&case, " ");
            test_splitter(&case, &expected.to_string(), max_chunk_size).await.unwrap();
        }
    }
}
