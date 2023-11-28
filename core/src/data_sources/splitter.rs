use crate::providers::embedder::Embedder;
use crate::providers::provider::{provider, ProviderID};
use crate::run::Credentials;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_recursion::async_recursion;
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{cmp, str::FromStr};
use tokio::try_join;

use super::data_source::Section;

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

pub struct TokenizedText {
    pub text: String,
    pub tokens: Vec<usize>,
}

impl TokenizedText {
    pub async fn from(
        embedder: &Box<dyn Embedder + Sync + Send>,
        text: Option<&String>,
    ) -> Result<Option<Self>> {
        match text {
            Some(text) => {
                let tokens = embedder.encode(text).await?;
                Ok(Some(TokenizedText {
                    text: text.to_string(),
                    tokens,
                }))
            }
            None => Ok(None),
        }
    }
}

pub struct TokenizedSection {
    pub prefix: Option<TokenizedText>,
    pub content: Option<TokenizedText>,
    pub sections: Vec<TokenizedSection>,
}

impl TokenizedSection {
    #[async_recursion]
    pub async fn from(
        embedder: &Box<dyn Embedder + Sync + Send>,
        section: &Section,
    ) -> Result<Self> {
        let (prefix, content) = try_join!(
            TokenizedText::from(embedder, section.prefix.as_ref()),
            TokenizedText::from(embedder, section.content.as_ref())
        )?;

        // process sections in parallel
        let sections = futures::future::join_all(
            section
                .sections
                .iter()
                .map(|s| TokenizedSection::from(embedder, s)),
        )
        .await
        .into_iter()
        .collect::<Result<Vec<_>>>()?;

        Ok(TokenizedSection {
            prefix,
            content,
            sections,
        })
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
        sections: Option<Section>,
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

    async fn decode_chunk_with_remainder(
        &self,
        embedder: &Box<dyn Embedder + Sync + Send>,
        chunk: &[usize],
    ) -> Result<(String, Vec<usize>)> {
        // The maximum number of tokens to slide the window by when decoding fails.
        const MAX_ERROR_SLIDE: usize = 4;

        let mut end = chunk.len();

        while end > 0 {
            if chunk.len() - end > MAX_ERROR_SLIDE {
                return Err(anyhow!("Could not tokenize the provided document"));
            }
            match embedder.decode(chunk[0..end].to_vec()).await {
                Ok(decoded_string) => {
                    return Ok((decoded_string, chunk[end..].to_vec()));
                }
                Err(_) => {
                    end -= 1;
                    continue;
                }
            }
        }

        return Err(anyhow!("Could not tokenize the provided document."));
    }

    async fn split_text(
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

            match self
                .decode_chunk_with_remainder(&embedder, tokenized_chunk)
                .await
            {
                Ok((chunk, remainder)) => {
                    current_chunk_size = current_chunk_size - remainder.len();
                    decoded.push(chunk);
                }
                Err(e) => {
                    return Err(e);
                }
            }
            if current_chunk_size <= 0 {
                return Err(anyhow!("Could not tokenize the provided document"));
            }
            encoded = encoded[current_chunk_size..].to_vec();
        }

        Ok(decoded)
    }

    async fn split_sections(
        &self,
        credentials: Credentials,
        provider_id: ProviderID,
        model_id: &str,
        max_chunk_size: usize,
        section: Section,
    ) -> Result<Vec<String>> {
        return Ok(vec![]);
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
        sections: Option<Section>,
    ) -> Result<Vec<String>> {
        match sections {
            Some(sections) => {
                self.split_sections(credentials, provider_id, model_id, max_chunk_size, sections)
                    .await
            }
            None => {
                self.split_text(credentials, provider_id, model_id, max_chunk_size, text)
                    .await
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_splitter(input: &String, expected: &String, max_chunk_size: usize) -> Result<()> {
        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";

        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        let text = input;
        let splitted = splitter(SplitterID::BaseV0)
            .split(
                credentials,
                provider_id,
                model_id,
                max_chunk_size,
                &text,
                None,
            )
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
        // Without proper handling, the decoding of the first chunk would fail because the token
        // "9468" alone is incomplete.
        // We test that the splitter() function is properly handling this case.
        let input = "🔥🔥".to_string();

        test_splitter(&input, &input, max_chunk_size).await.unwrap();
    }

    #[tokio::test]
    async fn test_splitter_basic_text() {
        let cases: [String; 2] = [
            "a random document string with no double space".repeat(10),
            "a  random  document string WITH double spaces".repeat(10),
        ];
        let re = Regex::new(r"\s+").unwrap();

        let max_chunk_size = 8;

        for case in cases {
            let expected = re.replace_all(&case, " ");
            test_splitter(&case, &expected.to_string(), max_chunk_size)
                .await
                .unwrap();
        }
    }
}
