import type { LoginOptions } from "@auth0/nextjs-auth0";
import {
  CallbackHandlerError,
  handleAuth,
  handleCallback,
  handleLogin,
  handleLogout,
  IdentityProviderError,
} from "@auth0/nextjs-auth0";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";

export default handleAuth({
  login: handleLogin((req) => {
    let connection: string | undefined = undefined;
    if ("query" in req && req.query.connection) {
      connection =
        typeof req.query.connection === "string"
          ? req.query.connection
          : undefined;
    }

    const defaultAuthorizationParams: Partial<
      LoginOptions["authorizationParams"]
    > = {
      scope: "openid profile email",
    };

    // Set the Auth0 connection based on the provided connection param, redirecting the user to the correct screen.
    if (connection) {
      defaultAuthorizationParams.connection = connection;
    }

    return {
      authorizationParams: defaultAuthorizationParams,
      returnTo: "/api/login",
    };
  }),
  callback: async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handleCallback(req, res);
    } catch (error) {
      let reason: string | null = null;

      if (error instanceof CallbackHandlerError) {
        if (error.cause instanceof IdentityProviderError) {
          const { error: err, errorDescription } = error.cause;
          if (err === "access_denied") {
            reason = errorDescription ?? err;
          } else {
            reason = err ?? null;
          }
        }

        return res.redirect(`/login-error?reason=${reason}`);
      }

      return res.redirect("/login-error");
    }
  },
  logout: handleLogout((req) => {
    return {
      returnTo:
        "query" in req ? (req.query.returnTo as string) : config.getAppUrl(),
    };
  }),
});
