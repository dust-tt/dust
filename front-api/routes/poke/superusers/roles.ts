import config from "@app/lib/api/config";
import { setPokeRoles } from "@app/lib/api/poke/superusers";
import { PokeRoleSchema } from "@app/lib/poke/roles";
import { auditLog } from "@app/logger/logger";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import { adminOnly, getAdminContext, mutationError } from "./helpers";

const SetRolesBodySchema = z.object({
  email: z.string().email(),
  roles: z.array(PokeRoleSchema).nullable(),
});

const app = pokeApp();

/** Add, update, or remove an email entry in poke-roles.json. @ignoreswagger */
app.patch(
  "/",
  validate("json", SetRolesBodySchema),
  async (ctx): HandlerResult<{ success: true }> => {
    const admin = await getAdminContext(ctx);
    if (!admin) {
      return adminOnly(ctx);
    }
    const { email, roles } = ctx.req.valid("json");
    const result = await setPokeRoles(
      admin.auth,
      admin.rolesConfig,
      email,
      roles
    );
    if (result.isErr()) {
      return mutationError(ctx, result.error);
    }

    auditLog(
      {
        author: admin.auth.getNonNullableUser().toJSON(),
        action: roles === null ? "poke_roles.removed" : "poke_roles.updated",
        workspaceId: admin.auth.getNonNullableWorkspace().sId,
        targetEmail: result.value.email,
        previousRoles: result.value.previousRoles,
        newRoles: result.value.newRoles,
        region: config.getRegion() ?? "unknown",
      },
      "[Security] Poke roles changed"
    );
    return ctx.json({ success: true });
  }
);

export default app;
