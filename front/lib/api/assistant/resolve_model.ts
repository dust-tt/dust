import { getAutoModelForAuth } from "@app/lib/advanced_models/enabled_models";
import { PREFERRED_LARGE_MODEL_CONFIGS } from "@app/lib/api/assistant/model_preferences";
import { selectEnabledModel } from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type {
  ModelConfigurationType,
  ModelResolutionMethodType,
  ModelSelectionType,
  ReasoningEffort,
  ResolvedRequestedModel,
} from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";

function toResolvedModel(
  config: ModelConfigurationType,
  reasoningEffort?: ReasoningEffort
): ResolvedRequestedModel {
  return {
    providerId: config.providerId,
    modelId: config.modelId,
    reasoningEffort: reasoningEffort ?? config.defaultReasoningEffort,
  };
}

// Resolves the model for an agent message according to these rules:
// 1. Pick the user's selection if it's part of their allowlist.
// 2. If the user did not select a model, pick the agent's configured model.
// 3. If the agent is set on auto mode, pick the auto model.
// 4. Finally fallback to a supported model by the workspace.
export async function resolveModel(
  auth: Authenticator,
  {
    selection,
    configuration,
    featureFlags,
  }: {
    selection?: ModelSelectionType;
    configuration: LightAgentConfigurationType;
    featureFlags: WhitelistableFeature[];
  }
): Promise<{
  resolvedModel: ResolvedRequestedModel;
  modelResolutionMethod: ModelResolutionMethodType;
}> {
  let modelResolutionMethod: ModelResolutionMethodType = selection
    ? "user"
    : "agent";
  const userConfig = selection
    ? SUPPORTED_MODEL_CONFIGS.find(
        (m) =>
          m.providerId === selection.providerId &&
          m.modelId === selection.modelId
      )
    : null;

  const agentConfig = SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.providerId === configuration.model.providerId &&
      m.modelId === configuration.model.modelId
  );

  let enabled = selectEnabledModel(
    auth,
    removeNulls([userConfig, agentConfig, ...PREFERRED_LARGE_MODEL_CONFIGS]),
    {
      featureFlags,
    }
  );

  if (enabled?.modelId === AUTO_MODEL_ID) {
    // Alternatively, we could remove the agent config from the list of candidates and let the auto model fallback to a supported model by the workspace.
    // However, to be future-proof, we keep do it here to allow evolution on the way the auto model is selected.
    enabled = await getAutoModelForAuth(auth);
    modelResolutionMethod = "auto";
  }

  // Should never happen as we should at least fallback to our selection of PREFERRED_LARGE_MODEL_CONFIGS.
  assert(enabled, "No enabled model found");

  // Honor an explicit effort only if the model supports it; otherwise fall back
  // to its default (raw API clients can send an unsupported effort).
  const effort =
    selection?.reasoningEffort &&
    enabled.supportedReasoningEfforts[selection.reasoningEffort]
      ? selection.reasoningEffort
      : enabled.defaultReasoningEffort;

  return {
    resolvedModel: toResolvedModel(enabled, effort),
    modelResolutionMethod,
  };
}
