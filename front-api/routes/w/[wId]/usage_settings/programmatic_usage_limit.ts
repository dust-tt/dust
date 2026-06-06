/** @ignoreswagger */

import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import type {
  GetProgrammaticUsageLimitResponseBody,
  PutProgrammaticUsageLimitResponseBody,
} from "@app/lib/api/credits/programmatic_usage_limit";
import {
  getProgrammaticUsageLimit,
  syncProgrammaticUsageLimit,
} from "@app/lib/api/credits/programmatic_usage_limit";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const UpdateProgrammaticUsageLimitBodySchema = z.object({
  monthlyCapCredits: z.number().int().nonnegative().nullable(),
});

// Mounted at /api/w/:wId/usage_settings/programmatic_usage_limit.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetProgrammaticUsageLimitResponseBody> => {
    const auth = ctx.get("auth");
    const result = await getProgrammaticUsageLimit(auth);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }
    return ctx.json({ monthlyCapCredits: result.value });
  }
);

app.put(
  "/",
  ensureIsAdmin(),
  validate("json", UpdateProgrammaticUsageLimitBodySchema),
  async (ctx): HandlerResult<PutProgrammaticUsageLimitResponseBody> => {
    const auth = ctx.get("auth");
    const { monthlyCapCredits } = ctx.req.valid("json");

    const auditContext = getAuditLogContext(auth);
    const result = await syncProgrammaticUsageLimit({
      auth,
      monthlyCapCredits,
      auditContext,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }
    return ctx.json({ monthlyCapCredits });
  }
);

export default app;
