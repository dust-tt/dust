import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import type { ProviderType } from "@app/types/provider";
import { redactString } from "@app/types/shared/utils/string_utils";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type GetProvidersResponseBody = {
  providers: ProviderType[];
};

function redactConfig(config: string) {
  const parsedConfig = JSON.parse(config);

  return JSON.stringify({
    ...parsedConfig,
    api_key: redactString(parsedConfig.api_key, 6),
  });
}

// Mounted at /api/w/:wId/providers.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetProvidersResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isBuilder()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "provider_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can list providers.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const providers = await ProviderModel.findAll({
    where: {
      workspaceId: owner.id,
    },
  });

  return ctx.json({
    providers: providers.map((p) => ({
      providerId: p.providerId,
      config: redactConfig(p.config),
    })),
  });
});

export default app;
