import { Hono } from "hono";

import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import type { ProviderType } from "@app/types/provider";
import { redactString } from "@app/types/shared/utils/string_utils";

import { requireRole } from "../../middleware/require_role";

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

export const providersApp = new Hono();

providersApp.get("/", requireRole("builder"), async (c) => {
  const auth = c.get("auth");
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
