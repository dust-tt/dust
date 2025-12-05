// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TIKTOKEN_TOKENIZER_BASE = [
  "o200k_base",
  "cl100k_base",
  "p50k_base",
  "r50k_base",
  "anthropic_base",
] as const;

type TiktokenTokenizerBase = (typeof TIKTOKEN_TOKENIZER_BASE)[number];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SENTENCEPIECE_BASE = ["model_v1", "model_v2", "model_v3"] as const;

type SentencePieceTokenizerBase = (typeof SENTENCEPIECE_BASE)[number];

export type TokenizerConfig =
  | { type: "tiktoken"; base: TiktokenTokenizerBase }
  | { type: "sentence_piece"; base: SentencePieceTokenizerBase };
