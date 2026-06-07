import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { LabsTranscriptsConfigurationType } from "@app/types/labs";
import { isProviderWithDefaultWorkspaceConfiguration } from "@app/types/oauth/lib";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import { acceptableTranscriptProvidersCodec } from "./schemas";

const GetDefaultQuerySchema = z.object({
  provider: acceptableTranscriptProvidersCodec,
});

type GetResponseBody = {
  configuration: LabsTranscriptsConfigurationType | null;
};

// Mounted at /api/w/:wId/labs/transcripts/default.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetDefaultQuerySchema),
  async (ctx): HandlerResult<GetResponseBody> => {
    const auth = ctx.get("auth");
    const { provider } = ctx.req.valid("query");

    const transcriptsConfiguration =
      await LabsTranscriptsConfigurationResource.findByWorkspaceAndProvider({
        auth,
        provider,
        isDefaultWorkspaceConfiguration: true,
      });

    if (!transcriptsConfiguration) {
      return ctx.json({ configuration: null });
    }

    if (!isProviderWithDefaultWorkspaceConfiguration(provider)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "transcripts_configuration_default_not_allowed",
          message: "The provider does not allow default configurations.",
        },
      });
    }

    return ctx.json({ configuration: transcriptsConfiguration.toJSON() });
  }
);

export default app;
