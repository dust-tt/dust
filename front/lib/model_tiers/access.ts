import type { Authenticator } from "@app/lib/auth";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import type {
  AgentConfigurationScope,
  GenericErrorContent,
} from "@app/types/assistant/agent";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getMinimumReasoningEffort } from "@app/types/assistant/models/types";
import { areRestrictedModelsAllowedForPublishedAgents } from "@app/types/user";

const MODEL_TIER_NOT_ENABLED_ERROR_CODE = "model_tier_not_enabled";

function buildModelTierAccessDeniedError(
  agentName: string
): GenericErrorContent {
  return {
    code: MODEL_TIER_NOT_ENABLED_ERROR_CODE,
    message:
      `Assistant ${agentName} uses a model tier that is not enabled for you. ` +
      `Please contact your workspace admin or use another assistant.`,
    metadata: {
      errorTitle: "Model tier not enabled",
      category: "unknown_error",
    },
  };
}

export async function getModelTierAccessErrorForAgentConfiguration(
  auth: Authenticator,
  {
    agentName,
    model,
    reasoningEffort,
    agentScope,
  }: {
    agentName: string;
    model: ModelConfigurationType;
    reasoningEffort?: ReasoningEffort;
    agentScope?: AgentConfigurationScope;
  }
): Promise<GenericErrorContent | null> {
  // Model access tiers are only enforced while the model picker is enabled.
  // The picker can be turned off globally via a kill switch.
  if (
    await KillSwitchResource.isKillSwitchEnabled("global_disable_models_picker")
  ) {
    return null;
  }

  // Workspace admins can allow members to run published agents whose model
  // tier is above the member's own access.
  if (
    agentScope === "visible" &&
    areRestrictedModelsAllowedForPublishedAgents(auth.getNonNullableWorkspace())
  ) {
    return null;
  }

  const effectiveReasoningEffort =
    reasoningEffort ??
    getMinimumReasoningEffort(model.supportedReasoningEfforts);
  const tierName = ModelsTierResource.getTierForModel(
    model.modelId,
    effectiveReasoningEffort
  );

  if (!tierName) {
    return null;
  }

  const { tiers: allowedTierNames } =
    await ModelsTierResource.resolveAllowedTierNames(auth);

  if (allowedTierNames.includes(tierName)) {
    return null;
  }

  return buildModelTierAccessDeniedError(agentName);
}
