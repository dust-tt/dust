import {
  getDegradedModelIds,
  refreshDegradedModelIds,
} from "@app/lib/api/assistant/degraded_models";
import { PREFERRED_LARGE_MODEL_CONFIGS } from "@app/lib/api/assistant/model_preferences";
import { selectEnabledModel } from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getAgentAllowedTierNamesOverride } from "@app/lib/model_tiers/agent_tier_overrides";
import {
  getEnabledModelsForAuth,
  resolveStreamModel,
} from "@app/lib/model_tiers/enabled_models";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { NOOP_MODEL_ID } from "@app/types/assistant/models/noop";
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
    await refreshDegradedModelIds();
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

/**
 * Resolves the model configuration an agent message runs with: the agent's configured model
 * (temperature, response format, etc.) overridden by the model resolved for the message.
 *
 * Legacy messages have no stored resolution; when the agent is on a model stream, the stream is
 * resolved now. Global agents may pin the noop model at run time (static replies from the dust and
 * sidekick agents, see `getStaticReplyForUserMessage`); the model stored on the message was
 * resolved without that context, so it must not override the noop pin.
 */
export async function resolveAgentMessageModelConfig(
  auth: Authenticator,
  {
    agentConfiguration,
    agentMessage,
  }: {
    agentConfiguration: AgentConfigurationType;
    agentMessage: Pick<AgentMessageType, "resolvedModel">;
  }
): Promise<AgentModelConfigurationType> {
  const { model } = agentConfiguration;

  let { resolvedModel } = agentMessage;
  if (!resolvedModel && isModelStreamId(model.modelId)) {
    ({ resolvedModel } = await resolveModel(auth, {
      configuration: agentConfiguration,
      featureFlags: await getFeatureFlags(auth),
    }));
  }

  const isNoopPinnedModel = model.modelId === NOOP_MODEL_ID;

  return {
    ...model,
    ...(isNoopPinnedModel ? null : resolvedModel),
  };
}
