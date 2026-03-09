// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { withTokenAuthentication } from "@app/lib/api/auth_wrappers";
import { getUserWithWorkspaces } from "@app/lib/api/user";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { UserResource } from "@app/lib/resources/user_resource";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { MeResponseType } from "@dust-tt/client";
import type { NextApiResponse } from "next";

/**
 * @ignoreswagger
 * WIP, undocumented.
 * TODO(EXT): Document this endpoint.
 */

async function handler(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<MeResponseType>>,
  session: SessionWithUser
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const userResource = await UserResource.fetchByWorkOSUserId(
        session.user.workOSUserId
      );
      if (!userResource) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "user_not_found",
            message: "The user is not registered.",
          },
        });
      }

      const isFromExtension = req.headers["x-request-origin"] === "extension";
      const user = await getUserWithWorkspaces(userResource, isFromExtension);

      // Set selectedWorkspace from the organization in the bearer token.
      if (session.organizationId) {
        const workspace = user.workspaces.find(
          (w) => w.workOSOrganizationId === session.organizationId
        );
        user.selectedWorkspace = workspace?.sId;
      }

      return res.status(200).json({ user });
    }

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

export default withTokenAuthentication(handler);
