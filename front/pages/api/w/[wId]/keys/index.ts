import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { KeyType } from "@app/types/key";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

const MAX_API_KEY_CREATION_PER_DAY = 30;

export type GetKeysResponseBody = {
  keys: KeyType[];
};

export type PostKeysResponseBody = {
  key: KeyType;
};

const CreateKeyPostBodySchema = t.type({
  name: t.string,
  group_id: t.union([t.string, t.undefined]),
  monthly_cap_micro_usd: t.union([t.number, t.null, t.undefined]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetKeysResponseBody | PostKeysResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can interact with keys",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const keys = await KeyResource.listNonSystemKeysByWorkspace(owner);

      res.status(200).json({
        keys: keys.map((k) => k.toJSON()),
      });

      return;

    case "POST":
      const bodyValidation = CreateKeyPostBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const { name, group_id, monthly_cap_micro_usd } = bodyValidation.right;
      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "API key name cannot be empty.",
          },
        });
      }

      if (
        monthly_cap_micro_usd !== null &&
        monthly_cap_micro_usd !== undefined &&
        monthly_cap_micro_usd < 0
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "monthly_cap_micro_usd must be greater than or equal to 0",
          },
        });
      }

      const existingKey = await KeyResource.fetchByName(auth, {
        name: trimmedName,
        onlyActive: true,
      });
      if (existingKey) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "An API key with this name already exists in this workspace.",
          },
        });
      }

      const group = group_id
        ? await GroupResource.fetchById(auth, group_id)
        : await GroupResource.fetchWorkspaceGlobalGroup(auth);

      if (group.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "group_not_found",
            message: "Invalid group",
          },
        });
      }

      const rateLimitKey = `api_key_creation_${owner.sId}`;
      const remaining = await rateLimiter({
        key: rateLimitKey,
        maxPerTimeframe: MAX_API_KEY_CREATION_PER_DAY,
        timeframeSeconds: 24 * 60 * 60, // 1 day
        logger,
      });

      if (remaining === 0) {
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message:
              `You have reached the limit of ${MAX_API_KEY_CREATION_PER_DAY} API keys ` +
              "creations per day. Please try again later.",
          },
        });
      }

      const key = await KeyResource.makeNew(
        {
          name: trimmedName,
          status: "active",
          userId: user.id,
          workspaceId: owner.id,
          isSystem: false,
          role: "builder",
          monthlyCapMicroUsd: monthly_cap_micro_usd ?? null,
        },
        group.value
      );

      res.status(201).json({
        key: key.toJSON(),
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
