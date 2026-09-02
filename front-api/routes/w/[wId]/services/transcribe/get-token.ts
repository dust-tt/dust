import { config as regionsConfig } from "@app/lib/api/regions/config";
import {
  getElevenLabs,
  REGION_TO_ELEVENLABS_ENVIRONMENT,
} from "@app/lib/utils/transcribe_service";
import { dustManagedServiceCredentials } from "@app/types/api/credentials";
import type { GetTranscribeTokenResponseBody } from "@app/types/api/transcribe";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/services/transcribe/get-token.
const app = createHono<WorkspaceAwareCtx>();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetTranscribeTokenResponseBody> => {
  const auth = ctx.get("auth");

  const plan = auth.getNonNullablePlan();
  if (plan.isByok) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Voice transcription is not available on this plan.",
      },
    });
  }

  const { ELEVENLABS_API_KEY: apiKey } = dustManagedServiceCredentials();

  if (!apiKey) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Voice transcription is not configured.",
      },
    });
  }

  try {
    const elevenlabs = getElevenLabs();
    const { token } =
      await elevenlabs.tokens.singleUse.create("realtime_scribe");
    const region = regionsConfig.getCurrentRegion();

    const baseUri = REGION_TO_ELEVENLABS_ENVIRONMENT[region].websocketUrl;

    return ctx.json({ token, baseUri });
  } catch (err) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: normalizeError(err).message,
      },
    });
  }
});

export default app;
