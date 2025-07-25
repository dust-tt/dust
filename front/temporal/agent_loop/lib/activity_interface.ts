import type { StepContext } from "@app/lib/actions/types";
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
    citationsRefsOffset: number;
    autoRetryCount?: number;
  }): Promise<{
    actions: AgentActionsEvent["actions"];
    runId: string;
    functionCallStepContentIds: Record<string, ModelId>;
    stepContexts: StepContext[];
    totalCitationsIncrement: number;
  } | null>;

  runToolActivity(
    authType: AuthenticatorType,
    args: {
      runAgentArgs: RunAgentArgs;
      inputs: Record<string, string | boolean | number>;
      functionCallId: string;
      step: number;
      action: ActionConfigurationType;
      stepContext: StepContext;
      stepContentId: ModelId;
    }
  ): Promise<void>;
}
