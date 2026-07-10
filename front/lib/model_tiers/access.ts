import type { Authenticator } from "@app/lib/auth";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import type { GenericErrorContent } from "@app/types/assistant/agent";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getMinimumReasoningEffort } from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export const MODEL_TIER_NOT_ENABLED_ERROR_CODE = "model_tier_not_enabled";

export function buildModelTierAccessDeniedError(
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
    featureFlags,
  }: {
    agentName: string;
    model: ModelConfigurationType;
    reasoningEffort?: ReasoningEffort;
    featureFlags: WhitelistableFeature[];
  }
): Promise<GenericErrorContent | null> {
  if (!featureFlags.includes("models_picker")) {
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
