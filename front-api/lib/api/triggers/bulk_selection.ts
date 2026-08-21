import type { BulkTriggerSelection } from "@app/lib/api/triggers/bulk_selection";
import {
  BulkTriggerSelectionTooLargeError,
  resolveBulkTriggerSelection,
} from "@app/lib/api/triggers/bulk_selection";
import type { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { APIErrorResponse } from "@app/types/error";
import { apiError } from "@front-api/middlewares/utils";
import type { Context, TypedResponse } from "hono";

/**
 * Resolves a bulk selection into triggers, or dispatches the HTTP error the
 * caller should return. Shared by the bulk trigger endpoints so they map the
 * resolution failures the same way.
 */
export async function resolveBulkTriggerSelectionForRequest(
  ctx: Context,
  auth: Authenticator,
  selection: BulkTriggerSelection
): Promise<TriggerResource[] | TypedResponse<APIErrorResponse>> {
  const triggersResult = await resolveBulkTriggerSelection(auth, selection);
  if (triggersResult.isOk()) {
    return triggersResult.value;
  }

  if (triggersResult.error instanceof BulkTriggerSelectionTooLargeError) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: triggersResult.error.message,
      },
    });
  }

  return apiError(
    ctx,
    {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to resolve the selected automations.",
      },
    },
    triggersResult.error
  );
}
