export const LEGACY_CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION = {
  incompleteDelimiterPatterns: [/<\/?[a-zA-Z_]*$/],
  delimiters: [
    {
      openingPattern: "<thinking>",
      closingPattern: "</thinking>",
      classification: "chain_of_thought" as const,
      swallow: false,
    },
    {
      openingPattern: "<response>",
      closingPattern: "</response>",
      classification: "tokens" as const,
      swallow: false,
    },
  ],
};

export const DEEPSEEK_CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION = {
  incompleteDelimiterPatterns: [/<\/?[a-zA-Z_]*$/],
  delimiters: [
    {
      openingPattern: "<think>",
      closingPattern: "</think>",
      classification: "chain_of_thought" as const,
      swallow: false,
    },
    {
      openingPattern: "<response>",
      closingPattern: "</response>",
      classification: "tokens" as const,
      swallow: false,
    },
  ],
};
