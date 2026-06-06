/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { GetPokeMetronomePackagesResponseBody } from "@app/lib/api/poke/metronome";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { listMetronomePackages } from "@app/lib/metronome/client";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetPokeMetronomePackagesResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const result = await listMetronomePackages();
  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 502,
      api_error: {
        type: "internal_server_error",
        message: `Failed to list Metronome packages: ${result.error.message}`,
      },
    });
  }

  res.status(200).json({ packages: result.value });
}

export default withSessionAuthenticationForPoke(handler);
