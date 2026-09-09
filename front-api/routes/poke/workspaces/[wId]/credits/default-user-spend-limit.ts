import {
  type DefaultUserSpendLimitError,
  getDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import type { GetDefaultUserSpendLimitResponseBody } from "@app/types/api/workspace/default_user_spend_limit";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type { GetDefaultUserSpendLimitResponseBody };

function mapErrorToApiError(
  error: DefaultUserSpendLimitError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "workspace_not_metronome_billed":
      return {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message: error.message,
        },
      };
    case "invalid_threshold":
      return {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      };
    case "contract_not_found":
      return {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: error.message,
        },
      };
    case "metronome_error":
      return {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: "Failed to read the default spend limit in billing system.",
        },
      };
    default:
      assertNever(error.type);
  }
}

// Mounted at /api/poke/workspaces/:wId/credits/default-user-spend-limit. Read-only: poke never
// writes this value, editing stays confined to the workspace-scoped, manager-gated endpoint.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetDefaultUserSpendLimitResponseBody> => {
    const auth = ctx.get("auth");

    const result = await getDefaultUserSpendLimit(auth);
    if (result.isErr()) {
      return apiError(ctx, mapErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

export default app;
