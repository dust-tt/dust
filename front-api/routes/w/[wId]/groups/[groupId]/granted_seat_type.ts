import type { BulkSeatChangePreview } from "@app/lib/api/credits/bulk_seat_change";
import { computeBulkSeatChangePreview } from "@app/lib/api/credits/bulk_seat_change";
import { hasFeatureFlag } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { PutGroupGrantedSeatTypeResponseBody } from "@app/types/api/groups/manage";
import {
  PostGroupGrantedSeatTypePreviewBodySchema,
  PutGroupGrantedSeatTypeBodySchema,
} from "@app/types/api/groups/manage";
import { isPaidSeatType } from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

type PostGroupGrantedSeatTypePreviewResponseBody = {
  preview: BulkSeatChangePreview;
};

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId/granted_seat_type.
const app = workspaceApp();

// Maps a group to a base billable seat type (workspace/pro/max) so its members
// inherit that seat, or clears the mapping with `grantedSeatType: null`. Admin
// only.
/** @ignoreswagger */
app.put(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  validate("json", PutGroupGrantedSeatTypeBodySchema),
  async (ctx): HandlerResult<PutGroupGrantedSeatTypeResponseBody> => {
    const auth = ctx.get("auth");

    if (!(await hasFeatureFlag(auth, "group_seat_provisioning"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "The group_seat_provisioning feature is not enabled.",
        },
      });
    }

    const { groupId } = ctx.req.valid("param");
    const { grantedSeatType } = ctx.req.valid("json");

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      switch (groupRes.error.code) {
        case "invalid_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: groupRes.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: groupRes.error.message,
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: groupRes.error.message,
            },
          });
        default:
          assertNever(groupRes.error.code);
      }
    }

    const group = groupRes.value;

    const setRes = await group.setGrantedSeatType(auth, grantedSeatType);
    if (setRes.isErr()) {
      switch (setRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: setRes.error.message,
            },
          });
        case "invalid_group_kind":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: setRes.error.message,
            },
          });
        default:
          assertNever(setRes.error.code);
      }
    }

    return ctx.json({
      group: await group.toJSONWithMemberCount(auth),
    });
  }
);

// Previews mapping this group to a seat: reports how many of the group's members
// would actually move to that seat (highest-wins, so members already on a higher
// seat via another group are excluded) and the cost, reusing the bulk seat-change
// preview. Admin only, gated behind the feature flag.
/** @ignoreswagger */
app.post(
  "/preview",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  validate("json", PostGroupGrantedSeatTypePreviewBodySchema),
  async (ctx): HandlerResult<PostGroupGrantedSeatTypePreviewResponseBody> => {
    const auth = ctx.get("auth");

    if (!(await hasFeatureFlag(auth, "group_seat_provisioning"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "The group_seat_provisioning feature is not enabled.",
        },
      });
    }

    const { groupId } = ctx.req.valid("param");
    const { grantedSeatType } = ctx.req.valid("json");

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      switch (groupRes.error.code) {
        case "invalid_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: groupRes.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: groupRes.error.message,
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: groupRes.error.message,
            },
          });
        default:
          assertNever(groupRes.error.code);
      }
    }

    const group = groupRes.value;
    // `targetSeatType` is the seat the contract bills for this tier (monthly
    // preferred); `members` are only those who'd actually move to it.
    const { members, targetSeatType } =
      await group.listMembersMovedByGrantingSeat(auth, grantedSeatType);
    if (targetSeatType === null || !isPaidSeatType(targetSeatType)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The workspace contract does not bill this seat tier.",
        },
      });
    }

    const previewRes = await computeBulkSeatChangePreview(auth, {
      userIds: members.map((m) => m.sId),
      targetSeatType,
    });
    if (previewRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Could not compute the seat-change preview: ${previewRes.error.type}`,
        },
      });
    }

    return ctx.json({ preview: previewRes.value });
  }
);

export default app;
