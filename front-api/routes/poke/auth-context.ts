import type {
  GetPokeNoWorkspaceAuthContextResponseType,
  PokeAccessUserView,
} from "@app/lib/api/poke/auth_context";
import type { AuthenticatedAccessUser } from "@app/lib/api/poke/cloudflare_access";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

function toAccessUserView(
  user: AuthenticatedAccessUser | null
): PokeAccessUserView | null {
  if (!user) {
    return null;
  }
  return {
    subject: user.subject,
    email: user.email,
    name: user.name,
    identity: user.identity,
  };
}

// Mounted at /api/poke/auth-context. pokeAuth is applied by the parent poke
// sub-app, so ctx.get("auth") is always available here and the user is a
// verified super-user.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetPokeNoWorkspaceAuthContextResponseType> => {
    const auth = ctx.get("auth");

    return ctx.json({
      user: auth.toPokeUserJSON(),
      isSuperUser: true,
      pokeRoles: ctx.get("pokeRoles"),
      accessUser: toAccessUserView(ctx.get("accessUser")),
    });
  }
);

export default app;
