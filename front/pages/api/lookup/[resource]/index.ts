// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import config from "@app/lib/api/config";
import {
  handleLookupInvitations,
  handleLookupWorkspace,
  hasEmailLocalRegionAffinity,
} from "@app/lib/api/regions/lookup";
import { getBearerToken } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type WorkspaceLookupResponse = {
  workspace: {
    sId: string;
  } | null;
};

export type UserLookupResponse = {
  exists: boolean;
};

export type InvitationsLookupResponse = {
  pendingInvitations: PendingInvitationOption[];
};

export type ShareTokenLookupResponse = {
  exists: boolean;
};

const ExternalUserCodec = z.object({
  email: z.string(),
  email_verified: z.boolean(),
});

type LookupResponseBody =
  | UserLookupResponse
  | WorkspaceLookupResponse
  | InvitationsLookupResponse
  | ShareTokenLookupResponse;

const UserLookupSchema = z.object({
  user: ExternalUserCodec,
});

const WorkspaceLookupSchema = z.object({
  workspace: z.string(),
});

const InvitationsLookupSchema = z.object({
  email: z.string(),
});

const ShareTokenLookupSchema = z.object({
  token: z.string(),
});

export type UserLookupRequestBodyType = z.infer<typeof UserLookupSchema>;

export type WorkspaceLookupRequestBodyType = z.infer<
  typeof WorkspaceLookupSchema
>;

export type InvitationsLookupRequestBodyType = z.infer<
  typeof InvitationsLookupSchema
>;

export type ShareTokenLookupRequestBodyType = z.infer<
  typeof ShareTokenLookupSchema
>;

const ResourceType = z.enum([
  "user",
  "workspace",
  "invitations",
  "share-token",
]);

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

  const bearerTokenRes = await getBearerToken(req.headers.authorization);
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

  const resourceValidation = ResourceType.safeParse(resource);
  if (!resourceValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid resource type. Must be 'user', 'workspace', 'invitations', or 'share-token'",
      },
    });
  }

  const validatedResource = resourceValidation.data;
  let response: LookupResponseBody | null = null;
  switch (validatedResource) {
    case "user":
      {
        const bodyValidation = UserLookupSchema.safeParse(req.body);
        if (!bodyValidation.success) {
          const pathError = fromError(bodyValidation.error).toString();
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body for user lookup: ${pathError}`,
            },
          });
        }
        response = {
          exists: await hasEmailLocalRegionAffinity(bodyValidation.data.user),
        };
      }
      break;

    case "workspace":
      {
        const bodyValidation = WorkspaceLookupSchema.safeParse(req.body);
        if (!bodyValidation.success) {
          const pathError = fromError(bodyValidation.error).toString();
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body for user lookup ${pathError}`,
            },
          });
        }
        response = await handleLookupWorkspace(bodyValidation.data);
      }
      break;

    case "invitations":
      {
        const bodyValidation = InvitationsLookupSchema.safeParse(req.body);
        if (!bodyValidation.success) {
          const pathError = fromError(bodyValidation.error).toString();
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body for invitations lookup: ${pathError}`,
            },
          });
        }
        response = await handleLookupInvitations(bodyValidation.data.email);
      }
      break;

    case "share-token":
      {
        const bodyValidation = ShareTokenLookupSchema.safeParse(req.body);
        if (!bodyValidation.success) {
          const pathError = fromError(bodyValidation.error).toString();
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body for share-token lookup: ${pathError}`,
            },
          });
        }
        const result = await FileResource.fetchByShareToken(
          bodyValidation.data.token
        );
        response = { exists: result.isOk() };
      }
      break;

    default:
      assertNever(validatedResource);
  }

  res.status(200).json(response);
  return;
}

export default withLogging(handler);
