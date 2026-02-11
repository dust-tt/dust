import type { Organization } from "@workos-inc/node";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  generateWorkOSAdminPortalUrl,
  getOrCreateWorkOSOrganization,
} from "@app/lib/api/workos/organization";
import { removeWorkOSOrganizationDomain } from "@app/lib/api/workos/organization_primitives";
import type { Authenticator } from "@app/lib/auth";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

export interface GetWorkspaceDomainsResponseBody {
  addDomainLink?: string;
  domains: Organization["domains"];
}

const DeleteWorkspaceDomainRequestBodySchema = t.type({
  domain: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceDomainsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can list domains.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      // If the workspace doesn't have a WorkOS organization (which can happen for workspaces
      // created via admin tools), we create one before fetching domains. This ensures the
      // endpoint works for all workspaces, regardless of how they were created.
      const organizationRes = await getOrCreateWorkOSOrganization(
        auth.getNonNullableWorkspace()
      );

      if (organizationRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get WorkOS organization",
          },
        });
      }

      // If there is no organization, return an empty array.
      if (!organizationRes.value) {
        return res.status(200).json({
          domains: [],
        });
      }

      const { link } = await generateWorkOSAdminPortalUrl({
        organization: organizationRes.value.id,
        workOSIntent: WorkOSPortalIntent.DomainVerification,
        returnUrl: `${req.headers.origin}/w/${auth.getNonNullableWorkspace().sId}/members`,
      });

      return res.status(200).json({
        addDomainLink: link,
        domains: organizationRes.value.domains,
      });

    case "DELETE":
      const bodyValidation = DeleteWorkspaceDomainRequestBodySchema.decode(
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
      const { right: body } = bodyValidation;

      const removeDomainRes = await removeWorkOSOrganizationDomain(
        auth.getNonNullableWorkspace(),
        { domain: body.domain }
      );

      if (removeDomainRes.isErr()) {
        logger.error(
          {
            error: removeDomainRes.error,
            domain: body.domain,
          },
          "Failed to remove WorkOS organization domain"
        );

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to remove WorkOS organization domain",
          },
        });
      }

      res.status(204).end();
      break;

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
