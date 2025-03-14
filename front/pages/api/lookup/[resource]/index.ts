import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import {
  handleLookupWorkspace,
  lookupUserRegionByEmail,
} from "@app/lib/api/regions/lookup";
import { getBearerToken } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

export type WorkspaceLookupResponse = {
  workspace: {
    sId: string;
  } | null;
};

export type UserLookupResponse = {
  exists: boolean;
};

const ExternalUserCodec = t.type({
  email: t.string,
  email_verified: t.boolean,
});

type LookupResponseBody = UserLookupResponse | WorkspaceLookupResponse;

const UserLookupSchema = t.type({
  user: ExternalUserCodec,
});

const WorkspaceLookupSchema = t.type({
  workspace: t.string,
});

export type UserLookupRequestBodyType = t.TypeOf<typeof UserLookupSchema>;

export type WorkspaceLookupRequestBodyType = t.TypeOf<
  typeof WorkspaceLookupSchema
>;

const ResourceType = t.union([t.literal("user"), t.literal("workspace")]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<LookupResponseBody>>
): Promise<void> {
  const { resource } = req.query;

  if (typeof resource !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST requests are supported",
      },
    });
  }

  const bearerTokenRes = await getBearerToken(req);
  if (bearerTokenRes.isErr()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The request does not have valid authentication credentials",
      },
    });
  }

  if (bearerTokenRes.value !== config.getRegionResolverSecret()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_basic_authorization_error",
        message: "Invalid token",
      },
    });
  }

  const resourceValidation = ResourceType.decode(resource);
  if (isLeft(resourceValidation)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid resource type. Must be 'user' or 'workspace'",
      },
    });
  }

  let response: LookupResponseBody | null = null;
  switch (resourceValidation.right) {
    case "user":
      {
        const bodyValidation = UserLookupSchema.decode(req.body);
        if (isLeft(bodyValidation)) {
          const pathError = reporter.formatValidationErrors(
            bodyValidation.left
          );
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body for user lookup: ${pathError}`,
            },
          });
        }
        response = {
          exists: await lookupUserRegionByEmail(bodyValidation.right.user),
        };
      }
      break;

    case "workspace":
      {
        const bodyValidation = WorkspaceLookupSchema.decode(req.body);
        if (isLeft(bodyValidation)) {
          const pathError = reporter.formatValidationErrors(
            bodyValidation.left
          );
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body for user lookup ${pathError}`,
            },
          });
        }
        response = await handleLookupWorkspace(bodyValidation.right);
      }
      break;

    default:
      assertNever(resourceValidation.right);
  }

  res.status(200).json(response);
  return;
}

export default withLogging(handler);
