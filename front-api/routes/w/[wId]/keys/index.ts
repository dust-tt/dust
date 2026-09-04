import { createApiKey } from "@app/lib/api/keys/create";
import { getApiKeysSpendCappedByModelId } from "@app/lib/api/keys/spend_limit";
import { KeyResource } from "@app/lib/resources/key_resource";
import type {
  GetKeysResponseBody,
  PostKeysResponseBody,
} from "@app/types/api/keys";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import keyId from "./[id]";
import keySpaces from "./spaces";

const CreateKeyPostBodySchema = z.object({
  name: z.string(),
  space_ids: z.array(z.string()).optional(),
  monthly_cap_micro_usd: z.number().nullish(),
  // Per-key credit cap in AWU credits (credit-priced plans only). null/omitted
  // = unlimited.
  monthly_cap_awu_credits: z.number().nullish(),
  role: z.enum(["user", "admin"]).optional(),
});

// Mounted at /api/w/:wId/keys.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetKeysResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const owner = auth.getNonNullableWorkspace();

    const keys = await KeyResource.listNonSystemKeysByWorkspace(owner);
    const spendCappedByModelId = await getApiKeysSpendCappedByModelId(
      auth,
      keys
    );

    return ctx.json({
      keys: await KeyResource.toJSONWithSpaces(
        auth,
        keys,
        user.id,
        spendCappedByModelId
      ),
    });
  }
);

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", CreateKeyPostBodySchema),
  async (ctx): HandlerResult<PostKeysResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();

    const {
      name,
      space_ids,
      monthly_cap_micro_usd,
      monthly_cap_awu_credits,
      role,
    } = ctx.req.valid("json");

    const keyRes = await createApiKey(auth, {
      name,
      spaceIds: space_ids ?? [],
      monthlyCapMicroUsd: monthly_cap_micro_usd ?? null,
      monthlyCapAwuCredits: monthly_cap_awu_credits ?? null,
      role: role ?? "user",
    });

    if (keyRes.isErr()) {
      const { code, message } = keyRes.error;
      switch (code) {
        case "invalid_request_error":
        case "name_conflict":
          return apiError(ctx, {
            status_code: 400,
            api_error: { type: "invalid_request_error", message },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: { type: "workspace_auth_error", message },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: { type: "group_not_found", message },
          });
        case "limit_reached":
          return apiError(ctx, {
            status_code: 429,
            api_error: { type: "rate_limit_error", message },
          });
        case "metronome_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: { type: "internal_server_error", message },
          });
        default:
          assertNever(code);
      }
    }

    return ctx.json(
      {
        key: await keyRes.value.toJSONWithSpaces(auth, user.id),
      },
      201
    );
  }
);

app.route("/spaces", keySpaces);
app.route("/:id", keyId);

export default app;
