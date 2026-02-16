import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeListSuggestions = {
  suggestions: AgentSuggestionType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListSuggestions>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, aId } = req.query;
  if (typeof wId !== "string" || typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();
  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "Could not find agent configuration.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(auth, aId);

      return res.status(200).json({
        suggestions: suggestions.map((s) => s.toJSON()),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
