import { getDegradedModelIds } from "@app/lib/api/assistant/degraded_models";
import { PREFERRED_LARGE_MODEL_CONFIGS } from "@app/lib/api/assistant/model_preferences";
import {
  getEffectiveWhiteListedProviders,
  selectEnabledModel,
} from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import { getAgentAllowedTierNamesOverride } from "@app/lib/model_tiers/agent_tier_overrides";
import {
  getEnabledModelsForAuth,
  resolveStreamModel,
} from "@app/lib/model_tiers/enabled_models";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { isModelStreamId } from "@app/types/assistant/models/auto";
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

  const requestedConfig = userConfig ?? agentConfig;

  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);

  let enabled =
    requestedConfig && isModelStreamId(requestedConfig.modelId)
      ? requestedConfig
      : selectEnabledModel(
          auth,
          removeNulls([
            userConfig,
            agentConfig,
            ...PREFERRED_LARGE_MODEL_CONFIGS,
          ]),
          {
            featureFlags,
            whiteListedProviders,
          }
        );

  // Effort chosen by a stream tier (Basic/Standard/Premium) for its resolved
  // model. When set, it takes precedence over any effort carried by the
  // (sentinel) selection.
  let streamEffort: ReasoningEffort | undefined;

  // `auto`, `auto_fast` and `auto_complex` are all streams: walk the stream's
  // ordered candidate pool and pick the first one available to the workspace.
  if (enabled && isModelStreamId(enabled.modelId)) {
    const streamId = enabled.modelId;
    const models = await getEnabledModelsForAuth(auth, {
      allowedTierNamesOverride: getAgentAllowedTierNamesOverride(
        configuration.sId
      ),
    });
    const resolution = resolveStreamModel(
      models,
      streamId,
      getDegradedModelIds()
    );
    enabled = resolution.model;

    if (resolution.fromPool) {
      streamEffort = resolution.reasoningEffort;
      modelResolutionMethod = streamId;
    }
    // Otherwise none of the stream's candidates were available and `enabled`
    // comes from the generic preferred-large-model fallback, not from the
    // stream: keep the original "user"/"agent" attribution so analytics don't
    // credit the pick to e.g. "auto_complex", and honor the requested effort.
  }

  // Should never happen as we should at least fallback to our selection of PREFERRED_LARGE_MODEL_CONFIGS.
  assert(enabled, "No enabled model found");

  // A stream tier dictates the effort of its resolved model. Otherwise honor the
  // selected or agent-configured effort only if the resolved model supports it
  // (raw API clients can send an unsupported effort); fall back to its default.
  const requestedReasoningEffort =
    streamEffort ??
    (selection
      ? selection.reasoningEffort
      : configuration.model.reasoningEffort);

  const effort =
    requestedReasoningEffort &&
    enabled.supportedReasoningEfforts[requestedReasoningEffort]
      ? requestedReasoningEffort
      : enabled.defaultReasoningEffort;

  return {
    resolvedModel: toResolvedModel(enabled, effort),
    modelResolutionMethod,
  };
}
