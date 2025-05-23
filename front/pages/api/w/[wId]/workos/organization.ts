import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getWorkOS } from "@app/lib/api/workos";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const CreateWorkOSOrganizationBodySchema = t.type({});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ organizationId: string }>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can create WorkOS organizations.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = CreateWorkOSOrganizationBodySchema.decode(
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

      try {
        const workos = getWorkOS();
        const organization = await workos.organizations.createOrganization({
          name: `${owner.name} - ${owner.sId}`,
        });

        res.status(200).json({ organizationId: organization.id });
        return;
      } catch (error) {
        console.error("Failed to create WorkOS organization:", error);
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create WorkOS organization",
          },
        });
      }

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
