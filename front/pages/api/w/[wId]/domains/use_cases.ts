import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceDomainUseCaseResource } from "@app/lib/resources/workspace_domain_use_case_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  WithAPIErrorResponse,
  WorkspaceDomainUseCaseType,
} from "@app/types";
import {
  WORKSPACE_DOMAIN_USE_CASE_STATUSES,
  WORKSPACE_DOMAIN_USE_CASES,
} from "@app/types";

export interface GetDomainUseCasesResponseBody {
  useCases: WorkspaceDomainUseCaseType[];
  verifiedDomains: string[];
}

export interface PostDomainUseCaseResponseBody {
  useCase: WorkspaceDomainUseCaseType;
}

const WorkspaceDomainUseCaseSchema = t.keyof(
  Object.fromEntries(WORKSPACE_DOMAIN_USE_CASES.map((uc) => [uc, null])) as Record<
    (typeof WORKSPACE_DOMAIN_USE_CASES)[number],
    null
  >
);

const WorkspaceDomainUseCaseStatusSchema = t.keyof(
  Object.fromEntries(WORKSPACE_DOMAIN_USE_CASE_STATUSES.map((s) => [s, null])) as Record<
    (typeof WORKSPACE_DOMAIN_USE_CASE_STATUSES)[number],
    null
  >
);

const PostDomainUseCaseRequestBodySchema = t.type({
  domain: t.string,
  useCase: WorkspaceDomainUseCaseSchema,
  status: WorkspaceDomainUseCaseStatusSchema,
});

const DeleteDomainUseCaseRequestBodySchema = t.type({
  domain: t.string,
  useCase: WorkspaceDomainUseCaseSchema,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetDomainUseCasesResponseBody | PostDomainUseCaseResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can manage domain use cases.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET": {
      // Get all use cases for this workspace
      const useCases =
        await WorkspaceDomainUseCaseResource.listByWorkspace(workspace);

      // Get verified domains for reference
      const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
      const verifiedDomains = workspaceResource
        ? (await workspaceResource.getVerifiedDomains()).map((d) => d.domain)
        : [];

      return res.status(200).json({
        useCases: useCases.map((uc) => uc.toJSON()),
        verifiedDomains,
      });
    }

    case "POST": {
      // Create or update a use case for a domain
      const bodyValidation = PostDomainUseCaseRequestBodySchema.decode(
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

      const { domain, useCase, status } = bodyValidation.right;

      // Validate: cannot enable a use case for a non-verified domain
      // (unless status is "pending")
      if (status === "enabled") {
        const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
        const verifiedDomains = workspaceResource
          ? (await workspaceResource.getVerifiedDomains()).map((d) =>
              d.domain.toLowerCase()
            )
          : [];

        if (!verifiedDomains.includes(domain.toLowerCase())) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Cannot enable use case for non-verified domain: ${domain}`,
            },
          });
        }
      }

      const useCaseResource = await WorkspaceDomainUseCaseResource.upsert(
        workspace,
        {
          domain,
          useCase,
          status,
        }
      );

      return res.status(200).json({
        useCase: useCaseResource.toJSON(),
      });
    }

    case "DELETE": {
      // Delete a use case for a domain
      const bodyValidation = DeleteDomainUseCaseRequestBodySchema.decode(
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

      const { domain, useCase } = bodyValidation.right;

      const result = await WorkspaceDomainUseCaseResource.updateStatus(
        workspace,
        {
          domain,
          useCase,
          status: "disabled",
        }
      );

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST, or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
