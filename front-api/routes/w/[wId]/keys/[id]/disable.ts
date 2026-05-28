import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { KeyResource } from "@app/lib/resources/key_resource";
import type { KeyType } from "@app/types/key";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PostKeysResponseBody = {
  key: KeyType;
};

const KeyIdParamSchema = z.object({
  id: z.string(),
});

// Mounted at /api/w/:wId/keys/:id/disable.
const app = workspaceApp();

app.post(
  "/",
  ensureIsAdmin(),
  validate("param", KeyIdParamSchema),
  async (ctx): HandlerResult<PostKeysResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { id } = ctx.req.valid("param");

    const key = await KeyResource.fetchByWorkspaceAndId({
      workspace: owner,
      id,
    });

    if (!key) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "key_not_found",
          message: "Could not find the key.",
        },
      });
    }

    await key.setIsDisabled();

    void emitAuditLogEvent({
      auth,
      action: "api_key.revoked",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("api_key", {
          sId: String(key.id),
          name: key.name,
        }),
      ],
      context: getAuditLogContext(auth),
    });

    return ctx.json({
      key: {
        ...key.toJSON(),
        status: "disabled",
      },
    });
  }
);

export default app;
