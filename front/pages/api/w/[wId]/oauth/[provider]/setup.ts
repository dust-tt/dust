import { isLeft } from "fp-ts/lib/Either";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { ExtraConfigType, WithAPIErrorResponse } from "@app/types";
import {
  ExtraConfigTypeSchema,
  isOAuthProvider,
  isOAuthUseCase,
  isString,
} from "@app/types";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

export interface GetOAuthSetupResponseBody {
  redirectUrl: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetOAuthSetupResponseBody>>,
  auth: Authenticator,
  _session: SessionWithUser
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { provider, useCase, extraConfig, openerOrigin } = req.query;

  if (!isOAuthProvider(provider)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid OAuth provider.",
      },
    });
  }

  if (!isOAuthUseCase(useCase)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid OAuth use case.",
      },
    });
  }

  let parsedExtraConfig: ExtraConfigType = {};
  if (isString(extraConfig)) {
    const parseRes = safeParseJSON(extraConfig);
    if (parseRes.isErr()) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid extraConfig JSON.",
        },
      });
    }
    const bodyValidation = ExtraConfigTypeSchema.decode(parseRes.value);
    if (isLeft(bodyValidation)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid extraConfig format.",
        },
      });
    }
    parsedExtraConfig = bodyValidation.right;
  }

  const urlRes = await createConnectionAndGetSetupUrl(
    auth,
    provider,
    useCase,
    parsedExtraConfig,
    isString(openerOrigin) ? openerOrigin : undefined
  );

  if (!urlRes.isOk()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: urlRes.error.message,
      },
    });
  }

  return res.status(200).json({ redirectUrl: urlRes.value });
}

export default withSessionAuthenticationForWorkspace(handler);
