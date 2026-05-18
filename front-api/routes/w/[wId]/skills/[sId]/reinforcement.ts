import { Hono } from "hono";
import { z } from "zod";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { SKILL_REINFORCEMENT_MODES } from "@app/types/assistant/skill_configuration";
import { isString } from "@app/types/shared/utils/general";

import { validate } from "@front-api/middleware/validator";

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

// Mounted at /api/w/:wId/skills/:sId/reinforcement.
const app = new Hono();

app.patch(
  "/",
  validate("json", PatchSkillReinforcementBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const sId = c.req.param("sId");

    if (!isString(sId)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Invalid skill ID.",
          },
        },
        400
      );
    }

    const skill = await SkillResource.fetchById(auth, sId);
    if (!skill) {
      return c.json(
        {
          error: {
            type: "skill_not_found",
            message: "The skill you're trying to access was not found.",
          },
        },
        404
      );
    }

    const {
      reinforcement,
      selfImprovementLock,
      selfImprovementCostsCapMicroUsd,
    } = c.req.valid("json");

    // The lock and per-skill cap are admin-only controls.
    const requiresAdmin =
      selfImprovementLock !== undefined ||
      selfImprovementCostsCapMicroUsd !== undefined;
    if (requiresAdmin && !auth.isAdmin()) {
      return c.json(
        {
          error: {
            type: "workspace_auth_error",
            message:
              "Only admins can change the lock state or per-skill cost cap.",
          },
        },
        403
      );
    }

    // Toggling reinforcement requires editor access; if the skill is locked,
    // only admins can flip it.
    if (reinforcement !== undefined) {
      if (!skill.canWrite(auth)) {
        return c.json(
          {
            error: {
              type: "app_auth_error",
              message: "Only editors can modify this skill.",
            },
          },
          403
        );
      }
      if (skill.selfImprovementLock && !auth.isAdmin()) {
        return c.json(
          {
            error: {
              type: "workspace_auth_error",
              message:
                "This skill's self-improvement is locked; only admins can change it.",
            },
          },
          403
        );
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

    return c.json({ skill: skill.toJSON(auth) });
  }
);

export default app;
