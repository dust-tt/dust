use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TiktokenTokenizerBase {
    O200kBase,
    Cl100kBase,
    P50kBase,
    R50kBase,
    AnthropicBase,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SentencePieceTokenizerBase {
    ModelV1,
    ModelV2,
    ModelV3,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TokenizerConfig {
    Tiktoken { base: TiktokenTokenizerBase },
    SentencePiece { base: SentencePieceTokenizerBase },
}
