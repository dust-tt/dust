import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { validateSkillReinforcementChange } from "@app/lib/api/skills/reinforcement_change";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { SKILL_REINFORCEMENT_MODES } from "@app/types/assistant/skill_configuration";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { rejectArchivedSkill } from "@front-api/routes/w/[wId]/skills/guards";
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
    selfImprovementCostsCapAwuCredits: z
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
      b.selfImprovementCostsCapMicroUsd !== undefined ||
      b.selfImprovementCostsCapAwuCredits !== undefined,
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

/** @ignoreswagger */
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

    const archivedError = rejectArchivedSkill(ctx, skill);
    if (archivedError) {
      return archivedError;
    }

    const {
      reinforcement,
      selfImprovementLock,
      selfImprovementCostsCapMicroUsd,
      selfImprovementCostsCapAwuCredits,
    } = ctx.req.valid("json");

    // The lock and per-skill caps are admin-only controls.
    const requiresAdmin =
      selfImprovementLock !== undefined ||
      selfImprovementCostsCapMicroUsd !== undefined ||
      selfImprovementCostsCapAwuCredits !== undefined;
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

    if (reinforcement !== undefined) {
      const validation = await validateSkillReinforcementChange(auth, skill, {
        reinforcement,
      });
      if (validation.isErr()) {
        switch (validation.error.code) {
          case "not_authorized":
            return apiError(ctx, {
              status_code: 403,
              api_error: {
                type: "app_auth_error",
                message: validation.error.message,
              },
            });
          case "locked":
            return apiError(ctx, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message: validation.error.message,
              },
            });
          case "archived":
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: validation.error.message,
              },
            });
          default:
            assertNever(validation.error.code);
        }
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
    if (selfImprovementCostsCapAwuCredits !== undefined) {
      await skill.updateSelfImprovementCostsCapAwuCredits(
        selfImprovementCostsCapAwuCredits
      );
    }

    return ctx.json({ skill: skill.toJSON(auth) });
  }
);

export default app;
