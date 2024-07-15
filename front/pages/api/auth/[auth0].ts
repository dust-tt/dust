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
import { isEmailValid } from "@app/lib/utils";

const isString = (value: unknown): value is string => typeof value === "string";

export default handleAuth({
  login: handleLogin((req) => {
    const { connection, screen_hint, login_hint } =
      "query" in req
        ? req.query
        : {
            connection: undefined,
            login_hint: undefined,
            screen_hint: undefined,
          };

    const defaultAuthorizationParams: Partial<
      LoginOptions["authorizationParams"]
    > = {
      scope: "openid profile email",
    };

    // Set the Auth0 connection based on the provided connection param, redirecting the user to the correct screen.
    if (isString(connection)) {
      defaultAuthorizationParams.connection = connection;
    }

    if (isString(screen_hint) && screen_hint === "signup") {
      defaultAuthorizationParams.screen_hint = screen_hint;
    }

    if (isString(login_hint) && isEmailValid(login_hint)) {
      defaultAuthorizationParams.login_hint = login_hint;
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
        "query" in req
          ? (req.query.returnTo as string)
          : config.getClientFacingUrl(),
    };
  }),
});
