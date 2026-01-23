import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getWorkspaceTagSuggestions } from "@app/lib/api/assistant/tag_manager";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isAdmin, removeNulls } from "@app/types";

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      const agents = await getAgentConfigurationsForView({
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

      const suggestionsResponse = await getWorkspaceTagSuggestions(auth, {
        formattedAgents,
      });

      if (suggestionsResponse.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: suggestionsResponse.error.message,
          },
        });
      }

      const suggestions = suggestionsResponse.value.suggestions?.map((s) => ({
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
