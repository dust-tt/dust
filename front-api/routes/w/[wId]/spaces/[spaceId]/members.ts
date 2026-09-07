import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  PatchSpaceMembersRequestBodySchema,
  PostSpaceMembersRequestBodySchema,
} from "@app/lib/api/spaces/members";
import type { Authenticator } from "@app/lib/auth";
import { notifyPodMembersAdded } from "@app/lib/notifications/workflows/pod-added-as-member";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import { auditLog } from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import type { Context } from "hono";

export type {
  PatchSpaceMembersRequestBodyType,
  PostSpaceMembersRequestBodyType,
} from "@app/lib/api/spaces/members";

// Mounted at /api/w/:wId/spaces/:spaceId/members.
const app = workspaceApp();

// Members can only be administrated on regular spaces and projects, by their administrators.
function membersAdministrationError(
  ctx: Context,
  auth: Authenticator,
  space: SpaceResource
) {
  if (!space.isRegular() && !space.isProject()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only projects and regular spaces can have members.",
      },
    });
  }

  if (!auth.can("admin", space)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only users that are `admins` can administrate space members.",
      },
    });
  }

  return null;
}

type MembersMutationErrorCode =
  | "unauthorized"
  | "user_not_found"
  | "user_not_member"
  | "group_not_found"
  | "user_already_member"
  | "invalid_id"
  | "group_requirements_not_met"
  | "invalid_group_kind"
  | "system_or_global_group";

// Maps the error codes of the space membership mutations to API errors. POST only produces a
// subset of PATCH's codes; both go through the same mapping.
function membersMutationError(ctx: Context, code: MembersMutationErrorCode) {
  switch (code) {
    case "unauthorized":
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` can administrate space members.",
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
    case "user_not_member":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The user is not a member of the workspace.",
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
    case "user_already_member":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The user is already a member of the space.",
        },
      });
    case "invalid_id":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Some of the passed ids are invalid.",
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
    case "invalid_group_kind":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Only provisioned and manual groups can be given access to a space.",
        },
      });
    case "system_or_global_group":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Users cannot be added to or removed from system or global groups.",
        },
      });
    default:
      assertNever(code);
  }
}

// Shared by every members mutation: a security log entry when the acting admin is not a member of
// the space, plus the WorkOS audit event with the mutation-specific metadata.
function emitSpacePermissionsUpdatedAuditLogs(
  auth: Authenticator,
  space: SpaceResource,
  metadata: Record<string, string>
) {
  if (!auth.can("read", space)) {
    const user = auth.user();
    auditLog(
      {
        author: user ? user.toJSON() : "no-author",
        workspaceId: auth.getNonNullableWorkspace().sId,
        spaceId: space.sId,
        spaceName: space.name,
        action: "space_permissions_updated_by_non_member",
      },
      "[Security] Admin updated space permissions without being a member"
    );
  }

  void emitAuditLogEvent({
    auth,
    action: "space.permissions_updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("space", space),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      space_name: space.name,
      ...metadata,
    },
  });
}

/** @ignoreswagger */
app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PatchSpaceMembersRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const guardError = membersAdministrationError(ctx, auth, space);
    if (guardError) {
      return guardError;
    }

    const body = ctx.req.valid("json");
    const owner = auth.getNonNullableWorkspace();

    if (
      space.isProject() &&
      !body.isRestricted &&
      !areOpenPodsAllowed(owner) &&
      (await space.isRestricted(auth))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message:
            "Open projects are disabled by your workspace admin. Keep this project private.",
        },
      });
    }

    // Track current members before update to identify newly added ones.
    let currentMemberIds: Set<string> | undefined;
    if (space.isProject() && body.managementMode === "manual") {
      const memberGroup = await space.fetchManualMemberGroup(auth);
      const currentMembers = await memberGroup.getActiveMembers(auth);
      currentMemberIds = new Set(currentMembers.map((m) => m.sId));
    }

    const updateRes = await space.updatePermissions(auth, body);
    if (updateRes.isErr()) {
      return membersMutationError(ctx, updateRes.error.code);
    }

    emitSpacePermissionsUpdatedAuditLogs(auth, space, {
      management_mode: body.managementMode,
      is_restricted: String(body.isRestricted),
      ...(body.managementMode === "manual"
        ? {
            member_ids: body.memberIds.join(","),
            editor_ids: body.editorIds.join(","),
          }
        : {
            group_ids: body.groupIds.join(","),
            editor_group_ids: body.editorGroupIds.join(","),
          }),
    });

    // Trigger notifications for newly added members (projects only).
    if (
      space.isProject() &&
      body.managementMode === "manual" &&
      currentMemberIds
    ) {
      const newlyAddedUserIds = body.memberIds.filter(
        (id) => !currentMemberIds.has(id)
      );
      if (newlyAddedUserIds.length > 0) {
        notifyPodMembersAdded(auth, {
          pod: space.toJSON(),
          addedUserIds: newlyAddedUserIds,
        });
      }
    }

    return ctx.json({ space: space.toJSON() });
  }
);

// Adds members to a manually managed space without touching the rest of its membership, unlike
// PATCH which replaces the whole member list.
/** @ignoreswagger */
app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostSpaceMembersRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const guardError = membersAdministrationError(ctx, auth, space);
    if (guardError) {
      return guardError;
    }

    if (space.managementMode !== "manual") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The members of this space are managed by groups. Add users to one of its groups instead.",
        },
      });
    }

    const { memberIds } = ctx.req.valid("json");

    const addRes = await space.addMembers(auth, { userIds: memberIds });
    if (addRes.isErr()) {
      return membersMutationError(ctx, addRes.error.code);
    }

    emitSpacePermissionsUpdatedAuditLogs(auth, space, {
      management_mode: "manual",
      is_restricted: String(await space.isRestricted(auth)),
      member_ids: addRes.value.map((user) => user.sId).join(","),
    });

    // Trigger notifications for newly added members (projects only).
    if (space.isProject() && addRes.value.length > 0) {
      notifyPodMembersAdded(auth, {
        pod: space.toJSON(),
        addedUserIds: addRes.value.map((user) => user.sId),
      });
    }

    // The group membership cache is invalidated asynchronously by the add. Callers (an admin
    // joining a space to read an agent) refetch right after the response, so wait for it here, as
    // the join route does.
    const workspace = auth.getNonNullableWorkspace();
    await GroupResource.batchInvalidateGroupIdsCacheForUsers(
      addRes.value.map((user) => [
        { user: { id: user.id }, workspace: { id: workspace.id } },
      ])
    );

    return ctx.json({ space: space.toJSON() });
  }
);

export default app;
