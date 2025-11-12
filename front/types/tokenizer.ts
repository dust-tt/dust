const TIKTOKEN_TOKENIZER_BASE = [
  "o200k_base",
  "cl100k_base",
  "p50k_base",
  "r50k_base",
  "anthropic_base",
] as const;

export type TiktokenTokenizerBase = (typeof TIKTOKEN_TOKENIZER_BASE)[number];

const SENTENCEPIECE_BASE = ["model_v1", "model_v2", "model_v3"] as const;

export type SentencePieceTokenizerBase = (typeof SENTENCEPIECE_BASE)[number];

export const TOKENIZER_TYPES = ["tiktoken", "sentencepiece"] as const;
export type TokenizerType = (typeof TOKENIZER_TYPES)[number];

export type TokenizerConfig =
  | { type: "tiktoken"; base: TiktokenTokenizerBase }
  | { type: "sentencepiece"; base: SentencePieceTokenizerBase };
