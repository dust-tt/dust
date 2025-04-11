import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { LabsConnectionType } from "@app/types";

const PatchLabsConnectionsConfigurationBodySchema = t.partial({
  dataSourceViewId: t.number,
  credentialId: t.string,
  connectionId: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<LabsConnectionsConfigurationResource | null>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to manage connection configurations.",
      },
    });
  }

  const connectionId = req.query.connectionId as LabsConnectionType;

  switch (req.method) {
    case "GET":
      const configuration =
        await LabsConnectionsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider: connectionId,
        });

      res.status(200).json(configuration);
      return;

    case "PATCH":
      const bodyValidation = PatchLabsConnectionsConfigurationBodySchema.decode(
        req.body
      );
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

      const patchConfiguration =
        await LabsConnectionsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider: connectionId,
        });

      if (!patchConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The connection configuration was not found.",
          },
        });
      }

      const validatedBody = bodyValidation.right;
      try {
        if (validatedBody.credentialId !== undefined) {
          await patchConfiguration.setCredentialId(validatedBody.credentialId);
        }
        if (validatedBody.connectionId !== undefined) {
          await patchConfiguration.setConnectionId(validatedBody.connectionId);
        }
        if (validatedBody.dataSourceViewId !== undefined) {
          await patchConfiguration.setDataSourceViewId(
            validatedBody.dataSourceViewId
          );
        }

        return res.status(200).json(patchConfiguration);
      } catch (err) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to update connection configuration.",
          },
        });
      }

    case "DELETE":
      const deleteConfiguration =
        await LabsConnectionsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider: connectionId,
        });

      if (!deleteConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The connection configuration was not found.",
          },
        });
      }

      const deleteResult = await deleteConfiguration.delete(auth);
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete connection configuration.",
          },
        });
      }

      res.status(200).json(null);
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
