import type {
  SupportedEnterpriseConnectionStrategies,
  WithAPIErrorResponse,
  WorkspaceEnterpriseConnection,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  createEnterpriseConnection,
  deleteEnterpriseConnection,
  getEnterpriseConnectionForWorkspace,
} from "@app/lib/api/enterprise_connection";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Workspace, WorkspaceHasDomain } from "@app/lib/models/workspace";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetEnterpriseConnectionResponseBody = {
  connection: WorkspaceEnterpriseConnection;
};

const PostCreateEnterpriseConnectionRequestBodySchema = t.type({
  clientId: t.string,
  clientSecret: t.string,
  domain: t.string,
  // SAML creation is not supported yet.
  strategy: t.union([t.literal("okta"), t.literal("waad")]),
});

export type PostCreateEnterpriseConnectionRequestBodySchemaType = t.TypeOf<
  typeof PostCreateEnterpriseConnectionRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetEnterpriseConnectionResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can modify it.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  const workspace = await Workspace.findOne({
    where: { id: owner.id },
  });
  if (!workspace) {
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
      const enterpriseConnection =
        await getEnterpriseConnectionForWorkspace(auth);
      if (enterpriseConnection) {
        return res.status(200).json({
          connection: {
            name: enterpriseConnection.name,
            strategy:
              enterpriseConnection.strategy as SupportedEnterpriseConnectionStrategies,
          },
        });
      }
      break;

    case "DELETE":
      try {
        await deleteEnterpriseConnection(auth);

        res.status(204).end();
        return;
      } catch (err) {
        logger.info(
          {
            workspaceId: workspace.sId,
            err,
          },
          "Failed to delete enterprise connection."
        );

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to delete enterprise connection.",
          },
        });
      }

    case "POST":
      const bodyValidation =
        PostCreateEnterpriseConnectionRequestBodySchema.decode(req.body);
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
      const { right: body } = bodyValidation;

      const workspaceWithVerifiedDomain = await WorkspaceHasDomain.findOne({
        where: {
          workspaceId: workspace.id,
        },
      });

      if (!workspaceWithVerifiedDomain) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Cannot create connection: workspace domain not verified. Verify domain and retry.",
          },
        });
      }

      try {
        await createEnterpriseConnection(
          auth,
          workspaceWithVerifiedDomain.domain,
          body
        );
      } catch (err) {
        logger.info(
          {
            workspaceId: workspace.sId,
            err,
          },
          "Failed to create enterprise connection."
        );

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to create enterprise connection.",
          },
        });
      }

      res.status(201).end();
      return;

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
