import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { LabsConnectionType } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<undefined>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to delete connection configurations.",
      },
    });
  }

  const connectionId = req.query.connectionId as LabsConnectionType;

  switch (req.method) {
    case "DELETE":
      const configuration =
        await LabsConnectionsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider: connectionId,
        });

      if (!configuration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The connection configuration was not found.",
          },
        });
      }

      const result = await configuration.delete(auth);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete connection configuration.",
          },
        });
      }

      res.status(200).json({
        error: {
          type: "internal_server_error",
          message: "",
        },
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
