import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { SKILL_REINFORCEMENT_MODES } from "@app/types/assistant/skill_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PatchSkillReinforcementBodySchema = z
  .object({
    reinforcement: z.enum(SKILL_REINFORCEMENT_MODES).optional(),
    selfImprovementLock: z.boolean().optional(),
    selfImprovementCostsCapMicroUsd: z
      .number()
      .int()
      .nonnegative()
      .nullable() // use default
      .optional(), // not updated
  })
  .refine(
    (b) =>
      b.reinforcement !== undefined ||
      b.selfImprovementLock !== undefined ||
      b.selfImprovementCostsCapMicroUsd !== undefined,
    { message: "At least one field must be provided." }
  );

export type PatchSkillReinforcementResponseBody = {
  skill: SkillType;
};

const ParamsSchema = z.object({
  sId: z.string(),
});

// Mounted at /api/w/:wId/skills/:sId/reinforcement.
const app = workspaceApp();

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchSkillReinforcementBodySchema),
  async (ctx): HandlerResult<PatchSkillReinforcementResponseBody> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");

    const skill = await SkillResource.fetchById(auth, sId);
    if (!skill) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
          message: "The skill you're trying to access was not found.",
        },
      });
    }

    const {
      reinforcement,
      selfImprovementLock,
      selfImprovementCostsCapMicroUsd,
    } = ctx.req.valid("json");

    // The lock and per-skill cap are admin-only controls.
    const requiresAdmin =
      selfImprovementLock !== undefined ||
      selfImprovementCostsCapMicroUsd !== undefined;
    if (requiresAdmin && !auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only admins can change the lock state or per-skill cost cap.",
        },
      });
    }

    // Toggling reinforcement requires editor access; if the skill is locked,
    // only admins can flip it.
    if (reinforcement !== undefined) {
      if (!skill.canWrite(auth)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can modify this skill.",
          },
        });
      }
      if (skill.selfImprovementLock && !auth.isAdmin()) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "This skill's self-improvement is locked; only admins can change it.",
          },
        });
      }
    }

    if (reinforcement !== undefined) {
      await skill.updateReinforcement(reinforcement);

      void emitAuditLogEvent({
        auth,
        action: "skill.self_improvement_updated",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          { type: "skill", id: skill.sId, name: skill.name },
        ],
        context: getAuditLogContext(auth),
        metadata: {
          reinforcement: String(reinforcement),
        },
      });
    }
    if (selfImprovementLock !== undefined) {
      await skill.updateSelfImprovementLock(selfImprovementLock);
    }
    if (selfImprovementCostsCapMicroUsd !== undefined) {
      await skill.updateSelfImprovementCostsCap(
        selfImprovementCostsCapMicroUsd
      );
    }

    return ctx.json({ skill: skill.toJSON(auth) });
  }
);

export default app;
