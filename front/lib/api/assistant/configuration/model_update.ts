import type { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import type { BulkAgentUpdateResult } from "@app/lib/resources/agent_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { validateResponseFormat } from "@app/types/assistant/models/utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Validates a model change against live state and resolves the model fields to write. Only models
 * the caller could pick in the agent builder are accepted: this accounts for workspace availability
 * (providers, feature flags, plan) and model tiers.
 */
export async function resolveAgentModelChange(
  auth: Authenticator,
  {
    modelId,
    reasoningEffort,
  }: {
    modelId: string;
    reasoningEffort?: ReasoningEffort;
  }
): Promise<
  Result<
    Pick<
      AgentModelConfigurationType,
      "providerId" | "modelId" | "reasoningEffort"
    >,
    Error
  >
> {
  const { models } = await getModelsForAuth(auth);
  const model = models.find((m) => m.modelId === modelId);
  if (!model || !model.isSelectable) {
    return new Err(
      new Error(`Model "${modelId}" is not available in this workspace.`)
    );
  }

  const effort = reasoningEffort ?? model.defaultReasoningEffort;
  if (!model.supportedReasoningEfforts[effort]) {
    return new Err(
      new Error(
        `Model "${modelId}" does not support the "${effort}" reasoning effort.`
      )
    );
  }

  return new Ok({
    providerId: model.providerId,
    modelId: model.modelId,
    reasoningEffort: effort,
  });
}

/**
 * Sets the model of several agents at once. Like saving an agent from the builder with another model
 * selected, each agent gets a new configuration version; everything else (name, instructions, tools,
 * skills, tags, editors, requested spaces, and each agent's own temperature) is carried over
 * untouched. Validation of the model happens here; the versioned save is done by
 * `AgentResource.bulkUpdate`.
 *
 * Not atomic: agents that cannot be edited (archived, global, or not editable by the caller) are
 * skipped and reported back rather than failing the whole batch.
 *
 * `reasoningEffort` defaults to the model's own default and `responseFormat` is left untouched
 * when not provided.
 */
export async function updateAgentConfigurationsModel(
  auth: Authenticator,
  {
    agentIds,
    modelId,
    reasoningEffort,
    responseFormat,
  }: {
    agentIds: string[];
    modelId: string;
    reasoningEffort?: ReasoningEffort;
    responseFormat?: string;
  }
): Promise<Result<BulkAgentUpdateResult, Error>> {
  if (agentIds.length === 0) {
    return new Ok({ updatedAgentIds: [], skippedAgentIds: [] });
  }

  const modelRes = await resolveAgentModelChange(auth, {
    modelId,
    reasoningEffort,
  });
  if (modelRes.isErr()) {
    return modelRes;
  }

  if (responseFormat) {
    const formatValidation = validateResponseFormat(responseFormat);
    if (!formatValidation.isValid) {
      return new Err(
        new Error(`Invalid response format: ${formatValidation.errorMessage}`)
      );
    }
  }

  // Only the model changes; `bulkUpdate` merges these fields into each agent's current model
  // (preserving e.g. its temperature) and creates a new version per agent. `responseFormat` is
  // included only when set, so an unspecified value leaves the current one untouched.
  const {
    providerId,
    modelId: resolvedModelId,
    reasoningEffort: resolvedReasoningEffort,
  } = modelRes.value;
  const result = await AgentResource.bulkUpdate(auth, agentIds, {
    model: {
      providerId,
      modelId: resolvedModelId,
      reasoningEffort: resolvedReasoningEffort,
      ...(responseFormat !== undefined ? { responseFormat } : {}),
    },
  });

  return new Ok(result);
}
