import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

const PatchBodySchema = t.type({
  name: t.string,
  kind: t.union([t.literal("standard"), t.literal("protected")]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<Record<string, never>>>,
  auth: Authenticator
): Promise<void> {
  const {
    method,
    query: { tId },
  } = req;

  if (!isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Tag ID is required",
      },
    });
  }

  switch (method) {
    case "DELETE": {
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
            message: "Only workspace administrators can delete tags",
          },
        });
      }

      const tag = await TagResource.fetchById(auth, tId);

      if (!tag) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Tag not found",
          },
        });
      }

      const result = await tag.delete(auth);

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete tag",
          },
        });
      }

      res.status(204).end();
      return;
    }
    case "PUT": {
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
            message: "Only workspace administrators can update tags",
          },
        });
      }

      const tag = await TagResource.fetchById(auth, tId);

      if (!tag) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Tag not found",
          },
        });
      }

      const r = PatchBodySchema.decode(req.body);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }
      const body = r.right;
      const { name, kind } = body;

      await tag.updateTag({ name, kind });
      res.status(200).end();
      return;
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, DELETE or PATCH is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
