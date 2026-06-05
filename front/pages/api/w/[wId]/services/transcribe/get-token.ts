// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { dustManagedServiceCredentials } from "@app/types/api/credentials";
import type { WithAPIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { ElevenLabsEnvironment } from "@elevenlabs/elevenlabs-js/environments";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetTranscribeTokenResponseBody = {
  token: string;
  baseUri: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTranscribeTokenResponseBody>>,
  auth: Authenticator
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const plan = auth.getNonNullablePlan();
  if (plan.isByok) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Voice transcription is not available on this plan.",
      },
    });
  }

  const { ELEVENLABS_API_KEY: apiKey } = dustManagedServiceCredentials();

  if (!apiKey) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Voice transcription is not configured.",
      },
    });
  }

  const isEu = regionsConfig.getCurrentRegion() === "europe-west1";

  const elevenlabs = new ElevenLabsClient({
    apiKey,
    environment: isEu
      ? ElevenLabsEnvironment.ProductionEu
      : ElevenLabsEnvironment.ProductionUs,
  });

  try {
    const { token } =
      await elevenlabs.tokens.singleUse.create("realtime_scribe");

    const baseUri = isEu
      ? "wss://api.eu.elevenlabs.io"
      : "wss://api.elevenlabs.io";

    return res.status(200).json({ token, baseUri });
  } catch (err) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: normalizeError(err).message,
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
