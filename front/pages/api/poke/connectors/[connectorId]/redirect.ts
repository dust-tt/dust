import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

interface GetConnectorRedirectResponse {
  redirectUrl: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetConnectorRedirectResponse>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const { connectorId } = req.query;
  if (!isString(connectorId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid connector ID.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const cRes = await connectorsAPI.getConnector(connectorId);

      if (cRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "connector_not_found_error",
            message: "Connector not found.",
          },
        });
      }

      const connector = cRes.value;

      return res.status(200).json({
        redirectUrl: `/poke/${connector.workspaceId}/data_sources/${connector.dataSourceId}`,
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
