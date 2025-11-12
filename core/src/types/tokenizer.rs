use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TiktokenTokenizerBase {
    #[serde(rename = "o200k_base")]
    O200kBase,
    #[serde(rename = "cl100k_base")]
    Cl100kBase,
    #[serde(rename = "p50k_base")]
    P50kBase,
    #[serde(rename = "r50k_base")]
    R50kBase,
    #[serde(rename = "anthropic_base")]
    AnthropicBase,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SentencePieceTokenizerBase {
    #[serde(rename = "model_v1")]
    ModelV1,
    #[serde(rename = "model_v2")]
    ModelV2,
    #[serde(rename = "model_v3")]
    ModelV3,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TokenizerConfig {
    #[serde(rename = "tiktoken")]
    Tiktoken { base: TiktokenTokenizerBase },
    #[serde(rename = "sentencepiece")]
    SentencePiece { base: SentencePieceTokenizerBase },
}
