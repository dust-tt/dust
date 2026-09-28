import { listGroupDiscoveryPins } from "@app/lib/api/discovery";
import type { GetGroupDiscoveryPinsResponseBody } from "@app/types/api/discovery";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import discoveryPin from "./[position]";

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId/discovery/pins.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetGroupDiscoveryPinsResponseBody> => {
    const result = await listGroupDiscoveryPins(ctx.get("auth"), {
      groupId: ctx.req.valid("param").groupId,
    });
    if (result.isOk()) {
      return ctx.json(result.value, 200);
    }

    switch (result.error.code) {
      case "invalid_id":
      case "invalid_request_error":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      case "unauthorized":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: result.error.message,
          },
        });
      case "group_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "group_not_found",
            message: result.error.message,
          },
        });
      default:
        assertNever(result.error.code);
    }
  }
);

app.route("/:position", discoveryPin);

export default app;
