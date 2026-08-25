import { archiveInactiveWorkspaceAgents } from "@app/lib/api/assistant/inactivity/archive_inactive_agents";
import { countSkipsByReason } from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import type { AgentInactivityPolicyError } from "@app/lib/api/assistant/inactivity/policy";
import {
  MAX_INACTIVITY_THRESHOLD_DAYS,
  MIN_INACTIVITY_THRESHOLD_DAYS,
} from "@app/lib/api/assistant/inactivity/policy";
import { previewInactiveAgents } from "@app/lib/api/assistant/inactivity/preview_inactive_agents";
import type {
  ArchiveInactiveAgentsResponseBody,
  PreviewInactiveAgentsResponseBody,
} from "@app/types/api/assistant/configuration";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { z } from "zod";

const PreviewBodySchema = z.object({
  thresholdDays: z
    .number()
    .int()
    .min(MIN_INACTIVITY_THRESHOLD_DAYS)
    .max(MAX_INACTIVITY_THRESHOLD_DAYS),
});

// Archival takes the whole workspace, so it asks for nothing the preview does not.
const ArchiveBodySchema = PreviewBodySchema;

function policyErrorToApiError(error: AgentInactivityPolicyError) {
  switch (error.type) {
    case "invalid_threshold":
      return {
        status_code: 400 as const,
        api_error: {
          type: "invalid_request_error" as const,
          message: error.message,
        },
      };
    default:
      assertNever(error.type);
  }
}

// Mounted at /api/w/:wId/assistant/agent_configurations/archive_inactive.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/preview",
  ensureIsAdmin(),
  withFeatureFlag("archive_inactive_agents"),
  validate("json", PreviewBodySchema),
  async (ctx): HandlerResult<PreviewInactiveAgentsResponseBody> => {
    const auth = ctx.get("auth");

    const { thresholdDays } = ctx.req.valid("json");

    const previewRes = await previewInactiveAgents(auth, {
      thresholdDays,
      evaluatedAt: new Date(),
    });
    if (previewRes.isErr()) {
      return apiError(ctx, policyErrorToApiError(previewRes.error));
    }

    const { evaluatedAt, cutoffAt, eligibleAgentIds, skipped } =
      previewRes.value;

    return ctx.json({
      preview: {
        evaluatedAt: evaluatedAt.toISOString(),
        cutoffAt: cutoffAt.toISOString(),
        thresholdDays,
        eligibleCount: eligibleAgentIds.length,
        skippedCountByReason: countSkipsByReason(skipped),
      },
    });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  withFeatureFlag("archive_inactive_agents"),
  validate("json", ArchiveBodySchema),
  async (ctx): HandlerResult<ArchiveInactiveAgentsResponseBody> => {
    const auth = ctx.get("auth");

    const { thresholdDays } = ctx.req.valid("json");

    const archivalRes = await archiveInactiveWorkspaceAgents(auth, {
      thresholdDays,
      evaluatedAt: new Date(),
    });
    if (archivalRes.isErr()) {
      return apiError(ctx, policyErrorToApiError(archivalRes.error));
    }

    const { evaluatedAt, cutoffAt, archivedAgentIds, skipped } =
      archivalRes.value;

    return ctx.json({
      archival: {
        evaluatedAt: evaluatedAt.toISOString(),
        cutoffAt: cutoffAt.toISOString(),
        thresholdDays,
        archivedCount: archivedAgentIds.length,
        skippedCountByReason: countSkipsByReason(skipped),
      },
    });
  }
);

export default app;
