export const MISTRAL_WHITELISTED_MODEL_IDS = [
  "mistral-large-latest",
  "mistral-small-latest",
];

export type MistralWhitelistedModelId =
  (typeof MISTRAL_WHITELISTED_MODEL_IDS)[number];
