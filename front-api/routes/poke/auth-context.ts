import type { UserType } from "@app/types/user";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetPokeNoWorkspaceAuthContextResponseType = {
  user: UserType;
  isSuperUser: true;
};

// Mounted at /api/poke/auth-context. pokeAuth is applied by the parent poke
// sub-app, so ctx.get("auth") is always available here and the user is a
// verified super-user.
const app = new Hono();

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
