/** @ignoreswagger */
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { SKILL_REINFORCEMENT_MODES } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchSkillReinforcementResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { sId } = req.query;
  if (!isString(sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const validation = PatchSkillReinforcementBodySchema.safeParse(req.body);
      if (!validation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(validation.error).toString(),
          },
        });
      }

      const {
        reinforcement,
        selfImprovementLock,
        selfImprovementCostsCapMicroUsd,
      } = validation.data;

      // The lock and per-skill cap are admin-only controls.
      const requiresAdmin =
        selfImprovementLock !== undefined ||
        selfImprovementCostsCapMicroUsd !== undefined;
      if (requiresAdmin && !auth.isAdmin()) {
        return apiError(req, res, {
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
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "app_auth_error",
              message: "Only editors can modify this skill.",
            },
          });
        }
        if (skill.selfImprovementLock && !auth.isAdmin()) {
          return apiError(req, res, {
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
          context: getAuditLogContext(auth, req),
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

      return res.status(200).json({ skill: skill.toJSON(auth) });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
