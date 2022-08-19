use crate::models::llm::LLM;
use crate::utils::ParseError;
use anyhow::Result;
use std::str::FromStr;

#[derive(Debug, Clone, Copy)]
pub enum ProviderType {
  OpenAI,
}

impl ToString for ProviderType {
  fn to_string(&self) -> String {
    match self {
      ProviderType::OpenAI => String::from("openai"),
    }
  }
}

impl FromStr for ProviderType {
  type Err = ParseError;
  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s {
      "openai" => Ok(ProviderType::OpenAI),
      _ => Err(ParseError::with_message("Unknown provider type"))?,
    }
  }
}

pub trait Provider {
  fn id() -> String;

  fn llm(model_id: String) -> dyn LLM;
}
