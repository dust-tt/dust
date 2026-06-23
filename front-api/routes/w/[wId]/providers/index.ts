import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import type { GetProvidersResponseBody } from "@app/types/api/providers";
import { redactString } from "@app/types/shared/utils/string_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import check from "./[pId]/check";
import provider from "./[pId]/index";
import models from "./[pId]/models";

function redactConfig(config: string) {
  const parsedConfig = JSON.parse(config);

  return JSON.stringify({
    ...parsedConfig,
    api_key: redactString(parsedConfig.api_key, 6),
  });
}

// Mounted at /api/w/:wId/providers.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsBuilder(),
  async (ctx): HandlerResult<GetProvidersResponseBody> => {
    const auth = ctx.get("auth");

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
  }
);

app.route("/:pId/check", check);
app.route("/:pId/models", models);
app.route("/:pId", provider);

export default app;
