import { notifyProjectMembersAdded } from "@app/lib/notifications/workflows/project-added-as-member";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  GetSpaceMembersResponseBody,
  PostSpaceMembersResponseBody,
} from "@dust-tt/client";
import { PostSpaceMembersRequestBodySchema } from "@dust-tt/client";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { createMiddleware } from "hono/factory";
import uniqBy from "lodash/uniqBy";
import { z } from "zod";

import userId from "./[userId]";

const ParamsSchema = z.object({
  spaceId: z.string(),
});

type MembersCtx = PublicApiCtx & {
  Variables: {
    space: SpaceResource;
  };
};

/**
 * Fetches the space named by `:spaceId`, validates it exists and is editable
 * (not managed by provisioned groups, no global group). Used by GET and POST
 * below to dedupe the space lookup that the Next handler had inline.
 *
 * Reads `spaceId` from `ctx.req.valid("param")`, so a `validate("param", ...)`
 * with a schema containing `spaceId` must precede it in the handler chain.
 */
const withEditableSpace = createMiddleware<
  MembersCtx,
  string,
  {
    out: { param: z.infer<typeof ParamsSchema> };
  }
>(async (ctx, next) => {
  const auth = ctx.get("auth");
  const { spaceId } = ctx.req.valid("param");

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

  ctx.set("space", space);
  await next();
});

/**
 * @ignoreswagger
 * Admin-only endpoint. Undocumented.
 */
// Mounted at /api/v1/w/:wId/spaces/:spaceId/members.
const app = publicApiApp();

app.get(
  "/",
  ensureIsAdmin(),
  validate("param", ParamsSchema),
  withEditableSpace,
  async (ctx): HandlerResult<GetSpaceMembersResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const currentMembers = uniqBy(
      (
        await concurrentExecutor(
          space.groups,
          (group) => group.getActiveMembers(auth),
          { concurrency: 1 }
        )
      ).flat(),
      "sId"
    );

    return ctx.json({
      users: currentMembers.map((member) => ({
        sId: member.sId,
        email: member.email,
      })),
    });
  }
);

app.post(
  "/",
  ensureIsAdmin(),
  validate("param", ParamsSchema),
  validate("json", PostSpaceMembersRequestBodySchema),
  withEditableSpace,
  async (ctx): HandlerResult<PostSpaceMembersResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const { userIds } = ctx.req.valid("json");

    const updateRes = await space.addMembers(auth, {
      userIds,
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
        case "user_already_member":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message: "The user is already a member of the space.",
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
        case "group_requirements_not_met":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Some users have insufficient role privilege to be added to the space.",
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

    const usersJson = updateRes.value.map((user) => user.toJSON());

    // Trigger notifications for newly added members (projects only).
    if (space.isProject()) {
      notifyProjectMembersAdded(auth, {
        project: space.toJSON(),
        addedUserIds: userIds,
      });
    }

    return ctx.json({
      space: space.toJSON(),
      users: usersJson.map((userJson) => ({
        sId: userJson.sId,
        id: userJson.id,
        email: userJson.email,
      })),
    });
  }
);

app.route("/:userId", userId);

export default app;
