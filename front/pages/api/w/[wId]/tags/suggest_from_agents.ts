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
import { getLargeWhitelistedModel, isAdmin, removeNulls } from "@app/types";

const DEFAULT_SUGGESTIONS = [
  "Writing",
  "Planning",
  "Sales",
  "Support",
  "Marketing",
  "Research",
  "Analysis",
  "Development",
  "Finance",
  "HR",
  "Operations",
  "Design",
  "Strategy",
  "Training",
  "Compliance",
  "Procurement",
  "Security",
  "Legal",
  "Quality",
  "Product",
];

const AppResponseSchema = t.type({
  suggestions: t.union([
    t.array(
      t.type({
        name: t.string,
        agentIds: t.array(t.string),
      })
    ),
    t.null,
    t.undefined,
  ]),
});

const GetSuggestionsResponseBodySchema = t.type({
  suggestions: t.union([
    t.array(
      t.type({
        name: t.string,
        agents: t.array(t.type({ sId: t.string, name: t.string })),
      })
    ),
    t.null,
    t.undefined,
  ]),
});

export type GetSuggestionsResponseBody = t.TypeOf<
  typeof GetSuggestionsResponseBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSuggestionsResponseBody>>,
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
    case "GET":
      const agents = await getAgentConfigurations({
        auth,
        agentsGetView: "list",
        variant: "extra_light",
      });

      const formattedAgents = agents
        .filter((a) => a.scope !== "global")
        .map(
          (a) =>
            `Identifier: ${a.sId}\nName: ${a.name}\nDescription: ${a.description?.substring(0, 200).replaceAll("\n", " ")}\nInstructions: ${a.instructions?.substring(0, 200).replaceAll("\n", " ")}`
        )
        .join("\n\n");

      if (formattedAgents.length === 0) {
        return res.status(200).json({
          suggestions: DEFAULT_SUGGESTIONS.map((s) => ({
            name: s,
            agents: [],
          })),
        });
      }

      const model = getLargeWhitelistedModel(owner);

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
        getDustProdActionRegistry()["tag-manager-initial-suggestions"].config
      );
      config.CREATE_SUGGESTIONS.provider_id = model.providerId;
      config.CREATE_SUGGESTIONS.model_id = model.modelId;

      const suggestionsResponse = await runAction(
        auth,
        "tag-manager-initial-suggestions",
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

      const responseValidation = AppResponseSchema.decode(
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

      const suggestions = responseValidation.right.suggestions?.map((s) => ({
        name: s.name,
        agents: removeNulls(
          s.agentIds.map((id) => agents.find((agent) => agent.sId === id))
        ),
      }));

      return res.status(200).json({ suggestions });
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

export default withSessionAuthenticationForWorkspace(handler);
