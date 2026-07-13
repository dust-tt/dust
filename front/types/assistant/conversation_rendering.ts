import type { ModelMessageTypeMultiActions } from "./generation";

export type ConversationRenderMessageDiagnostic = {
  index: number;
  name: string | null;
  role: ModelMessageTypeMultiActions["role"];
  tokenCount: number;
};

export type ConversationRenderDiagnostics = {
  counts: {
    modelMessageCount: number;
    renderedInteractionCount: number;
    renderedMessageCount: number;
    selectedInteractionCount: number;
  };
  messageBreakdown: ConversationRenderMessageDiagnostic[];
  pruning: {
    currentInteractionPruned: boolean;
    omittedInteractionCount: number;
    previousInteractionsPruned: boolean;
  };
  tokenCounts: {
    allowed: number;
    messages: number;
    prompt: number;
    remaining: number;
    safetyMargin: number;
    toolDefinitionsAdjusted: number;
    toolDefinitionsRaw: number;
    total: number;
  };
};
