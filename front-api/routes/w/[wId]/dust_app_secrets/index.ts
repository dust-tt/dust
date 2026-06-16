import type {
  GetDustAppSecretsResponseBody,
  PostDustAppSecretsResponseBody,
} from "@app/lib/api/dust_app_secrets";
import {
  getDustAppSecret,
  getDustAppSecrets,
} from "@app/lib/api/dust_app_secrets";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { encrypt } from "@app/types/shared/utils/encryption";
import { workspaceApp } from "@front-api/middlewares/ctx";
import {
  ensureIsAdmin,
  ensureIsBuilder,
} from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import nameRoute from "./[name]";

const PostDustAppSecretBodySchema = z.object({
  name: z.string(),
  value: z.string(),
});

// Mounted at /api/w/:wId/dust_app_secrets.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsBuilder(),
  async (ctx): HandlerResult<GetDustAppSecretsResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const remaining = await rateLimiter({
      key: `workspace:${owner.id}:dust_app_secrets`,
      maxPerTimeframe: 60,
      timeframeSeconds: 60,
      logger,
    });

    if (remaining < 0) {
      return apiError(ctx, {
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message: "You have reached the rate limit for this workspace.",
        },
      });
    }

    const secrets = await getDustAppSecrets(auth);
    return ctx.json({ secrets });
  }
);

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostDustAppSecretBodySchema),
  async (ctx): HandlerResult<PostDustAppSecretsResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const remaining = await rateLimiter({
      key: `workspace:${owner.id}:dust_app_secrets`,
      maxPerTimeframe: 60,
      timeframeSeconds: 60,
      logger,
    });

    if (remaining < 0) {
      return apiError(ctx, {
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message: "You have reached the rate limit for this workspace.",
        },
      });
    }

    const { name: postSecretName, value: secretValue } = ctx.req.valid("json");

    // Sanitize the secret name to be alphanumeric and underscores only.
    const sanitizedSecretName = postSecretName.replace(/[^a-zA-Z0-9_]/g, "_");

    // Workspace sid is fed as key that will be added to the salt.
    const encryptedValue = encrypt({
      text: secretValue,
      key: owner.sId,
      useCase: "developer_secret",
    });

    let postSecret = await getDustAppSecret(auth, sanitizedSecretName);

    if (postSecret) {
      await postSecret.update({
        hash: encryptedValue,
      });
    } else {
      postSecret = await DustAppSecretModel.create({
        userId: user.id,
        workspaceId: owner.id,
        name: sanitizedSecretName,
        hash: encryptedValue,
      });
    }

    return ctx.json(
      {
        secret: {
          name: sanitizedSecretName,
          value: secretValue,
        },
      },
      201
    );
  }
);

app.route("/:name", nameRoute);

export default app;
