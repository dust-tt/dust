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
        let mut decoded = vec![];

        let mut start = 0;
        while start < encoded.len() {
            let end = cmp::min(start + max_chunk_size - 1, encoded.len() - 1);

            match decode_chunk_with_remainder(&embedder, &encoded[start..=end]).await {
                Ok((chunk_decoded, chunk_remainder)) => {
                    
                    if chunk_remainder.is_some() {
                        let chunk_remainder_value = chunk_remainder.unwrap();
                        if chunk_remainder_value.len() == max_chunk_size {
                            return Err(anyhow!("The remainder chunk is the same size as the max chunk size - can't keep decoding. max_chunk_size: {}", max_chunk_size));
                        }
                        start += (end - start) + 1 - chunk_remainder_value.len();
                    } else {
                        start += (end - start) + 1;
                    }
                    
                    if chunk_decoded.is_some() {
                        decoded.push(chunk_decoded.unwrap());
                    }
                },
                Err(e) => {
                    return Err(e);
                }
            }
        }

        async fn decode_chunk_with_remainder(
            embedder: &Box<dyn Embedder + Sync + Send>,
            chunk: &[usize],
        ) -> Result<(Option<String>, Option<Vec<usize>>), anyhow::Error> {
            let mut remaining: Option<Vec<usize>> = None;
            // The maximum number of tokens to slide the window by when decoding fails.
            const MAX_ERROR_SLIDE : usize = 4;

            let mut end = chunk.len();

            while end > 0 {
                if chunk.len() - end > MAX_ERROR_SLIDE {
                    return Err(anyhow!("Failed to decode chunk after moving the sliding window one {} times by one.", MAX_ERROR_SLIDE));
                }
                match embedder.decode(chunk[0..end].to_vec()).await {
                    Ok(decoded_token) => {

                        if end != chunk.len() {
                            remaining = Some(chunk[end..].to_vec());
                        }
                        return Ok((Some(decoded_token), remaining));       
                    },
                    Err(_) => {
                        end -= 1;
                        continue;
                    }
                }
            }

            return Err(anyhow!("Failed to decode chunk. Chunk size: {}", chunk.len()));
        }

        Ok(decoded)
    }
}

mod tests {
    use super::*;

    async fn test_splitter(input: String, expected: String, max_chunk_size: usize) -> Result<()> {
        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";

        let credentials = Credentials::new();

        let text = input;
        let splitted = splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, max_chunk_size, &text)
            .await?;

        assert_eq!(splitted.join(""), expected);
        Ok(())
    }
    #[tokio::test]
    async fn test_splitter_all() {
        let cases = [
        "◦ ◦".to_string(), 
        "a random document string with no double space".to_string(),
        "a  random  document  string  WITH  double  space".to_string()
        ];
        let max_chunk_size: usize = 3;

        for case in cases {
            let input = case.to_string();
            let re = Regex::new(r"\s+").unwrap();
            let expected = re.replace_all(&input, " ");
            test_splitter(input.clone(), expected.to_string(), max_chunk_size).await.unwrap();
        }
        
    }


}
