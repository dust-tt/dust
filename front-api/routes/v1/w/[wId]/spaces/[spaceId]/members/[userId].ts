/* eslint-disable dust/enforce-client-types-in-public-api */
// This endpoint only returns void as it is used only for deletion, so no need to use @dust-tt/client types.

import { SpaceResource } from "@app/lib/resources/space_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  spaceId: z.string(),
  userId: z.string(),
});

/**
 * @ignoreswagger
 * Admin-only endpoint. Undocumented.
 */
// Mounted at /api/v1/w/:wId/spaces/:spaceId/members/:userId.
const app = publicApiApp();

app.delete(
  "/",
  ensureIsAdmin(),
  validate("param", ParamsSchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const { spaceId, userId } = ctx.req.valid("param");

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space was not found.",
        },
      });
    }

    if (
      space.managementMode === "group" ||
      space.groups.some((g) => g.kind === "global")
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message:
            space.managementMode === "group"
              ? "Space is managed by provisioned group access, members can't be edited by API."
              : "Non-restricted space's members can't be edited.",
        },
      });
    }

    const updateRes = await space.removeMembers(auth, {
      userIds: [userId],
    });
    if (updateRes.isErr()) {
      switch (updateRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: "You are not authorized to update the space.",
            },
          });
        case "user_not_member":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The user is not a member of the space.",
            },
          });
        case "user_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "user_not_found",
              message: "The user was not found in the workspace.",
            },
          });
        case "system_or_global_group":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Users cannot be removed from system or global groups.",
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: "The group was not found in the workspace.",
            },
          });
        default:
          assertNever(updateRes.error.code);
      }
    }

    return ctx.body(null, 200);
  }
);

export default app;
