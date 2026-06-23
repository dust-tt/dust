import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import type { UpgradeRequestError } from "@app/lib/api/credits/upgrade_requests";
import {
  createUpgradeRequest,
  listPendingUpgradeRequests,
  resolveUpgradeRequest,
} from "@app/lib/api/credits/upgrade_requests";
import type {
  GetUpgradeRequestsResponseBody,
  PatchUpgradeRequestResponseBody,
  PostUpgradeRequestResponseBody,
} from "@app/types/api/credits/upgrade_requests";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  requestId: z.string(),
});

const ResolveBodySchema = z.object({
  status: z.union([z.literal("approved"), z.literal("denied")]),
});

function upgradeRequestErrorToApiError(
  error: UpgradeRequestError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "workspace_not_metronome_billed":
      return {
        status_code: 403,
        api_error: { type: "plan_limit_error", message: error.message },
      };
    case "upgrade_requests_disabled":
      return {
        status_code: 403,
        api_error: { type: "plan_limit_error", message: error.message },
      };
    case "user_not_found":
      return {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: error.message,
        },
      };
    case "request_not_found":
      return {
        status_code: 404,
        api_error: { type: "invalid_request_error", message: error.message },
      };
    case "request_not_pending":
      return {
        status_code: 409,
        api_error: { type: "invalid_request_error", message: error.message },
      };
    default:
      assertNever(error.type);
  }
}

// Mounted at /api/w/:wId/credits/upgrade-requests.
const app = workspaceApp();

// Admin-only: list pending upgrade requests for the workspace.
/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetUpgradeRequestsResponseBody> => {
    const auth = ctx.get("auth");
    const requests = await listPendingUpgradeRequests(auth);
    return ctx.json({ requests });
  }
);

// Member-initiated: request an upgrade of the current user's spend limit.
/** @ignoreswagger */
app.post("/", async (ctx): HandlerResult<PostUpgradeRequestResponseBody> => {
  const auth = ctx.get("auth");
  const result = await createUpgradeRequest(auth, {
    auditContext: getAuditLogContext(auth),
  });
  if (result.isErr()) {
    return apiError(ctx, upgradeRequestErrorToApiError(result.error));
  }
  return ctx.json({ request: result.value });
});

// Admin-only: resolve (approve/deny) a pending request.
/** @ignoreswagger */
app.patch(
  "/:requestId",
  ensureIsAdmin(),
  validate("param", ParamsSchema),
  validate("json", ResolveBodySchema),
  async (ctx): HandlerResult<PatchUpgradeRequestResponseBody> => {
    const auth = ctx.get("auth");
    const { requestId } = ctx.req.valid("param");
    const { status } = ctx.req.valid("json");
    const result = await resolveUpgradeRequest(auth, {
      requestId,
      status,
      auditContext: getAuditLogContext(auth),
    });
    if (result.isErr()) {
      return apiError(ctx, upgradeRequestErrorToApiError(result.error));
    }
    return ctx.json({ request: result.value });
  }
);

export default app;
