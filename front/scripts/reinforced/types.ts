import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";

// Input types from JSON files (SQL query results)
export interface RawMessageInput {
  conversationSId: string;
  messageSId: string;
  rank: string; // comes as string from SQL export
  version: string; // comes as string from SQL export
  createdAt: string;
  messageType: "user" | "agent" | "content_fragment";
  userMessageContent: string;
  userContextUsername: string;
  userContextFullName: string;
  agentMessageStatus: string;
  agentConfigurationId: string;
  errorCode: string;
  errorMessage: string;
  stepContents: string; // JSON string or empty string
}

export interface StepContent {
  step: number;
  index: number;
  type: "text_content" | "reasoning" | "function_call" | "error";
  value: {
    type: string;
    value?: string | { id: string; name: string; arguments: string };
    text?: string;
    name?: string;
    arguments?: Record<string, unknown>;
    result?: unknown;
    [key: string]: unknown;
  };
}

export interface FeedbackInput {
  conversationSId: string;
  messageSId: string;
  thumbDirection: AgentMessageFeedbackDirection;
  feedbackContent: string | null;
  feedbackCreatedAt: string;
  userName: string | null;
  userEmail: string | null;
}

export interface AgentPromptInput {
  agentSId: string;
  agentName: string;
  agentDescription: string;
  instructions: string | null;
  modelId: string;
  providerId: string;
  version: number;
}

export interface EvaluationResponse {
  result: "Yes" | "No";
  summary: string;
  suggestion: string;
}

export interface EvaluationResult {
  conversationId: string;
  evaluation: EvaluationResponse | null;
  error?: string;
}

export interface EvaluationOutput {
  metadata: {
    evaluatorModel: string;
    agentSId: string;
    agentName: string;
    numConversations: number;
    timestamp: string;
    execute: boolean;
  };
  results: EvaluationResult[];
}

// File names for data files in runs/[workspaceId]/[agentName]/
export const DATA_FILES = {
  PROMPT: "prompt.json",
  CONVERSATIONS: "conversations.json",
  FEEDBACK: "feedback.json",
  EVALUATION: "evaluation.json",
  SUGGESTION: "suggestion.md",
} as const;

// Prompt template files (in script directory)
export const PROMPT_TEMPLATES = {
  EVALUATOR: "2_evaluator_prompt.txt",
  SUGGESTION: "3_suggestion_prompt.txt",
} as const;
