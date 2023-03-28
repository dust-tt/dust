use crate::providers::{provider::{provider, ProviderID}};
use crate::providers::embedder::{Embedder};
use futures::executor::block_on;

use crate::run::Credentials;
use crate::utils::ParseError;
use anyhow::Result;
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

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
        let encoded = embedder.encode(clean).await?;

        // Split the encoded text into chunks of size max_chunk_size.
        let mut chunks = Vec::new();
        let mut chunk = Vec::new();
        let mut chunk_size = 0;
        for token in encoded {
            chunk.push(token);
            chunk_size += 1;
            if chunk_size >= max_chunk_size {
                chunks.push(chunk);
                chunk = Vec::new();
                chunk_size = 0;
            }
        }
        if chunk.len() > 0 {
            chunks.push(chunk);
        }
        let mut decoded = Vec::new();
        let mut remaining : Vec<usize> = Vec::new();

        fn decode_chunk_with_remainder(embedder: &Box<dyn Embedder + Sync + Send>, chunk: Vec<usize>) -> Result<(String, Vec<usize>)> {
            let mut result : String = String::new();
            let mut remaining : Vec<usize> = Vec::new();

            let mut end = chunk.len();
            
            while end > 0 {
                let decoded_future = embedder.decode(chunk.clone()[0..end].to_vec());
                let decoded_result = block_on(decoded_future);
                if decoded_result.is_err() {
                    // Do we need a warning log here?
                    end -= 1;
                    continue
                } else {
                    result = decoded_result.unwrap();
                    remaining = chunk.clone()[end..].to_vec();
                    break
                }
                
            }

            Ok((result, remaining))
        }

        for chunk in chunks {
            
            let mut chunk_with_remaining: Vec<usize> = Vec::new();
            chunk_with_remaining.append(&mut remaining);
            chunk_with_remaining.append(&mut chunk.clone());

            let (chunk_decoded, chunk_remainder) = decode_chunk_with_remainder(&embedder, chunk_with_remaining)?;
            if chunk_decoded.len() > 0 {
                decoded.push(chunk_decoded);
            }
            if chunk_remainder.len() > 0 {
                // If you have failure on multiple chunks in a row, this won't work :/
                remaining = chunk_remainder;
            }
        }
        if remaining.len() > 0 {
            let (chunk_decoded, _chunk_remainder) = decode_chunk_with_remainder(&embedder, remaining)?;
            if chunk_decoded.len() > 0 {
                decoded.push(chunk_decoded);
            }
        }

        Ok(decoded)
    }
}

mod tests {
    use rstest::rstest;
    use super::*;
    

    
    #[rstest]
    #[case("◦  ◦", "◦ ◦")]
    #[case("a random document string with no double space", "a random document string with no double space")]
    #[case("a  random  document  string  WITH  double  space", "a random document string WITH double space")]
    #[tokio::test]
    async fn test_splitter(#[case] input: String, #[case] expected: String) -> Result<()> {
        
        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let max_chunk_size = 3;

            let credentials = Credentials::new();

            
            
            let text = input;
            let splitted = splitter(SplitterID::BaseV0)
                .split(credentials, provider_id, model_id, max_chunk_size, &text)
                .await?;

            assert_eq!(splitted.join(""), expected);
        Ok(())
    }
}
