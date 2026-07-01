import { advancedModelKey } from "@app/lib/advanced_models/resolve_allowed";
import type { Authenticator } from "@app/lib/auth";
import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import type { GenericErrorContent } from "@app/types/assistant/agent";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export const ADVANCED_MODEL_NOT_ENABLED_ERROR_CODE =
  "advanced_model_not_enabled";

export function buildAdvancedModelAccessDeniedError(
  agentName: string
): GenericErrorContent {
  return {
    code: ADVANCED_MODEL_NOT_ENABLED_ERROR_CODE,
    message:
      `Assistant ${agentName} uses an advanced model that is not enabled for you. ` +
      `Please contact your workspace admin or use another assistant.`,
    metadata: {
      errorTitle: "Advanced model not enabled",
      category: "unknown_error",
    },
  };
}

export async function getAdvancedModelAccessErrorForAgentConfiguration(
  auth: Authenticator,
  {
    agentName,
    model,
    featureFlags,
  }: {
    agentName: string;
    model: ModelConfigurationType;
    featureFlags: WhitelistableFeature[];
  }
): Promise<GenericErrorContent | null> {
  if (!featureFlags.includes("models_picker")) {
    return null;
  }

  if (!AdvancedModelResource.isAdvancedModel(model)) {
    return null;
  }

  const { models: allowedModels } =
    await AdvancedModelResource.resolveAllowedAdvancedModels(auth, {
      user: auth.user(),
    });
  const allowedModelKeys = new Set(allowedModels.map(advancedModelKey));
  const modelKey = advancedModelKey({
    providerId: model.providerId,
    modelId: model.modelId,
  });

  if (allowedModelKeys.has(modelKey)) {
    return null;
  }

  return buildAdvancedModelAccessDeniedError(agentName);
}
