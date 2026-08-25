import type {
  ConversationRenderingInput,
  RenderConversationForModelResult,
} from "@app/lib/api/assistant/conversation_rendering/conversation_window_core";
import type { AgentLoopRuntimeData } from "@app/types/assistant/agent_run";
import type { Result } from "@app/types/shared/result";

export type AgentLoopModelContext = RenderConversationForModelResult & {
  missingActionCatcherFunctionCallIds: string[];
};

export type AgentLoopContextProvider = {
  runtimeData: AgentLoopRuntimeData;
  render: (
    input: ConversationRenderingInput
  ) => Promise<Result<AgentLoopModelContext, Error>>;
};
