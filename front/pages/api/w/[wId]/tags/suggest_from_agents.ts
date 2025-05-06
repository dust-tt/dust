import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { runAction } from "@app/lib/actions/server";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdActionRegistry } from "@app/lib/registry";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { getSmallWhitelistedModel, isAdmin } from "@app/types";

const SuggestionsResponseBodySchema = t.union([
  t.type({
    status: t.literal("ok"),
    suggestions: t.union([
      t.array(t.type({ name: t.string, agentIds: t.array(t.string) })),
      t.null,
      t.undefined,
    ]),
  }),
  t.type({
    status: t.literal("unavailable"),
    reason: t.union([
      t.literal("user_not_finished"), // The user has not finished inputing data for suggestions to make sense
      t.literal("irrelevant"),
    ]),
  }),
]);

export type SuggestionsType = t.TypeOf<typeof SuggestionsResponseBodySchema>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SuggestionsType>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (!isAdmin(owner)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "not_authenticated",
        message: "You are not authorized to access this resource.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const agents = await getAgentConfigurations({
        auth,
        agentsGetView: "list",
        variant: "extra_light",
      });

      const formattedAgents = agents.map((a) => ({
        id: a.sId,
        displayName: `@${a.name}`,
        description: a.description,
        instructions: a.instructions,
      }));

      const model = getSmallWhitelistedModel(owner);

      if (!model) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `No whitelisted models were found for the workspace.`,
          },
        });
      }

      const config = cloneBaseConfig(
        getDustProdActionRegistry()[
          "assistant-builder-initial-tags-suggestions"
        ].config
      );
      config.CREATE_SUGGESTIONS.provider_id = model.providerId;
      config.CREATE_SUGGESTIONS.model_id = model.modelId;

      const suggestionsResponse = await runAction(
        auth,
        `assistant-builder-initial-tags-suggestions`,
        config,
        [
          {
            agents: formattedAgents,
          },
        ]
      );

      if (suggestionsResponse.isErr() || !suggestionsResponse.value.results) {
        const message = suggestionsResponse.isErr()
          ? JSON.stringify(suggestionsResponse.error)
          : "No results available";
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message,
          },
        });
      }

      const responseValidation = SuggestionsResponseBodySchema.decode(
        suggestionsResponse.value.results[0][0].value
      );
      if (isLeft(responseValidation)) {
        const pathError = reporter.formatValidationErrors(
          responseValidation.left
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Invalid response from action: ${pathError}`,
          },
        });
      }
      const suggestions = responseValidation.right as {
        status: "ok";
        suggestions: { name: string; agentIds: string[] }[] | null | undefined;
      };

      return res.status(200).json(suggestions);

      console.log("suggest", suggestions);
      SuggestionsResponseBodySchema;
      return res.status(200).json(suggestions);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
