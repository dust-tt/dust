use crate::providers::llm::LLM;
use crate::providers::openai::OpenAIProvider;
use crate::utils::ParseError;
use anyhow::Result;
use async_trait::async_trait;
use std::str::FromStr;

#[derive(Debug, Clone, Copy)]
pub enum ProviderID {
    OpenAI,
}

impl ToString for ProviderID {
    fn to_string(&self) -> String {
        match self {
            ProviderID::OpenAI => String::from("openai"),
        }
    }
}

impl FromStr for ProviderID {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "openai" => Ok(ProviderID::OpenAI),
            _ => Err(ParseError::with_message("Unknown provider type"))?,
        }
    }
}

#[async_trait]
pub trait Provider {
    fn id(&self) -> String;

    fn setup(&self) -> Result<()>;
    async fn test(&self) -> Result<()>;

    fn llm(&self, model_id: String) -> Box<dyn LLM + Sync + Send>;
}

pub fn provider(t: ProviderID) -> Box<dyn Provider + Sync> {
    match t {
        ProviderID::OpenAI => Box::new(OpenAIProvider::new()),
    }
}
