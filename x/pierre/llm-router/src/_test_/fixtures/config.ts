export const basicConfigWithTools = {
  maxOutputTokens: 2048,
  reasoningEffort: "medium" as const,
  reasoningDetailsLevel: "high" as const,
  tools: [
    {
      name: "get_weather",
      description: "Get the current weather for a location",
      inputSchema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA",
          },
          unit: {
            type: "string",
            enum: ["celsius", "fahrenheit"],
            description: "The temperature unit to use",
          },
        },
        required: ["location", "unit"],
        additionalProperties: false,
      },
    },
    {
      name: "calculator",
      description: "Perform basic arithmetic calculations",
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["add", "subtract", "multiply", "divide"],
            description: "The operation to perform",
          },
          a: {
            type: "number",
            description: "First operand",
          },
          b: {
            type: "number",
            description: "Second operand",
          },
        },
        required: ["operation", "a", "b"],
        additionalProperties: false,
      },
    },
  ],
};
