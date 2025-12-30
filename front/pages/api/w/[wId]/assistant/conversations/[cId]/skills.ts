import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export type FetchConversationSkillsResponse = {
  skills: SkillType[];
};

const ConversationSkillActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  skillId: z.string(),
});

export type ConversationSkillActionRequest = z.infer<
  typeof ConversationSkillActionRequestSchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<FetchConversationSkillsResponse | { success: boolean }>
  >,
  auth: Authenticator
): Promise<void> {
  const conversationId = req.query.cId;

  if (!isString(conversationId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversationWithoutContent = conversationRes.value;

  switch (req.method) {
    case "GET":
      const conversationSkills =
        await SkillResource.fetchConversationSkillRecords(
          auth,
          conversationWithoutContent.id
        );

      const { customSkillModelIds, globalSkillIds } =
        conversationSkills.reduce<{
          customSkillModelIds: number[];
          globalSkillIds: string[];
        }>(
          (acc, conversationSkill) => {
            if (conversationSkill.globalSkillId) {
              acc.globalSkillIds.push(conversationSkill.globalSkillId);
            } else if (conversationSkill.customSkillId) {
              acc.customSkillModelIds.push(conversationSkill.customSkillId);
            }
            return acc;
          },
          { customSkillModelIds: [], globalSkillIds: [] }
        );

      const [customSkills, globalSkills] = await Promise.all([
        SkillResource.fetchByModelIds(auth, customSkillModelIds),
        SkillResource.fetchByIds(auth, globalSkillIds),
      ]);

      const skills: SkillType[] = [...customSkills, ...globalSkills].map(
        (skill) => skill.toJSON(auth)
      );

      return res.status(200).json({ skills });

    case "POST":
      const parseResult = ConversationSkillActionRequestSchema.safeParse(
        req.body
      );

      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(parseResult.error).toString(),
          },
        });
      }

      const { action, skillId } = parseResult.data;

      const skillRes = await SkillResource.fetchById(auth, skillId);

      if (!skillRes) {
        logger.error(
          {
            skillId,
            conversationId,
            workspaceId: req.query.wId,
          },
          "Skill not found"
        );
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "skill_not_found",
            message: "Skill not found",
          },
        });
      }

      const r = await SkillResource.upsertConversationSkills(auth, {
        conversationId: conversationWithoutContent.id,
        skills: [skillRes],
        enabled: action === "add",
      });
      if (r.isErr()) {
        logger.error(
          {
            error: r.error,
            skillId,
            conversationId,
            action,
            workspaceId: req.query.wId,
          },
          "Failed to upsert skill to conversation"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to add skill to conversation",
          },
        });
      }

      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or POST expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
