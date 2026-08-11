import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import type { ResolveUpgradeRequestError } from "@app/lib/api/credits/upgrade_requests";
import {
  createUpgradeRequest,
  listAllUpgradeRequests,
  listUpgradeRequests,
  resolveUpgradeRequest,
} from "@app/lib/api/credits/upgrade_requests";
import { upgradeRequestsToCsv } from "@app/lib/api/credits/upgrade_requests_export";
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

const ListUpgradeRequestsQuerySchema = z.object({
  status: z.union([z.literal("pending"), z.literal("resolved")]).optional(),
  offset: z.coerce.number().int().min(0).catch(0),
  decision: z.union([z.literal("approved"), z.literal("denied")]).optional(),
  search: z.string().optional(),
  format: z.union([z.literal("json"), z.literal("csv")]).optional(),
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
  async (ctx) => {
    const auth = ctx.get("auth");
    const { status, offset, decision, search, format } = ctx.req.valid("query");
    const resolvedStatus = status ?? "pending";

    if (format === "csv") {
      // CSV export is only wired to the resolved-requests History tab; it
      // always covers the full history matching the current filters.
      const requests = await listAllUpgradeRequests(auth, {
        status: "resolved",
        decision,
        search,
      });

      ctx.header("Content-Type", "text/csv");
      ctx.header(
        "Content-Disposition",
        'attachment; filename="dust_upgrade_requests_history.csv"'
      );
      return ctx.body(upgradeRequestsToCsv(requests));
    }

    const { requests, total } = await listUpgradeRequests(auth, {
      status: resolvedStatus,
      offset,
      decision,
      search,
    });

    const body: GetUpgradeRequestsResponseBody = { requests, total };
    return ctx.json(body);
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
