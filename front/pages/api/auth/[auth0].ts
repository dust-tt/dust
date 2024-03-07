import { handleAuth, handleLogin } from "@auth0/nextjs-auth0";
import type { AuthorizationParameters } from "@auth0/nextjs-auth0/dist/auth0-session";

export default handleAuth({
  login: handleLogin((req) => {
    const connection = "query" in req ? req.query.connection : undefined;

    const defaultAuthorizationParams: Partial<AuthorizationParameters> = {
      scope: "openid profile email",
    };

    // Set the Auth0 connection based on the provided connection param, redirecting the user to the correct screen.
    if (connection) {
      defaultAuthorizationParams.connection = connection;
    }

    return {
      authorizationParams: defaultAuthorizationParams,
    };
  }),
});
