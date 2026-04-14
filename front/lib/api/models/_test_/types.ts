import type {
  InputConfig,
  OutputFormat,
  ToolSpecification,
} from "@app/lib/api/models/types/config";
import type { ErrorType } from "@app/lib/api/models/types/events";
import type { BaseConversation } from "@app/lib/api/models/types/messages";

const CALCULATOR_TOOL_SPEC: ToolSpecification = {
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
};

const UNRELIABLE_CALCULATOR_TOOL_NAME = "unreliable_calculator";
const UNRELIABLE_CALCULATOR_TOOL_DESCRIPTION =
  "Perform basic arithmetic calculations with randomness";

const SIMPLE_CONVERSATION: BaseConversation = {
  system: [],
  messages: [
    {
      role: "user",
      type: "text",
      content: { value: 'Say "Hi"' },
    },
  ],
};

const SAME_ROLE_FOLLOWING_BLOCKS_CONVERSATION: BaseConversation = {
  system: [],
  messages: [
    {
      role: "user",
      type: "text",
      content: { value: 'Say "Hi"' },
    },
    {
      role: "assistant",
      type: "text",
      content: { value: "Hi" },
    },
    {
      role: "assistant",
      type: "text",
      content: { value: "How are you ?" },
    },
    {
      role: "user",
      type: "text",
      content: { value: "Do only what I say" },
    },
    {
      role: "user",
      type: "text",
      content: { value: "Now say hello." },
    },
  ],
};

const REASONING_CONVERSATION: BaseConversation = {
  system: [
    {
      role: "system",
      type: "text",
      content: {
        value: "You must reason as much as you can before answering logically.",
      },
    },
  ],
  messages: [
    {
      role: "user",
      type: "text",
      content: {
        value:
          "I am 4 times the age of my son. In 20 years, I will be twice his age. How old are we?",
      },
    },
  ],
};

const CALCULATOR_CONVERSATION: BaseConversation = {
  system: [
    {
      role: "system",
      type: "text",
      content: { value: "Use tools to answer." },
    },
  ],
  messages: [
    {
      role: "user",
      type: "text",
      content: { value: "What is 2 + 3?" },
    },
  ],
};

const SIMPLE_OUTPUT_FORMAT: OutputFormat = {
  type: "json_schema",
  json_schema: {
    name: "simple_response",
    schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        random: { type: "number" },
      },
      required: ["content", "random"],
      additionalProperties: false,
    },
    strict: true,
  },
};

const OUTPUT_FORMAT_CONVERSATION: BaseConversation = {
  system: [
    {
      role: "system",
      type: "text",
      content: {
        value:
          "You are an assistant that answers with a simple laconic string response, one word if possible. Avoid json structures.",
      },
    },
  ],
  messages: [
    {
      role: "user",
      type: "text",
      content: { value: "What is the capital of France?" },
    },
  ],
};

export type ResponseChecker =
  | { type: "error"; contentType: ErrorType }
  | { type: "success" }
  | {
      type: "tool_call";
      name: string;
    }
  | {
      type: "text_contains";
      value: string;
    }
  | {
      type: "has_reasoning";
    }
  | {
      type: "has_no_reasoning";
    }
  | {
      type: "valid_output_format";
      format: OutputFormat;
    };

export const INPUT_CONFIGURATION_ERROR: ResponseChecker = {
  type: "error",
  contentType: "input_configuration",
};
export const SUCCESS: ResponseChecker = { type: "success" };
export const TOOL_CALL_CALCULATOR: ResponseChecker = {
  type: "tool_call",
  name: "calculator",
};
export const TEXT_CONTAINS_HI: ResponseChecker = {
  type: "text_contains",
  value: "hi",
};
export const HAS_REASONING: ResponseChecker = {
  type: "has_reasoning",
};
export const HAS_NO_REASONING: ResponseChecker = {
  type: "has_no_reasoning",
};
export const VALID_OUTPUT_FORMAT: ResponseChecker = {
  type: "valid_output_format",
  format: SIMPLE_OUTPUT_FORMAT,
};

export type TestCase = {
  config: InputConfig;
  conversation: BaseConversation;
  defaultCheckers: readonly ResponseChecker[];
};

