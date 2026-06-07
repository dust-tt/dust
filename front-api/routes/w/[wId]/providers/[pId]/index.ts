import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import type { ProviderType } from "@app/types/provider";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PostProviderResponseBody = {
  provider: ProviderType;
};

export type DeleteProviderResponseBody = {
  provider: {
    providerId: string;
  };
};

const PostProviderBodySchema = z.object({
  config: z.string(),
});

const ParamsSchema = z.object({
  pId: z.string(),
});

// Mounted at /api/w/:wId/providers/:pId.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  validate("json", PostProviderBodySchema),
  async (ctx): HandlerResult<PostProviderResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { pId } = ctx.req.valid("param");

    const body = ctx.req.valid("json");

    let provider = await ProviderModel.findOne({
      where: {
        workspaceId: owner.id,
        providerId: pId,
      },
    });

    if (!provider) {
      provider = await ProviderModel.create({
        providerId: pId,
        config: body.config,
        workspaceId: owner.id,
      });

      return ctx.json(
        {
          provider: {
            providerId: provider.providerId,
            config: provider.config,
          },
        },
        201
      );
    }

    await provider.update({
      config: body.config,
    });

    return ctx.json({
      provider: {
        providerId: provider.providerId,
        config: provider.config,
      },
    });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  async (ctx): HandlerResult<DeleteProviderResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { pId } = ctx.req.valid("param");

    const provider = await ProviderModel.findOne({
      where: {
        workspaceId: owner.id,
        providerId: pId,
      },
    });

    if (!provider) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "provider_not_found",
          message: "The provider you're trying to delete was not found.",
        },
      });
    }

    await ProviderModel.destroy({
      where: {
        workspaceId: owner.id,
        providerId: pId,
      },
    });

    return ctx.json({
      provider: {
        providerId: pId,
      },
    });
  }
);

export default app;
