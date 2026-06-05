import { config as regionsConfig } from "@app/lib/api/regions/config";
import { dustManagedServiceCredentials } from "@app/types/api/credentials";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { ElevenLabsEnvironment } from "@elevenlabs/elevenlabs-js/environments";
import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

export type GetTranscribeTokenResponseBody = {
  token: string;
  baseUri: string;
};

// Mounted at /api/w/:wId/services/transcribe/get-token.
const app = createHono<WorkspaceAwareCtx>();

app.get("/", async (ctx) => {
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
