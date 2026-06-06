import type { GetPokeNoWorkspaceAuthContextResponseType } from "@app/lib/api/poke/auth_context";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/auth-context. pokeAuth is applied by the parent poke
// sub-app, so ctx.get("auth") is always available here and the user is a
// verified super-user.
const app = pokeApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetPokeNoWorkspaceAuthContextResponseType> => {
    const auth = ctx.get("auth");
    const userResource = auth.getNonNullableUser();

    return ctx.json({
      user: userResource.toJSON(),
      isSuperUser: true,
    });
  }
);

export default app;
