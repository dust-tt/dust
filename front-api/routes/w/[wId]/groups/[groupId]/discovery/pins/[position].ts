import type { DiscoveryPinError } from "@app/lib/api/discovery";
import {
  removeGroupDiscoveryPin,
  setGroupDiscoveryPin,
} from "@app/lib/api/discovery";
import type {
  DeleteGroupDiscoveryPinResponseBody,
  PutGroupDiscoveryPinResponseBody,
} from "@app/types/api/discovery";
import { PutGroupDiscoveryPinBodySchema } from "@app/types/api/discovery";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  groupId: z.string(),
  position: z.coerce.number().int().min(0).max(2),
});

const app = workspaceApp();

/** @ignoreswagger */
app.put(
  "/",
  ensureIsAdmin(),
  validate("param", ParamsSchema),
  validate("json", PutGroupDiscoveryPinBodySchema),
  async (ctx): HandlerResult<PutGroupDiscoveryPinResponseBody> => {
    const { groupId, position } = ctx.req.valid("param");
    const result = await setGroupDiscoveryPin(ctx.get("auth"), {
      groupId,
      item: {
        ...ctx.req.valid("json"),
        position,
      },
    });
    if (result.isOk()) {
      return ctx.json(result.value, 200);
    }

    return discoveryPinErrorResponse(ctx, result.error);
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsAdmin(),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<DeleteGroupDiscoveryPinResponseBody> => {
    const { groupId, position } = ctx.req.valid("param");
    const result = await removeGroupDiscoveryPin(ctx.get("auth"), {
      groupId,
      position,
    });
    if (result.isOk()) {
      return ctx.json(result.value, 200);
    }

    return discoveryPinErrorResponse(ctx, result.error);
  }
);

function discoveryPinErrorResponse(
  ctx: Parameters<typeof apiError>[0],
  error: DiscoveryPinError
) {
  switch (error.code) {
    case "invalid_id":
    case "invalid_request_error":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "unauthorized":
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: error.message,
        },
      });
    case "group_not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: error.message,
        },
      });
    default:
      assertNever(error.code);
  }
}

export default app;
