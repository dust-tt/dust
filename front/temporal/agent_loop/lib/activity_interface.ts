import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import type { AuthenticatorType } from "@app/lib/auth";
import type { ModelId } from "@app/types";
import type { AgentActionsEvent } from "@app/types/assistant/agent";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";

export interface AgentLoopActivities {
  runModelActivity(args: {
    authType: AuthenticatorType;
    runAgentArgs: RunAgentArgs;
    runIds: string[];
    step: number;
    functionCallStepContentIds: Record<string, ModelId>;
    autoRetryCount?: number;
  }): Promise<{
    actions: AgentActionsEvent["actions"];
    runId: string;
    functionCallStepContentIds: Record<string, ModelId>;
  } | null>;

  runToolActivity(
    authType: AuthenticatorType,
    args: {
      runAgentArgs: RunAgentArgs;
      inputs: Record<string, string | boolean | number>;
      functionCallId: string;
      step: number;
      stepActionIndex: number;
      stepActions: ActionConfigurationType[];
      citationsRefsOffset: number;
      stepContentId?: ModelId;
    }
  ): Promise<{ citationsIncrement: number }>;
}
