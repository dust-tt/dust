import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import type { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { validateResponseFormat } from "@app/types/assistant/models/utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Each agent goes through a full save (new version + its actions and skills recreated), so keep
// the parallelism low: enough to keep a large selection responsive, not enough to flood the
// connection pool.
const UPDATE_MODEL_CONCURRENCY = 4;

type UpdateAgentConfigurationsModelResult = {
  updatedAgentIds: string[];
  skippedAgentIds: string[];
};

/**
 * Sets the model of several agents at once. Like saving an agent from the builder with another
 * model selected, each agent gets a new version of its configuration; everything else (name,
 * instructions, tools, skills, tags, editors) is carried over untouched.
 *
 * Not atomic: agents that cannot be upgraded (archived, global, not editable by the caller) are
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
): Promise<Result<UpdateAgentConfigurationsModelResult, Error>> {
  if (agentIds.length === 0) {
    return new Ok({ updatedAgentIds: [], skippedAgentIds: [] });
  }

  // Only models the caller could pick in the agent builder can be set: this accounts for
  // workspace availability (providers, feature flags, plan) and model tiers.
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

  if (responseFormat) {
    const formatValidation = validateResponseFormat(responseFormat);
    if (!formatValidation.isValid) {
      return new Err(
        new Error(`Invalid response format: ${formatValidation.errorMessage}`)
      );
    }
  }

  const results = await concurrentExecutor(
    agentIds,
    async (agentId) => {
      const res = await upgradeAgentConfigurationModel(auth, {
        agentId,
        model,
        reasoningEffort: effort,
        responseFormat,
      });

      if (res.isErr()) {
        logger.warn(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            agentConfigurationId: agentId,
            modelId: model.modelId,
            error: res.error,
          },
          "Skipped agent while setting the model on a batch of agents"
        );
      }

      return { agentId, isUpdated: res.isOk() };
    },
    { concurrency: UPDATE_MODEL_CONCURRENCY }
  );

  return new Ok({
    updatedAgentIds: results.filter((r) => r.isUpdated).map((r) => r.agentId),
    skippedAgentIds: results.filter((r) => !r.isUpdated).map((r) => r.agentId),
  });
}

async function upgradeAgentConfigurationModel(
  auth: Authenticator,
  {
    agentId,
    model,
    reasoningEffort,
    responseFormat,
  }: {
    agentId: string;
    model: EnabledModelConfigurationType;
    reasoningEffort: ReasoningEffort;
    responseFormat?: string;
  }
): Promise<Result<void, Error>> {
  // Admins may batch-update the model of any agent of the workspace, including the ones built on
  // spaces they cannot read (the manage agents page lists those behind "Show hidden agents").
  // A model change re-saves the whole configuration, so the agent's spaces and skills have to be
  // resolved and kept as they are: dropping them would unrestrict the agent and strip its skills.
  // Nothing the spaces protect is exposed to the caller.
  const dangerouslySkipPermissionFiltering = auth.isAdmin();

  // Resolves the current configuration along with its editors and skills, and rejects agents
  // that cannot be re-saved as-is (archived, global).
  const contextResult = await getAgentConfigurationContext(auth, agentId, {
    requireEditorGroup: true,
    dangerouslySkipPermissionFiltering,
  });
  if (contextResult.isErr()) {
    return new Err(new Error(contextResult.error.api_error.message));
  }

  const { agentConfiguration, editorUsers, skills } = contextResult.value;

  if (!agentConfiguration.canEdit && !auth.isAdmin()) {
    return new Err(new Error("Agent is not editable by the caller."));
  }

  const res = await createOrUpgradeAgentConfiguration({
    auth,
    agentConfigurationId: agentConfiguration.sId,
    assistant: {
      name: agentConfiguration.name,
      description: agentConfiguration.description,
      instructions: agentConfiguration.instructions,
      instructionsHtml: agentConfiguration.instructionsHtml,
      pictureUrl: agentConfiguration.pictureUrl,
      status: agentConfiguration.status,
      scope: agentConfiguration.scope,
      model: {
        ...agentConfiguration.model,
        providerId: model.providerId,
        modelId: model.modelId,
        reasoningEffort,
        ...(responseFormat !== undefined && { responseFormat }),
      },
      actions: agentConfiguration.actions.filter(
        isServerSideMCPServerConfiguration
      ),
      templateId: agentConfiguration.templateId,
      tags: agentConfiguration.tags,
      editors: editorUsers.map((user) => ({ sId: user.sId })),
      skills: skills.map((skill) => ({ sId: skill.sId })),
      additionalRequestedSpaceIds: agentConfiguration.requestedSpaceIds,
    },
    dangerouslySkipPermissionFiltering,
  });
  if (res.isErr()) {
    return res;
  }

  return new Ok(undefined);
}
