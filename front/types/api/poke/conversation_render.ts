import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { ConversationRenderDiagnostics } from "@app/types/assistant/conversation_rendering";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";

export type PostRenderConversationRequestBody = {
  agentId?: string;
  agentMessageId?: string;
  agentMessageVersion?: number;
  contextSizeOverride?: number | null;
  excludeActions?: boolean;
  excludeImages?: boolean;
  onMissingAction?: "inject-placeholder" | "skip";
  step?: number;
};

export type ConversationRenderReconstruction =
  | {
      agentId: string;
      agentMessageId: string;
      agentMessageVersion: number;
      caveats: string[];
      mode: "historical_step";
      step: number;
    }
  | {
      agentId: string;
      caveats: string[];
      mode: "live_preview";
      syntheticAgentMessageId: string;
    };

export type PostRenderConversationResponseBody = {
  diagnostics: ConversationRenderDiagnostics;
  model: {
    contextSize: number;
    generationTokensCount: number;
    modelId: string;
    providerId: string;
  };
  modelContextSizeUsed: number;
  modelConversation: ModelConversationTypeMultiActions;
  prompt: string;
  promptTokenCountApprox: number;
  prunedContext: boolean;
  reconstruction: ConversationRenderReconstruction;
  runtimeContext: {
    equippedSkillCount: number;
    systemSkillCount: number;
    toolSearchEnabled: boolean;
  };
  tokensUsed: number;
  toolDefinitionsInContext: unknown[];
  toolSpecifications: AgentActionSpecification[];
  toolsTokenCountApprox: number;
};
