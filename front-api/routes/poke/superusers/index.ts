import { listSuperuserMembers } from "@app/lib/api/poke/superusers";
import type { PokeGetSuperusers } from "@app/types/poke/roles";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import user from "./[userId]";
import { adminOnly, getAdminContext } from "./helpers";
import roles from "./roles";

const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetSuperusers> => {
  const admin = await getAdminContext(ctx);
  if (!admin) {
    return adminOnly(ctx);
  }
  return ctx.json({
    members: await listSuperuserMembers(admin.auth),
    roleEntries: admin.rolesConfig,
  });
});

app.route("/roles", roles);
app.route("/:userId", user);

export default app;
