/**
 * @swagger
 * /api/w/{wId}/assistant/agent_configurations:
 *   get:
 *     summary: List agent configurations
 *     description: Returns all agent configurations in the workspace.
 *     tags:
 *       - Private Agents
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: view
 *         required: false
 *         description: Filter agents by view
 *         schema:
 *           type: string
 *           enum: [all, list, favorites, published, admin_internal, global, workspace]
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Maximum number of results to return
 *         schema:
 *           type: integer
 *       - in: query
 *         name: withUsage
 *         required: false
 *         description: Include usage statistics
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: withAuthors
 *         required: false
 *         description: Include recent authors
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: withFeedbacks
 *         required: false
 *         description: Include feedback counts
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: withEditors
 *         required: false
 *         description: Include editors list
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: sort
 *         required: false
 *         description: Sort order
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfigurations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateLightAgentConfiguration'
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create an agent configuration
 *     description: Creates a new agent configuration in the workspace.
 *     tags:
 *       - Private Agents
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assistant
 *             properties:
 *               assistant:
 *                 type: object
 *                 description: Agent configuration to create
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfiguration:
 *                   $ref: '#/components/schemas/PrivateLightAgentConfiguration'
 *       401:
 *         description: Unauthorized
 */
import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import type {
  MCPServerConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import { pruneSuggestionsForAgent } from "@app/lib/api/assistant/agent_suggestion_pruning";
import { getAgentsUsage } from "@app/lib/api/assistant/agent_usage";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import {
  createAgentConfiguration,
  restoreAgentConfiguration,
  unsafeHardDeleteAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { PostOrPatchAgentConfigurationRequestBody } from "@app/types/api/internal/agent_configuration";
import {
  GetAgentConfigurationsQuerySchema,
  PostOrPatchAgentConfigurationRequestBodySchema,
} from "@app/types/api/internal/agent_configuration";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { LightAgentConfigurationSchema } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import keyBy from "lodash/keyBy";
import omit from "lodash/omit";
import uniq from "lodash/uniq";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export const GetAgentConfigurationsResponseBodySchema = z.object({
  agentConfigurations: z.array(LightAgentConfigurationSchema),
});
export type GetAgentConfigurationsResponseBody = z.infer<
  typeof GetAgentConfigurationsResponseBodySchema
>;

export const PostAgentConfigurationResponseBodySchema = z.object({
  agentConfiguration: LightAgentConfigurationSchema,
});
export type PostAgentConfigurationResponseBody = z.infer<
  typeof PostAgentConfigurationResponseBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetAgentConfigurationsResponseBody
      | PostAgentConfigurationResponseBody
      | void
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET":
      // extract the view from the query parameters
      const queryValidation = GetAgentConfigurationsQuerySchema.safeParse({
        ...req.query,
        limit:
          typeof req.query.limit === "string"
            ? parseInt(req.query.limit, 10)
            : undefined,
      });
      if (!queryValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${queryValidation.error.message}`,
          },
        });
      }

      const {
        view,
        limit,
        withUsage,
        withAuthors,
        withFeedbacks,
        withEditors,
        sort,
      } = queryValidation.data;
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      let viewParam = view ? view : "all";
      // @ts-expect-error: added for backwards compatibility
      viewParam = viewParam === "assistant-search" ? "list" : viewParam;
      if (viewParam === "admin_internal" && !auth.isDustSuperUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only Dust Super Users can see admin_internal agents.",
          },
        });
      }
      let agentConfigurations = await getAgentConfigurationsForView({
        auth,
        agentsGetView:
          viewParam === "workspace"
            ? "published" // workspace is deprecated, return all visible agents
            : viewParam,
        variant: "light",
        limit,
        sort,
      });
      if (withUsage === "true") {
        const mentionCounts = await runOnRedis(
          { origin: "agent_usage" },
          async (redis) => {
            return getAgentsUsage({
              providedRedis: redis,
              workspaceId: owner.sId,
              limit:
                typeof req.query.limit === "string"
                  ? parseInt(req.query.limit, 10)
                  : -1,
            });
          }
        );
        const usageMap = keyBy(mentionCounts, "agentId");
        agentConfigurations = agentConfigurations.map((agentConfiguration) =>
          usageMap[agentConfiguration.sId]
            ? {
                ...agentConfiguration,
                usage: omit(usageMap[agentConfiguration.sId], ["agentId"]),
              }
            : agentConfiguration
        );
      }
      if (withAuthors === "true") {
        const recentAuthors = await getAgentsRecentAuthors({
          auth,
          agents: agentConfigurations,
        });
        agentConfigurations = agentConfigurations.map(
          (agentConfiguration, index) => {
            return {
              ...agentConfiguration,
              lastAuthors: recentAuthors[index],
            };
          }
        );
      }

      if (withEditors === "true") {
        const editors = await getAgentsEditors(auth, agentConfigurations);
        agentConfigurations = agentConfigurations.map((agentConfiguration) => ({
          ...agentConfiguration,
          editors: editors[agentConfiguration.sId],
        }));
      }

      if (withFeedbacks === "true") {
        const feedbacks =
          await AgentMessageFeedbackResource.getFeedbackCountForAssistants(
            auth,
            agentConfigurations
              .filter((agent) => agent.scope !== "global")
              .map((agent) => agent.sId),
            30
          );
        agentConfigurations = agentConfigurations.map((agentConfiguration) => ({
          ...agentConfiguration,
          feedbacks: {
            up:
              feedbacks.find(
                (f) =>
                  f.agentConfigurationId === agentConfiguration.sId &&
                  f.thumbDirection === "up"
              )?.count ?? 0,
            down:
              feedbacks.find(
                (f) =>
                  f.agentConfigurationId === agentConfiguration.sId &&
                  f.thumbDirection === "down"
              )?.count ?? 0,
          },
        }));
      }

      return res.status(200).json({
        agentConfigurations,
      });
    case "POST":
      const isSaveAgentConfigurationsEnabled =
        await KillSwitchResource.isKillSwitchEnabled(
          "save_agent_configurations"
        );
      if (isSaveAgentConfigurationsEnabled) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "app_auth_error",
            message:
              "Saving agent configurations is temporarily disabled, try again later.",
          },
        });
      }
      const bodyValidation =
        PostOrPatchAgentConfigurationRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyValidation.error.message}`,
          },
        });
      }

      const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
        auth,
        assistant: bodyValidation.data.assistant,
      });

      if (agentConfigurationRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "assistant_saving_error",
            message: `Error saving agent: ${agentConfigurationRes.error.message}`,
          },
        });
      }

      return res.status(200).json({
        agentConfiguration: agentConfigurationRes.value,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET OR POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

/**
 * Create Or Upgrade Agent Configuration If an agentConfigurationId is provided, it will create a
 * new version of the agent configuration with the same agentConfigurationId. If no
 * agentConfigurationId is provided, it will create a new agent configuration. In both cases, it
 * will return the new agent configuration.
 **/
export async function createOrUpgradeAgentConfiguration({
  auth,
  assistant,
  agentConfigurationId,
  authorId,
}: {
  auth: Authenticator;
  assistant: PostOrPatchAgentConfigurationRequestBody["assistant"];
  agentConfigurationId?: string;
  authorId?: ModelId;
}): Promise<Result<AgentConfigurationType, Error>> {
  const { actions } = assistant;

  // Tools mode:
  // Enforce that every action has a name and a description and that every name is unique.
  if (actions.length > 1) {
    const actionsWithoutName = actions.filter((action) => !action.name);
    if (actionsWithoutName.length) {
      return new Err(
        Error(
          `Every action must have a name. Missing names for: ${actionsWithoutName
            .map((action) => action.type)
            .join(", ")}`
        )
      );
    }
    const actionNames = new Set<string>();
    for (const action of actions) {
      if (!action.name) {
        // To please the type system.
        throw new Error(`unreachable: action.name is required.`);
      }
      if (actionNames.has(action.name)) {
        return new Err(new Error(`Duplicate action name: ${action.name}`));
      }
      actionNames.add(action.name);
    }
    const actionsWithoutDesc = actions.filter((action) => !action.description);
    if (actionsWithoutDesc.length) {
      return new Err(
        Error(
          `Every action must have a description. Missing descriptions for: ${actionsWithoutDesc
            .map((action) => action.type)
            .join(", ")}`
        )
      );
    }
  }

  const editors = (
    await UserResource.fetchByIds(assistant.editors.map((e) => e.sId))
  ).map((e) => e.toJSON());

  let skills: SkillResource[] = [];
  if (assistant.skills && assistant.skills.length > 0) {
    skills = await SkillResource.fetchByIds(
      auth,
      assistant.skills.map((s) => s.sId)
    );
  }

  const requirements = await getAgentConfigurationRequirementsFromCapabilities(
    auth,
    {
      actions,
      skills,
    }
  );

  let allRequestedSpaceIds = requirements.requestedSpaceIds;

  // Collect additional requestedSpaceIds
  if (
    assistant.additionalRequestedSpaceIds &&
    assistant.additionalRequestedSpaceIds.length > 0
  ) {
    const additionalSpaces = await SpaceResource.fetchByIds(
      auth,
      assistant.additionalRequestedSpaceIds
    );

    // Validate that all requested spaces were found and user can read them
    const readableSpaceIds = new Set(
      additionalSpaces.filter((s) => s.canRead(auth)).map((s) => s.sId)
    );
    const inaccessibleSpaces = assistant.additionalRequestedSpaceIds.filter(
      (sId) => !readableSpaceIds.has(sId)
    );
    if (inaccessibleSpaces.length > 0) {
      return new Err(
        new Error(
          `User does not have access to the following spaces: ${inaccessibleSpaces.join(", ")}`
        )
      );
    }

    const additionalSpaceModelIds = removeNulls(
      additionalSpaces.map((s) => getResourceIdFromSId(s.sId))
    );

    allRequestedSpaceIds = uniq(
      allRequestedSpaceIds.concat(additionalSpaceModelIds)
    );
  }

  const resolvedAuthorId = authorId ?? auth.user()?.id;
  if (!resolvedAuthorId) {
    return new Err(
      new Error("An author must be provided when no user is authenticated.")
    );
  }

  const agentConfigurationRes = await createAgentConfiguration(auth, {
    name: assistant.name,
    description: assistant.description,
    instructions: assistant.instructions ?? null,
    instructionsHtml: assistant.instructionsHtml ?? null,
    pictureUrl: assistant.pictureUrl,
    status: assistant.status,
    scope: assistant.scope,
    model: assistant.model,
    agentConfigurationId,
    templateId: assistant.templateId ?? null,
    requestedSpaceIds: allRequestedSpaceIds,
    tags: assistant.tags,
    editors,
    authorId: resolvedAuthorId,
  });

  if (agentConfigurationRes.isErr()) {
    return agentConfigurationRes;
  }

  const actionConfigs: MCPServerConfigurationType[] = [];

  for (const action of actions) {
    const res = await createAgentActionConfiguration(
      auth,
      {
        type: "mcp_server_configuration",
        name: action.name,
        description: action.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
        mcpServerViewId: action.mcpServerViewId,
        dataSources: action.dataSources ?? null,
        tables: action.tables,
        childAgentId: action.childAgentId,
        additionalConfiguration: action.additionalConfiguration,
        dustAppConfiguration: action.dustAppConfiguration,
        secretName: action.secretName,
        timeFrame: action.timeFrame,
        jsonSchema: action.jsonSchema,
        dustProject: action.dustProject,
      } as ServerSideMCPServerConfigurationType,
      agentConfigurationRes.value
    );
    if (res.isErr()) {
      logger.error(
        {
          error: res.error,
          agentConfigurationId: agentConfigurationRes.value.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          mcpServerViewId: action.mcpServerViewId,
        },
        "Failed to create agent action configuration."
      );
      // If we fail to create an action, we should delete the agent configuration
      // we just created and re-throw the error.
      await unsafeHardDeleteAgentConfiguration(
        auth,
        agentConfigurationRes.value
      );
      // If we were upgrading an existing agent (i.e., creating a new
      // version for an existing `agentConfigurationId`), we archived the
      // previous version just before creating this one. Since creation of
      // an action failed and we are cleaning up the new version, restore
      // the previous version back to `active` status so the agent remains
      // available.
      if (agentConfigurationId) {
        const restoredResult = await restoreAgentConfiguration(
          auth,
          agentConfigurationRes.value.sId
        );
        if (restoredResult.isErr()) {
          logger.error(
            {
              error: restoredResult.error,
              workspaceId: auth.getNonNullableWorkspace().sId,
              agentConfigurationId: agentConfigurationRes.value.sId,
            },
            "Error while restoring previous agent version after rollback"
          );
        } else if (!restoredResult.value.restored) {
          logger.error(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              agentConfigurationId: agentConfigurationRes.value.sId,
            },
            "Failed to restore previous agent version after action creation error"
          );
        }
      }
      return res;
    }
    actionConfigs.push(res.value);
  }

  // Create skill associations
  const owner = auth.getNonNullableWorkspace();
  await concurrentExecutor(
    assistant.skills ?? [],
    async (skill) => {
      // Validate the skill exists and belongs to this workspace
      const skillResource = await SkillResource.fetchById(auth, skill.sId);
      if (!skillResource) {
        logger.warn(
          {
            workspaceId: owner.sId,
            agentConfigurationId: agentConfigurationRes.value.sId,
            skillSId: skill.sId,
          },
          "Skill not found when creating agent configuration, skipping"
        );
        return;
      }

      await skillResource.addToAgent(auth, agentConfigurationRes.value);
    },
    { concurrency: 10 }
  );

  const agentConfiguration: AgentConfigurationType = {
    ...agentConfigurationRes.value,
    instructionsHtml: assistant.instructionsHtml ?? null,
    actions: actionConfigs,
  };

  // Prune outdated suggestions after saving an existing agent.
  // This must happen after skills/tools are added to the new version.
  if (agentConfigurationId) {
    await pruneSuggestionsForAgent(auth, agentConfiguration);
  }

  // We are not tracking draft agents
  if (agentConfigurationRes.value.status === "active") {
    void ServerSideTracking.trackAssistantCreated({
      user: auth.user() ?? undefined,
      workspace: auth.workspace() ?? undefined,
      assistant: agentConfiguration,
    });
  }

  return new Ok(agentConfiguration);
}
