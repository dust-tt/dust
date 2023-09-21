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
import {
  isSupportedModel,
  SupportedModel,
} from "@app/lib/api/assistant/generation";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { TimeframeUnitCodec } from "@app/types/assistant/actions/retrieval";
import {
  AgentActionConfigurationType,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
} from "@app/types/assistant/agent";

export type GetAgentConfigurationsResponseBody = {
  agentConfigurations: AgentConfigurationType[];
};
export type PostAgentConfigurationResponseBody = {
  agentConfiguration: AgentConfigurationType;
};

export const PostOrPatchAgentConfigurationRequestBodySchema = t.type({
  assistant: t.type({
    name: t.string,
    description: t.string,
    pictureUrl: t.string,
    status: t.union([t.literal("active"), t.literal("archived")]),
    action: t.union([
      t.null,
      t.type({
        type: t.literal("retrieval_configuration"),
        query: t.union([
          t.type({
            template: t.string,
          }),
          t.literal("auto"),
          t.literal("none"),
        ]),
        timeframe: t.union([
          t.literal("auto"),
          t.literal("none"),
          t.type({
            duration: t.number,
            unit: TimeframeUnitCodec,
          }),
        ]),
        topK: t.number,
        dataSources: t.array(
          t.type({
            dataSourceId: t.string,
            workspaceId: t.string,
            filter: t.type({
              tags: t.union([
                t.type({
                  in: t.array(t.string),
                  not: t.array(t.string),
                }),
                t.null,
              ]),
              parents: t.union([
                t.type({
                  in: t.array(t.string),
                  not: t.array(t.string),
                }),
                t.null,
              ]),
            }),
          })
        ),
      }),
    ]),
    generation: t.type({
      prompt: t.string,
      // enforce that the model is a supported model
      // the modelId and providerId are checked together, so
      // (gpt-4, anthropic) won't pass
      model: new t.Type<SupportedModel>(
        "SupportedModel",
        isSupportedModel,
        (i, c) => (isSupportedModel(i) ? t.success(i) : t.failure(i, c)),
        t.identity
      ),
      temperature: t.number,
    }),
  }),
});

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

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can access Assistants.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const agentConfigurations = await getAgentConfigurations(auth);
      return res.status(200).json({
        agentConfigurations,
      });
    case "POST":
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
    assistant: { generation, action, name, description, pictureUrl, status },
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
  if (action) {
    actionConfig = await createAgentActionConfiguration(auth, {
      type: "retrieval_configuration",
      query: action.query,
      timeframe: action.timeframe,
      topK: action.topK,
      dataSources: action.dataSources,
    });
  }

  return createAgentConfiguration(auth, {
    name,
    description,
    pictureUrl,
    status,
    generation: generationConfig,
    action: actionConfig,
    agentConfigurationId,
  });
}
