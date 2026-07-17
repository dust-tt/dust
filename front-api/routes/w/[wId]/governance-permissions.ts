import {
  getWorkspaceGovernancePermissions,
  setWorkspaceGovernancePermission,
} from "@app/lib/api/permissions/governance";
import type {
  GetGovernancePermissionsResponseBody,
  PatchGovernancePermissionResponseBody,
} from "@app/types/api/governance";
import {
  GRANT_TYPES,
  GROUP_PERMISSION_RESOURCE_TYPES,
} from "@app/types/group_permissions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBusinessAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// Mounted at /api/w/:wId/governance-permissions.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsBusinessAdmin(),
  async (ctx): HandlerResult<GetGovernancePermissionsResponseBody> => {
    const auth = ctx.get("auth");

    const governancePermissions = await getWorkspaceGovernancePermissions(auth);

    return ctx.json({ governancePermissions });
  }
);

const PatchGovernancePermissionRequestBodySchema = z.object({
  grantType: z.enum([...GRANT_TYPES]),
  resourceType: z.enum([...GROUP_PERMISSION_RESOURCE_TYPES]),
  configuration: z.discriminatedUnion("scope", [
    z.object({ scope: z.literal("everyone") }),
    z.object({ scope: z.literal("admins_only") }),
    z.object({ scope: z.literal("groups"), groupIds: z.array(z.string()) }),
  ]),
});

/** @ignoreswagger */
app.patch(
  "/",
  ensureIsBusinessAdmin(),
  validate("json", PatchGovernancePermissionRequestBodySchema),
  async (ctx): HandlerResult<PatchGovernancePermissionResponseBody> => {
    const auth = ctx.get("auth");

    const result = await setWorkspaceGovernancePermission(
      auth,
      ctx.req.valid("json")
    );

    if (result.isErr()) {
      switch (result.error.code) {
        case "capability_not_managed":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: result.error.message,
            },
          });
        case "invalid_groups":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        default:
          assertNever(result.error.code);
      }
    }

    return ctx.json({ governancePermission: result.value });
  }
);

export default app;
