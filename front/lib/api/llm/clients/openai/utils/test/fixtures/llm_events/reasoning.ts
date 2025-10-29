export const reasoningLLMEvents = [
  {
    type: "reasoning_delta",
    content: {
      delta: "**Solving the Equation**\n\nWe need to ",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "reasoning_delta",
    content: {
      delta: "solve the equation.\n\n",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "reasoning_delta",
    content: {
      delta: "**Solving the Quadratic**\n\nTo solve ",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "reasoning_delta",
    content: {
      delta: "the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "text_delta",
    content: {
      delta: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "text_delta",
    content: {
      delta: "$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "reasoning_generated",
    content: {
      text: "**Solving the Equation**\n\nWe need to solve the equation.\n\n",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "reasoning_generated",
    content: {
      text: "**Solving the Quadratic**\n\nTo solve the equation $$x^2 + 2x + 1 = 0$$, I can factor it...",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "text_generated",
    content: {
      text: "# Solving the equation\n\nGiven:\n$$\nx^2 + 2x + 1 = 0\n$$\n\nNotice it factors as:\n$$\n(x + 1)^2 = 0\n$$\n\n",
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 6853,
      cachedTokens: 0,
      reasoningTokens: 320,
      outputTokens: 414,
      totalTokens: 7267,
    },
    metadata: {
      clientId: "openai_responses",
      modelId: "gpt-5",
    },
  },
];
