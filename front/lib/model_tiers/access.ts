import type { Authenticator } from "@app/lib/auth";
import { resolveAllowedTierNames } from "@app/lib/model_tiers/allowed_tiers";
import type {
  AgentConfigurationScope,
  GenericErrorContent,
} from "@app/types/assistant/agent";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import type {
  ModelConfigurationType,
  ModelResolutionMethodType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getMinimumReasoningEffort } from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
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
    featureFlags,
    agentScope,
    modelResolutionMethod,
  }: {
    agentName: string;
    model: ModelConfigurationType;
    reasoningEffort?: ReasoningEffort;
    featureFlags: WhitelistableFeature[];
    agentScope?: AgentConfigurationScope;
    modelResolutionMethod?: ModelResolutionMethodType | null;
  }
): Promise<GenericErrorContent | null> {
  if (!featureFlags.includes("models_picker")) {
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

  // A stream only ever resolves to a candidate within the member's cap, so the
  // resolved model can never reveal that the member was not allowed to run the
  // stream in the first place. Tier-check the stream itself instead: it is
  // tiered as the tier it is named after, at its only effort (`none`).
  const tierName =
    modelResolutionMethod && isModelStreamId(modelResolutionMethod)
      ? getTierForModel(modelResolutionMethod, "none")
      : getTierForModel(
          model.modelId,
          reasoningEffort ??
            getMinimumReasoningEffort(model.supportedReasoningEfforts)
        );

  if (!tierName) {
    return null;
  }

  const { tiers: allowedTierNames } = await resolveAllowedTierNames(auth);

  if (allowedTierNames.includes(tierName)) {
    return null;
  }

  return buildModelTierAccessDeniedError(agentName);
}
