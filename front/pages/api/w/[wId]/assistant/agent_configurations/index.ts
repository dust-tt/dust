import {
  AgentActionConfigurationType,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
  GetAgentConfigurationsQuerySchema,
  PostOrPatchAgentConfigurationRequestBodySchema,
} from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  createAgentActionConfiguration,
  createAgentConfiguration,
  createAgentGenerationConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetAgentConfigurationsResponseBody = {
  agentConfigurations: AgentConfigurationType[];
};
export type PostAgentConfigurationResponseBody = {
  agentConfiguration: AgentConfigurationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetAgentConfigurationsResponseBody
    | PostAgentConfigurationResponseBody
    | ReturnedAPIErrorType
    | void
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
      const queryValidation = GetAgentConfigurationsQuerySchema.decode(
        req.query
      );
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

      const { view, conversationId } = queryValidation.right;
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
      const agentConfigurations = await getAgentConfigurations(auth, viewParam);
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

      const agentConfiguration = await createOrUpgradeAgentConfiguration(
        auth,
        bodyValidation.right
      );

      return res.status(200).json({
        agentConfiguration: agentConfiguration,
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
 * Create Or Upgrade Agent Configuration
 * If an agentConfigurationId is provided, it will create a new version of the agent configuration
 * with the same agentConfigurationId.
 * If no agentConfigurationId is provided, it will create a new agent configuration.
 * In both cases, it will return the new agent configuration.
 **/
export async function createOrUpgradeAgentConfiguration(
  auth: Authenticator,
  {
    assistant: {
      generation,
      action,
      name,
      description,
      scope,
      pictureUrl,
      status,
    },
  }: t.TypeOf<typeof PostOrPatchAgentConfigurationRequestBodySchema>,
  agentConfigurationId?: string
): Promise<AgentConfigurationType> {
  let generationConfig: AgentGenerationConfigurationType | null = null;
  if (generation)
    generationConfig = await createAgentGenerationConfiguration(auth, {
      prompt: generation.prompt,
      model: generation.model,
      temperature: generation.temperature,
    });

  let actionConfig: AgentActionConfigurationType | null = null;
  if (action && action.type === "retrieval_configuration") {
    actionConfig = await createAgentActionConfiguration(auth, {
      type: "retrieval_configuration",
      query: action.query,
      relativeTimeFrame: action.relativeTimeFrame,
      topK: action.topK,
      dataSources: action.dataSources,
    });
  }
  if (action && action.type === "dust_app_run_configuration") {
    actionConfig = await createAgentActionConfiguration(auth, {
      type: "dust_app_run_configuration",
      appWorkspaceId: action.appWorkspaceId,
      appId: action.appId,
    });
  }
  if (action && action.type === "database_query_configuration") {
    actionConfig = await createAgentActionConfiguration(auth, {
      type: "database_query_configuration",
      dataSourceWorkspaceId: action.dataSourceWorkspaceId,
      dataSourceId: action.dataSourceId,
      databaseId: action.databaseId,
    });
  }

  return createAgentConfiguration(auth, {
    name,
    description,
    pictureUrl,
    status,
    scope,
    generation: generationConfig,
    action: actionConfig,
    agentConfigurationId,
  });
}
