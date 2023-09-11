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
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { AgentConfigurationType } from "@app/types/assistant/agent";

export type GetAssistantResponseBody = {
  assistants: AgentConfigurationType[];
};
export type PostAssistantResponseBody = {
  assistant: AgentConfigurationType;
};

const PostAssistantResponseBodySchema = t.type({
  assistant: t.type({
    name: t.string,
    pictureUrl: t.string,
    action: t.type({
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
          unit: t.union([
            t.literal("hour"),
            t.literal("day"),
            t.literal("week"),
            t.literal("month"),
            t.literal("year"),
          ]),
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
    generation: t.type({
      prompt: t.string,
      model: t.type({
        providerId: t.string,
        modelId: t.string,
      }),
    }),
  }),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetAssistantResponseBody
    | PostAssistantResponseBody
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
      const assistants = await getAgentConfigurations(auth);
      return res.status(200).json({
        assistants,
      });
    case "POST":
      const bodyValidation = PostAssistantResponseBodySchema.decode(req.body);
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

      const { name, pictureUrl, action, generation } =
        bodyValidation.right.assistant;

      const generationConfig = await createAgentGenerationConfiguration(auth, {
        prompt: generation.prompt,
        model: {
          providerId: generation.model.providerId,
          modelId: generation.model.modelId,
        },
      });
      const actionConfig = await createAgentActionConfiguration(auth, {
        type: "retrieval_configuration",
        query: action.query,
        timeframe: action.timeframe,
        topK: action.topK,
        dataSources: action.dataSources,
      });
      const assistant = await createAgentConfiguration(auth, {
        name,
        pictureUrl,
        status: "active",
        generation: generationConfig,
        action: actionConfig,
      });

      return res.status(200).json({
        assistant,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
