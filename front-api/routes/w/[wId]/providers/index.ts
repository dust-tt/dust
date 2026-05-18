import { Hono } from "hono";

import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import type { ProviderType } from "@app/types/provider";
import { redactString } from "@app/types/shared/utils/string_utils";

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
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isBuilder()) {
    return c.json(
      {
        error: {
          type: "provider_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can list providers.",
        },
      },
      403
    );
  }

  const owner = auth.getNonNullableWorkspace();
  const providers = await ProviderModel.findAll({
    where: {
      workspaceId: owner.id,
    },
  });

  const body: GetProvidersResponseBody = {
    providers: providers.map((p) => ({
      providerId: p.providerId,
      config: redactConfig(p.config),
    })),
  };
  return c.json(body);
});

export default app;
