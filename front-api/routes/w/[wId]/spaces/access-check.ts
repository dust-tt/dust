import { listUsersWithoutAccessToSpaces } from "@app/lib/api/spaces/access";
import type { GetSpacesAccessCheckResponseBody } from "@app/types/api/spaces";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// Mounted under /api/w/:wId/spaces/access-check.
const app = workspaceApp();

const MAX_IDS = 100;

const idsSchema = z.union([z.string(), z.array(z.string())]);

const GetSpacesAccessCheckQuerySchema = z.object({
  spaceIds: idsSchema,
  userIds: idsSchema,
});

function toUniqueIds(ids: string | string[]): string[] {
  return [...new Set(Array.isArray(ids) ? ids : [ids])].filter(Boolean);
}

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetSpacesAccessCheckQuerySchema),
  async (ctx): HandlerResult<GetSpacesAccessCheckResponseBody> => {
    const auth = ctx.get("auth");
    const query = ctx.req.valid("query");

    const spaceIds = toUniqueIds(query.spaceIds);
    const userIds = toUniqueIds(query.userIds);

    if (spaceIds.length === 0 || userIds.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The query parameters `spaceIds` and `userIds` must each hold at least one id.",
        },
      });
    }

    if (spaceIds.length > MAX_IDS || userIds.length > MAX_IDS) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Too many ids provided. Maximum is ${MAX_IDS} per parameter.`,
        },
      });
    }

    const result = await listUsersWithoutAccessToSpaces(auth, {
      spaceIds,
      userIds,
    });

    if (result.isErr()) {
      const { type, spaceIds: erroredSpaceIds } = result.error;
      switch (type) {
        case "space_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "space_not_found",
              message: `Space not found: ${erroredSpaceIds.join(", ")}.`,
            },
          });
        case "space_unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: `You do not have access to the requested space: ${erroredSpaceIds.join(", ")}.`,
            },
          });
        default:
          assertNever(type);
      }
    }

    return ctx.json({ spacesAccess: result.value });
  }
);

export default app;
