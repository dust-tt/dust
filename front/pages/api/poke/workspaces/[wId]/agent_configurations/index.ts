/** @ignoreswagger */
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAuthors } from "@app/lib/api/assistant/editors";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { UserType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type PokeAgentConfigurationType = LightAgentConfigurationType & {
  versionAuthor?: UserType | null;
};

export type PokeGetAgentConfigurationsResponseBody = {
  agentConfigurations: PokeAgentConfigurationType[];
};

const GetAgentConfigurationsQuerySchema = z.object({
  view: z.enum(["admin_internal", "archived"]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PokeGetAgentConfigurationsResponseBody | void>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();
  if (!owner || !auth.isDustSuperUser()) {
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
      const queryValidation = GetAgentConfigurationsQuerySchema.safeParse(
        req.query
      );
      if (!queryValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
          },
        });
      }

      const { view } = queryValidation.data;
      const viewParam = view;

      const agentConfigurations = await getAgentConfigurationsForView({
        auth,
        agentsGetView: viewParam,
        variant: "light",
        sort: viewParam === "archived" ? "updatedAt" : undefined,
        dangerouslySkipPermissionFiltering: true,
      });

      // Fetch authors and embed in each config
      const authors = await getAuthors(agentConfigurations);
      const authorMap = new Map(authors.map((a) => [a.id, a]));

      const agentsWithAuthors: PokeAgentConfigurationType[] =
        agentConfigurations.map((a) => ({
          ...a,
          versionAuthor: a.versionAuthorId
            ? (authorMap.get(a.versionAuthorId) ?? null)
            : null,
        }));

      return res.status(200).json({
        agentConfigurations: agentsWithAuthors,
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

export default withSessionAuthenticationForPoke(handler);
