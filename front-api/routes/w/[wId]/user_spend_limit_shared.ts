import {
  MAX_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_USER_SPEND_LIMIT_AWU_CREDITS,
  type UserSpendLimitError,
} from "@app/lib/api/users/spend_limit";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

export const UpdateUserSpendLimitBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }),
  z.object({
    kind: z.literal("limited"),
    awuCredits: z
      .number()
      .int()
      .min(MIN_USER_SPEND_LIMIT_AWU_CREDITS)
      .max(MAX_USER_SPEND_LIMIT_AWU_CREDITS),
    // Epoch ms at which the override auto-reverts to unlimited.
    // Omitted/null means it never expires.
    expiresAt: z
      .number()
      .int()
      .positive()
      .refine((value) => value > Date.now(), {
        message: "expiresAt must be in the future.",
      })
      .nullish(),
  }),
]);

export function spendLimitErrorToApiError(
  error: UserSpendLimitError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "user_not_found":
      return {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: error.message,
        },
      };
    case "workspace_not_metronome_billed":
      return {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message: error.message,
        },
      };
    case "metronome_error":
      return {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: "Failed to update spend limit in billing system.",
        },
      };
    default:
      assertNever(error.type);
  }
}
