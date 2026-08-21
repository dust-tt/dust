import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  type GroupWorkflowAlertThresholdError,
  MAX_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS,
  MIN_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS,
  setGroupWorkflowAlertThreshold,
} from "@app/lib/api/groups/workflow_alert_threshold";
import type { PutGroupWorkflowAlertThresholdResponseBody } from "@app/types/api/groups/workflow_alert_threshold";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const UpdateGroupWorkflowAlertThresholdBodySchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("disabled") }),
    z.object({
      kind: z.literal("enabled"),
      awuCredits: z
        .number()
        .int()
        .min(MIN_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS)
        .max(MAX_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS),
    }),
  ]
);

const ParamsSchema = z.object({
  groupId: z.string(),
});

function workflowAlertThresholdErrorToApiError(
  error: GroupWorkflowAlertThresholdError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "group_not_found":
      return {
        status_code: 404,
        api_error: { type: "group_not_found", message: error.message },
      };
    case "invalid_group_kind":
    case "invalid_threshold":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: error.message },
      };
    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: error.message },
      };
    default:
      assertNever(error.type);
  }
}

// Mounted at /api/w/:wId/groups/:groupId/workflow_alert_threshold.
const app = workspaceApp();

/** @ignoreswagger */
app.put(
  "/",
  validate("param", ParamsSchema),
  ensureIsManager(),
  validate("json", UpdateGroupWorkflowAlertThresholdBodySchema),
  async (ctx): HandlerResult<PutGroupWorkflowAlertThresholdResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const result = await setGroupWorkflowAlertThreshold(auth, {
      groupId,
      threshold: ctx.req.valid("json"),
      auditContext: getAuditLogContext(auth),
    });
    if (result.isErr()) {
      return apiError(ctx, workflowAlertThresholdErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

export default app;
