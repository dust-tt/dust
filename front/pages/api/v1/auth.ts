import type { NextApiRequest, NextApiResponse } from "next";

import { config as regionsConfig } from "@app/lib/api/regions/config";
import {
  lookupAuth,
  lookupAuthInOtherRegion,
} from "@app/lib/api/regions/lookup";
import { fetchWorkOSUserWithEmail } from "@app/lib/api/workos/user";
import { getFeatureFlags } from "@app/lib/auth";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type AuthResponseType = {
  auth: "auth0" | "workos";
  signup?: boolean;
};

/**
 * @ignoreswagger
 * undocumented.
 * TODO(workos) Remove the endpoint once migrated.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AuthResponseType>>
): Promise<void> {
  switch (req.method) {
    case "GET":
      const { email } = req.query;
      if (email && typeof email === "string") {
        const userRes = await fetchWorkOSUserWithEmail(email);

        if (userRes.isErr()) {
          return res.status(200).json({ auth: "workos", signup: true });
        }

        const user = userRes.value;
        // If user has already signed in with WorkOS, stay on workos forever
        const lastLogin = user.lastSignInAt;
        if (lastLogin) {
          return res.status(200).json({ auth: "workos", signup: false });
        }
        if (user.metadata.region !== regionsConfig.getCurrentRegion()) {
          const auth = await lookupAuthInOtherRegion({
            email,
            email_verified: true,
          });
          if (auth.isOk()) {
            return res.status(200).json({ auth: auth.value, signup: false });
          }
        } else {
          // Check the workspace with verified domain
          const auth = await lookupAuth({
            email,
            email_verified: true,
          });
          return res.status(200).json({ auth });
        }
      }

      // No email specified - default to auth0.
      return res.status(200).json({ auth: "auth0" });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
