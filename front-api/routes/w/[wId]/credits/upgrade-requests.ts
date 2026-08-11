import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import type { ResolveUpgradeRequestError } from "@app/lib/api/credits/upgrade_requests";
import {
  createUpgradeRequest,
  listPendingUpgradeRequests,
  listResolvedUpgradeRequests,
  resolveUpgradeRequest,
} from "@app/lib/api/credits/upgrade_requests";
import { UserSpendLimitError } from "@app/lib/api/users/spend_limit";
import type {
  GetUpgradeRequestsResponseBody,
  PatchUpgradeRequestResponseBody,
  PostUpgradeRequestResponseBody,
} from "@app/types/api/credits/upgrade_requests";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import {
  MAX_UPGRADE_REQUEST_REASON_LENGTH_CHARS,
  MEMBERSHIP_SEAT_TYPES,
} from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import {
  spendLimitErrorToApiError,
  UpdateUserSpendLimitBodySchema,
} from "@front-api/routes/w/[wId]/members/[uId]/spend_limit";
import { z } from "zod";

const ParamsSchema = z.object({
  requestId: z.string(),
});

const ResolveBodySchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("denied") }),
    z.object({
      status: z.literal("approved"),
      limit: UpdateUserSpendLimitBodySchema.optional(),
      // Set when the admin resolved the request via "Upgrade to max plan"
      grantedSeatType: z.enum(MEMBERSHIP_SEAT_TYPES).optional(),
    }),
  ])
  // A request is granted at most one of a spend limit or a seat upgrade.
  .refine(
    (data) =>
      !(data.status === "approved" && data.limit && data.grantedSeatType),
    {
      message: "Cannot set both `limit` and `grantedSeatType`.",
      path: ["grantedSeatType"],
    }
  );

// Omitted/"pending" preserves the requests queue behavior
const ListUpgradeRequestsQuerySchema = z.object({
  status: z.union([z.literal("pending"), z.literal("resolved")]).optional(),
  offset: z.coerce.number().int().min(0).catch(0),
});

const CreateUpgradeRequestBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .max(MAX_UPGRADE_REQUEST_REASON_LENGTH_CHARS)
    .optional(),
});

function upgradeRequestErrorToApiError(
  error: ResolveUpgradeRequestError
): APIErrorWithContentfulStatusCode {
  if (error instanceof UserSpendLimitError) {
    return spendLimitErrorToApiError(error);
  }
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
      assertNever(error);
  }
}

// Mounted at /api/w/:wId/credits/upgrade-requests.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("query", ListUpgradeRequestsQuerySchema),
  async (ctx): HandlerResult<GetUpgradeRequestsResponseBody> => {
    const auth = ctx.get("auth");
    const { status, offset } = ctx.req.valid("query");
    if (status === "resolved") {
      const { requests, total } = await listResolvedUpgradeRequests(auth, {
        offset,
      });
      return ctx.json({ requests, total });
    }
    const requests = await listPendingUpgradeRequests(auth);
    return ctx.json({ requests });
  }
);

// Member-initiated: request an upgrade of the current user's spend limit.
/** @ignoreswagger */
app.post(
  "/",
  validate("json", CreateUpgradeRequestBodySchema),
  async (ctx): HandlerResult<PostUpgradeRequestResponseBody> => {
    const auth = ctx.get("auth");
    const { reason } = ctx.req.valid("json");
    const result = await createUpgradeRequest(auth, {
      reason: reason ?? null,
      auditContext: getAuditLogContext(auth),
    });
    if (result.isErr()) {
      return apiError(ctx, upgradeRequestErrorToApiError(result.error));
    }
    return ctx.json({ request: result.value });
  }
);

/** @ignoreswagger */
app.patch(
  "/:requestId",
  ensureIsManager(),
  validate("param", ParamsSchema),
  validate("json", ResolveBodySchema),
  async (ctx): HandlerResult<PatchUpgradeRequestResponseBody> => {
    const auth = ctx.get("auth");
    const { requestId } = ctx.req.valid("param");
    const resolution = ctx.req.valid("json");
    const result = await resolveUpgradeRequest(auth, {
      requestId,
      resolution,
      auditContext: getAuditLogContext(auth),
    });
    if (result.isErr()) {
      return apiError(ctx, upgradeRequestErrorToApiError(result.error));
    }
    return ctx.json({ request: result.value });
  }
);

export default app;
