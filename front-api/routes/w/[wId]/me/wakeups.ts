import type { UserWakeUps } from "@app/lib/api/assistant/wakeups";
import { listUserWakeUps } from "@app/lib/api/assistant/wakeups";
import { WakeUpStatusSchema } from "@app/types/assistant/wakeups";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0),
  // Only the still-pending wake-ups are of interest by default; terminal ones are history.
  status: WakeUpStatusSchema.optional().default("scheduled"),
});

export type GetUserWakeUpsResponseBody = UserWakeUps;

// Mounted at /api/w/:wId/me/wakeups.
const app = workspaceApp();

/** @ignoreswagger */
// Internal endpoint backing the "Wake-Ups" tab of the personal automations view.
app.get(
  "/",
  validate("query", QuerySchema),
  async (ctx): HandlerResult<GetUserWakeUpsResponseBody> => {
    const auth = ctx.get("auth");
    const { limit, offset, status } = ctx.req.valid("query");

    const wakeUps = await listUserWakeUps(auth, { limit, offset, status });

    return ctx.json(wakeUps);
  }
);

export default app;
