import { ConnectorProvider, ConnectorsAPI } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getSession } from "@app/lib/auth";
import { sendGithubDeletionEmail } from "@app/lib/email";
import { DataSource } from "@app/lib/models";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";

export type DeleteDataSourceResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DeleteDataSourceResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const user = auth.user();
  const owner = auth.workspace();

  if (!user || !owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "DELETE":
      const { wId } = req.query;
      if (!wId || typeof wId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request query is invalid, expects { workspaceId: string }.",
          },
        });
      }

      const dataSource = await DataSource.findOne({
        where: {
          workspaceId: owner.id,
          name: req.query.name as string,
        },
      });

      if (!dataSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "Could not find the data source.",
          },
        });
      }

      const dustAPIProjectId = dataSource.dustAPIProjectId;

      const connectorsAPI = new ConnectorsAPI(logger);
      if (dataSource.connectorId) {
        const connDeleteRes = await connectorsAPI.deleteConnector(
          dataSource.connectorId.toString(),
          true
        );
        if (connDeleteRes.isErr()) {
          // If we get a not found we proceed with the deletion of the data source. This will enable
          // us to retry deletion of the data source if it fails at the Core level.
          if (connDeleteRes.error.error.type !== "connector_not_found") {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Error deleting connector: ${connDeleteRes.error.error.message}`,
              },
            });
          }
        }
      }

      const coreAPI = new CoreAPI(logger);
      const coreDeleteRes = await coreAPI.deleteDataSource({
        projectId: dustAPIProjectId,
        dataSourceName: dataSource.name,
      });
      if (coreDeleteRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error deleting core data source: ${coreDeleteRes.error.message}`,
          },
        });
      }

      await dataSource.destroy();

      await launchScrubDataSourceWorkflow({
        wId: owner.sId,
        dustAPIProjectId,
      });

      if (dataSource.connectorProvider)
        await warnPostDeletion(auth, dataSource.connectorProvider);

      return res.status(200).json({ success: true });

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

async function warnPostDeletion(
  auth: Authenticator,
  dataSourceProvider: ConnectorProvider
) {
  // if the datasource is Github, send an email inviting to delete the Github app
  switch (dataSourceProvider) {
    case "github":
      // get admin emails
      const adminEmails = (await getMembers(auth, "admin")).map((u) => u.email);
      // send email to admins
      for (const email of adminEmails) await sendGithubDeletionEmail(email);
      break;
    default:
      break;
  }
}

export default withLogging(handler);
