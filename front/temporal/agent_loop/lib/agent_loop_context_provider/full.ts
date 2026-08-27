import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import type { Authenticator } from "@app/lib/auth";
import {
  getMissingActionCatcherFunctionCallIds,
  prepareRuntimeData,
} from "@app/temporal/agent_loop/lib/agent_loop_context_provider/shared";
import type { AgentLoopContextProvider } from "@app/temporal/agent_loop/lib/agent_loop_context_provider/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getFullAgentLoopDataWithAuth } from "@app/types/assistant/agent_run";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export async function prepareFullContextProvider(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  step: number
): Promise<Result<AgentLoopContextProvider, Error>> {
  const data = await getFullAgentLoopDataWithAuth(auth, agentLoopArgs);
  if (data.isErr()) {
    return data;
  }

  const { conversation, runtimeData } = prepareRuntimeData(data.value, step);
  const missingActionCatcherFunctionCallIds =
    getMissingActionCatcherFunctionCallIds(conversation);

  return new Ok({
    runtimeData,
    render: async (input) => {
      const result = await renderConversationForModel(auth, {
        ...input,
        conversation,
      });
      if (result.isErr()) {
        return result;
      }

      return new Ok({
        ...result.value,
        missingActionCatcherFunctionCallIds,
      });
    },
  });
}
