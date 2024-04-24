import type {
  AgentActionConfigurationType,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
  LightAgentConfigurationType,
  Result,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import {
  assertNever,
  GetAgentConfigurationsQuerySchema,
  Ok,
  PostOrPatchAgentConfigurationRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import type * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentUsage } from "@app/lib/api/assistant/agent_usage";
import {
  createAgentActionConfiguration,
  createAgentConfiguration,
  createAgentGenerationConfiguration,
  getAgentConfigurations,
  unsafeHardDeleteAgentConfiguration,
} from "@app/lib/api/assistant/configuration";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { Authenticator, getSession } from "@app/lib/auth";
import { safeRedisClient } from "@app/lib/redis";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetAgentConfigurationsResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};
export type PostAgentConfigurationResponseBody = {
  agentConfiguration: LightAgentConfigurationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      | GetAgentConfigurationsResponseBody
      | PostAgentConfigurationResponseBody
      | void
    >
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      if (!auth.isUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only the workspace users can see Assistants.",
          },
        });
      }
      // extract the view from the query parameters
      const queryValidation = GetAgentConfigurationsQuerySchema.decode({
        ...req.query,
        limit:
          typeof req.query.limit === "string"
            ? parseInt(req.query.limit, 10)
            : undefined,
      });
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { view, conversationId, limit, withUsage, withAuthors, sort } =
        queryValidation.right;
      const viewParam = view
        ? view
        : conversationId
        ? { conversationId }
        : "all";
      if (viewParam === "admin_internal" && !auth.isDustSuperUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only Dust Super Users can see admin_internal agents.",
          },
        });
      }
      let agentConfigurations = await getAgentConfigurations({
        auth,
        agentsGetView: viewParam,
        variant: "light",
        limit,
        sort,
      });
      if (withUsage === "true") {
        agentConfigurations = await safeRedisClient(async (redis) => {
          return Promise.all(
            agentConfigurations.map(
              async (
                agentConfiguration
              ): Promise<LightAgentConfigurationType> => {
                return {
                  ...agentConfiguration,
                  usage: await getAgentUsage(auth, {
                    providedRedis: redis,
                    agentConfiguration,
                    workspaceId: owner.sId,
                  }),
                };
              }
            )
          );
        });
      }

      if (withAuthors === "true") {
        const recentAuthors = await getAgentsRecentAuthors({
          auth,
          agents: agentConfigurations,
        });
        agentConfigurations = await Promise.all(
          agentConfigurations.map(
            async (
              agentConfiguration,
              index
            ): Promise<LightAgentConfigurationType> => {
              return {
                ...agentConfiguration,
                lastAuthors: recentAuthors[index],
              };
            }
          )
        );
      }

      return res.status(200).json({
        agentConfigurations,
      });
    case "POST":
      if (!auth.isUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only users of the workspace can create assistants.",
          },
        });
      }

      const bodyValidation =
        PostOrPatchAgentConfigurationRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      if (
        bodyValidation.right.assistant.scope === "workspace" &&
        !auth.isBuilder()
      ) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only builders can create workspace assistants.",
          },
        });
      }

      const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
        auth,
        assistant: bodyValidation.right.assistant,
        legacySingleActionMode: true,
      });
      if (agentConfigurationRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: agentConfigurationRes.error.message,
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

export default withLogging(handler);

/**
 * Create Or Upgrade Agent Configuration If an agentConfigurationId is provided,
 * it will create a new version of the agent configuration with the same
 * agentConfigurationId. If no agentConfigurationId is provided, it will create
 * a new agent configuration. In both cases, it will return the new agent
 * configuration.
 **/
export async function createOrUpgradeAgentConfiguration({
  auth,
  assistant: {
    actions,
    generation,
    name,
    description,
    pictureUrl,
    status,
    scope,
    instructions,
  },
  agentConfigurationId,
  legacySingleActionMode,
}: {
  auth: Authenticator;
  assistant: t.TypeOf<
    typeof PostOrPatchAgentConfigurationRequestBodySchema
  >["assistant"];
  agentConfigurationId?: string;
  // TODO(@fontanierh): We'll remove this mode once we switch to multi-actions.
  // For now, this allows to keep the forceUseAtIteration backwards compatibility logic in a single place.
  legacySingleActionMode: boolean;
}): Promise<Result<AgentConfigurationType, Error>> {
  if (legacySingleActionMode && actions.length > 1) {
    throw new Error("Only one action is supported in legacy mode.");
  }

  let legacyForceGenerationAtIteration: number | null = null;
  let legacyForceSingleActionAtIteration: number | null = null;

  if (legacySingleActionMode) {
    if (actions.length) {
      if (actions[0].forceUseAtIteration || generation?.forceUseAtIteration) {
        throw new Error(
          "Explicit forceUseAtIteration is not supported in legacy mode."
        );
      }
      legacyForceSingleActionAtIteration = 0;
      legacyForceGenerationAtIteration = 1;
    } else {
      legacyForceGenerationAtIteration = 0;
    }
  }

  let generationConfig: AgentGenerationConfigurationType | null = null;

  // @todo FIX MULTI ACTIONS
  const maxToolsUsePerRun = actions.length + (generationConfig ? 1 : 0);

  const agentConfigurationRes = await createAgentConfiguration(auth, {
    name,
    description,
    instructions: instructions ?? null,
    maxToolsUsePerRun,
    pictureUrl,
    status,
    scope,
    generation: generationConfig,
    agentConfigurationId,
  });

  if (agentConfigurationRes.isErr()) {
    return agentConfigurationRes;
  }

  if (generation) {
    generationConfig = await createAgentGenerationConfiguration(auth, {
      prompt: instructions || "", // @todo Daph remove this field
      model: generation.model,
      temperature: generation.temperature,
      agentConfiguration: agentConfigurationRes.value,
      forceUseAtIteration:
        generation.forceUseAtIteration ?? legacyForceGenerationAtIteration,
    });
  }

  const actionConfigs: AgentActionConfigurationType[] = [];

  try {
    for (const action of actions) {
      if (action.type === "retrieval_configuration") {
        actionConfigs.push(
          await createAgentActionConfiguration(
            auth,
            {
              type: "retrieval_configuration",
              query: action.query,
              relativeTimeFrame: action.relativeTimeFrame,
              topK: action.topK,
              dataSources: action.dataSources,
              forceUseAtIteration:
                action.forceUseAtIteration ??
                legacyForceSingleActionAtIteration,
            },
            agentConfigurationRes.value
          )
        );
      } else if (action.type === "dust_app_run_configuration") {
        actionConfigs.push(
          await createAgentActionConfiguration(
            auth,
            {
              type: "dust_app_run_configuration",
              appWorkspaceId: action.appWorkspaceId,
              appId: action.appId,
              forceUseAtIteration:
                action.forceUseAtIteration ??
                legacyForceSingleActionAtIteration,
            },
            agentConfigurationRes.value
          )
        );
      } else if (action.type === "tables_query_configuration") {
        actionConfigs.push(
          await createAgentActionConfiguration(
            auth,
            {
              type: "tables_query_configuration",
              tables: action.tables,
              forceUseAtIteration:
                action.forceUseAtIteration ??
                legacyForceSingleActionAtIteration,
            },
            agentConfigurationRes.value
          )
        );
      } else if (action.type === "process_configuration") {
        actionConfigs.push(
          await createAgentActionConfiguration(
            auth,
            {
              type: "process_configuration",
              relativeTimeFrame: action.relativeTimeFrame,
              dataSources: action.dataSources,
              schema: action.schema,
              forceUseAtIteration:
                action.forceUseAtIteration ??
                legacyForceSingleActionAtIteration,
            },
            agentConfigurationRes.value
          )
        );
      } else {
        assertNever(action);
      }
    }
  } catch (e) {
    // If we fail to create an action, we should delete the agent configuration
    // we just created and re-throw the error.
    await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
    throw e;
  }

  const agentConfiguration: AgentConfigurationType = {
    ...agentConfigurationRes.value,
    actions: actionConfigs,
  };

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
