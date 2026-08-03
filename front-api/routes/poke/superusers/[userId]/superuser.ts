import config from "@app/lib/api/config";
import { setDustSuperUser } from "@app/lib/api/poke/superusers";
import { auditLog } from "@app/logger/logger";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import { adminOnly, getAdminContext, mutationError } from "../helpers";

const SetSuperuserBodySchema = z.object({ isDustSuperUser: z.boolean() });
const UserParamsSchema = z.object({ userId: z.string() });

const app = pokeApp();

/** Toggle the database isDustSuperUser flag. @ignoreswagger */
app.patch(
  "/",
  validate("param", UserParamsSchema),
  validate("json", SetSuperuserBodySchema),
  async (ctx): HandlerResult<{ success: true }> => {
    const admin = await getAdminContext(ctx);
    if (!admin) {
      return adminOnly(ctx);
    }
    const { userId } = ctx.req.valid("param");
    const { isDustSuperUser } = ctx.req.valid("json");
    const result = await setDustSuperUser(admin.auth, userId, isDustSuperUser);
    if (result.isErr()) {
      return mutationError(ctx, result.error);
    }

    auditLog(
      {
        author: admin.auth.getNonNullableUser().toJSON(),
        action: "dust_superuser.toggled",
        workspaceId: admin.auth.getNonNullableWorkspace().sId,
        targetUserId: result.value.userId,
        targetEmail: result.value.email,
        previousValue: result.value.previousValue,
        newValue: result.value.newValue,
        region: config.getRegion() ?? "unknown",
      },
      "[Security] Dust superuser flag changed"
    );
    return ctx.json({ success: true });
  }
);

export default app;