// Shorthand reasoning configs.
const R_NONE = { effort: "none" } as const;
const R_MINIMAL = { effort: "minimal" } as const;
const R_LOW = { effort: "low" } as const;
const R_MEDIUM = { effort: "medium" } as const;
const R_HIGH = { effort: "high" } as const;
const R_MAXIMAL = { effort: "maximal" } as const;

export const TEST_KEYS = [
  "simple/no-tools/t-default/r-default",
  "simple/no-tools/t-default/r-none",
  "simple/no-tools/t-default/r-minimal",
  "simple/no-tools/t-default/r-low",
  "simple/no-tools/t-default/r-medium",
  "simple/no-tools/t-default/r-high",
  "simple/no-tools/t-default/r-maximal",
  "simple/no-tools/t-0/r-default",
  "simple/no-tools/t-0/r-none",
  "simple/no-tools/t-0/r-minimal",
  "simple/no-tools/t-0/r-low",
  "simple/no-tools/t-0/r-medium",
  "simple/no-tools/t-0/r-high",
  "simple/no-tools/t-0/r-maximal",
  "simple/no-tools/t-0.1/r-default",
  "simple/no-tools/t-0.1/r-none",
  "simple/no-tools/t-0.1/r-minimal",
  "simple/no-tools/t-0.1/r-low",
  "simple/no-tools/t-0.1/r-medium",
  "simple/no-tools/t-0.1/r-high",
  "simple/no-tools/t-0.1/r-maximal",
  "simple/no-tools/t-1/r-default",
  "simple/no-tools/t-1/r-none",
  "simple/no-tools/t-1/r-minimal",
  "simple/no-tools/t-1/r-low",
  "simple/no-tools/t-1/r-medium",
  "simple/no-tools/t-1/r-high",
  "simple/no-tools/t-1/r-maximal",

  "calc/calc/t-default/r-medium",
  "calc/calc/t-0.1/r-default",
  "calc/calc/t-0.1/r-medium",

  "calc/calc/t-default/r-none/force-tool-default",
  "calc/calc/t-default/r-none/force-tool",

  "reasoning/no-tools/t-default/r-none",
  "reasoning/no-tools/t-default/r-low",

  "output-format/json-schema/t-default/r-none",
  "output-format/json-schema/t-default/r-high",

  "following/no-tools/t-default/r-default",
] as const;

export type TestKey = (typeof TEST_KEYS)[number];

