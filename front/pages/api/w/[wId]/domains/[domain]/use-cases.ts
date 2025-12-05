import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  addUseCaseToDomain,
  removeUseCaseFromDomain,
  updateDomainUseCases,
} from "@app/lib/api/workspace_domains";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse, WorkspaceDomain } from "@app/types";
import { DOMAIN_USE_CASES } from "@app/types/domain";
import type { DomainUseCase } from "@app/types/domain";

const DomainUseCaseCodec = t.keyof(
  DOMAIN_USE_CASES.reduce(
    (acc, uc) => {
      acc[uc] = null;
      return acc;
    },
    {} as Record<DomainUseCase, null>
  )
);

const PatchRequestBodySchema = t.type({
  action: t.union([t.literal("add"), t.literal("remove")]),
  useCase: DomainUseCaseCodec,
});

const PutRequestBodySchema = t.type({
  useCases: t.array(DomainUseCaseCodec),
});

export interface DomainUseCasesResponseBody {
  domain: WorkspaceDomain | null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DomainUseCasesResponseBody>>,
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

  const { domain } = req.query;
  if (typeof domain !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid domain parameter",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "PATCH": {
      // Add or remove a single use case.
      const bodyValidation = PatchRequestBodySchema.decode(req.body);
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

      const { action, useCase } = bodyValidation.right;

      const result =
        action === "add"
          ? await addUseCaseToDomain(workspace, { domain, useCase })
          : await removeUseCaseFromDomain(workspace, { domain, useCase });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: result.error.message,
          },
        });
      }

      return res.status(200).json({ domain: result.value });
    }

    case "PUT": {
      // Replace all use cases.
      const bodyValidation = PutRequestBodySchema.decode(req.body);
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

      const { useCases } = bodyValidation.right;

      const result = await updateDomainUseCases(workspace, {
        domain,
        useCases,
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: result.error.message,
          },
        });
      }

      return res.status(200).json({ domain: result.value });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH or PUT is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