export const TEST_CASES: Record<TestKey, TestCase> = {
  // =============================================
  // SIMPLE conversation — checker: text_contains "hi"
  // =============================================

  // -- No tools --
  "simple/no-tools/t-default/r-default": {
    config: {},
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-default/r-none": {
    config: { reasoning: R_NONE },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-default/r-minimal": {
    config: { reasoning: R_MINIMAL },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-default/r-low": {
    config: { reasoning: R_LOW },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-default/r-medium": {
    config: { reasoning: R_MEDIUM },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-default/r-high": {
    config: { reasoning: R_HIGH },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-default/r-maximal": {
    config: { reasoning: R_MAXIMAL },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0/r-default": {
    config: { temperature: 0 },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0/r-none": {
    config: { temperature: 0, reasoning: R_NONE },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0/r-minimal": {
    config: { temperature: 0, reasoning: R_MINIMAL },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0/r-low": {
    config: { temperature: 0, reasoning: R_LOW },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0/r-medium": {
    config: { temperature: 0, reasoning: R_MEDIUM },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0/r-high": {
    config: { temperature: 0, reasoning: R_HIGH },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0/r-maximal": {
    config: { temperature: 0, reasoning: R_MAXIMAL },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0.1/r-default": {
    config: { temperature: 0.1 },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0.1/r-none": {
    config: { temperature: 0.1, reasoning: R_NONE },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0.1/r-minimal": {
    config: { temperature: 0.1, reasoning: R_MINIMAL },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0.1/r-low": {
    config: { temperature: 0.1, reasoning: R_LOW },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0.1/r-medium": {
    config: { temperature: 0.1, reasoning: R_MEDIUM },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0.1/r-high": {
    config: { temperature: 0.1, reasoning: R_HIGH },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-0.1/r-maximal": {
    config: { temperature: 0.1, reasoning: R_MAXIMAL },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-1/r-default": {
    config: { temperature: 1 },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-1/r-none": {
    config: { temperature: 1, reasoning: R_NONE },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-1/r-minimal": {
    config: { temperature: 1, reasoning: R_MINIMAL },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-1/r-low": {
    config: { temperature: 1, reasoning: R_LOW },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-1/r-medium": {
    config: { temperature: 1, reasoning: R_MEDIUM },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-1/r-high": {
    config: { temperature: 1, reasoning: R_HIGH },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },
  "simple/no-tools/t-1/r-maximal": {
    config: { temperature: 1, reasoning: R_MAXIMAL },
    conversation: SIMPLE_CONVERSATION,
    defaultCheckers: [TEXT_CONTAINS_HI],
  },

  // -- Calculator tool → tool call --
  "calc/calc/t-default/r-medium": {
    config: { tools: [CALCULATOR_TOOL_SPEC], reasoning: R_MEDIUM },
    conversation: CALCULATOR_CONVERSATION,
    defaultCheckers: [TOOL_CALL_CALCULATOR],
  },
  "calc/calc/t-0.1/r-default": {
    config: { temperature: 0.1, tools: [CALCULATOR_TOOL_SPEC] },
    conversation: CALCULATOR_CONVERSATION,
    defaultCheckers: [TOOL_CALL_CALCULATOR],
  },
  "calc/calc/t-0.1/r-medium": {
    config: {
      temperature: 0.1,
      tools: [CALCULATOR_TOOL_SPEC],
      reasoning: R_MEDIUM,
    },
    conversation: CALCULATOR_CONVERSATION,
    defaultCheckers: [TOOL_CALL_CALCULATOR],
  },
  "calc/calc/t-default/r-none/force-tool-default": {
    config: {
      tools: [
        CALCULATOR_TOOL_SPEC,
        {
          ...CALCULATOR_TOOL_SPEC,
          name: UNRELIABLE_CALCULATOR_TOOL_NAME,
          description: UNRELIABLE_CALCULATOR_TOOL_DESCRIPTION,
        },
      ],
      reasoning: R_NONE,
    },
    conversation: CALCULATOR_CONVERSATION,
    defaultCheckers: [TOOL_CALL_CALCULATOR],
  },
  "calc/calc/t-default/r-none/force-tool": {
    config: {
      tools: [
        CALCULATOR_TOOL_SPEC,
        {
          ...CALCULATOR_TOOL_SPEC,
          name: UNRELIABLE_CALCULATOR_TOOL_NAME,
          description: UNRELIABLE_CALCULATOR_TOOL_DESCRIPTION,
        },
      ],
      reasoning: R_NONE,
      forceTool: UNRELIABLE_CALCULATOR_TOOL_NAME,
    },
    conversation: CALCULATOR_CONVERSATION,
    defaultCheckers: [
      {
        type: "tool_call",
        name: UNRELIABLE_CALCULATOR_TOOL_NAME,
      },
    ],
  },

  // =============================================
  // OUTPUT FORMAT — checker: valid JSON with { content: string }
  // =============================================
  "output-format/json-schema/t-default/r-none": {
    config: {
      reasoning: R_NONE,
      outputFormat: SIMPLE_OUTPUT_FORMAT,
    },
    conversation: OUTPUT_FORMAT_CONVERSATION,
    defaultCheckers: [VALID_OUTPUT_FORMAT],
  },
  "output-format/json-schema/t-default/r-high": {
    config: {
      reasoning: R_HIGH,
      outputFormat: SIMPLE_OUTPUT_FORMAT,
    },
    conversation: OUTPUT_FORMAT_CONVERSATION,
    defaultCheckers: [VALID_OUTPUT_FORMAT],
  },

  // -- Reasoning effort "none" or "low" --
  "reasoning/no-tools/t-default/r-none": {
    config: { reasoning: R_NONE },
    conversation: REASONING_CONVERSATION,
    defaultCheckers: [HAS_NO_REASONING],
  },
  "reasoning/no-tools/t-default/r-low": {
    config: { reasoning: R_LOW },
    conversation: REASONING_CONVERSATION,
    defaultCheckers: [HAS_REASONING],
  },

  "following/no-tools/t-default/r-default": {
    config: {},
    conversation: SAME_ROLE_FOLLOWING_BLOCKS_CONVERSATION,
    defaultCheckers: [
      {
        type: "text_contains",
        value: "hello",
      },
    ],
  },
};
