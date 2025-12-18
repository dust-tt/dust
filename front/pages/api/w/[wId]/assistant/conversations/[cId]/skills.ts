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
import { normalizeError } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export type FetchConversationSkillsResponse = {
  skills: SkillType[];
};

const ConversationSkillActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  skill_id: z.string(),
  agent_configuration_id: z.string().nullable().optional(),
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
  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;
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
      try {
        const conversationSkills = await SkillResource.fetchConversationSkills(
          auth,
          conversationWithoutContent.id
        );

        const skills: SkillType[] = [];
        for (const conversationSkill of conversationSkills) {
          let skillId: string;
          if (conversationSkill.globalSkillId) {
            skillId = conversationSkill.globalSkillId;
          } else if (conversationSkill.customSkillId) {
            skillId = SkillResource.modelIdToSId({
              id: conversationSkill.customSkillId,
              workspaceId: conversationSkill.workspaceId,
            });
          } else {
            continue;
          }

          const skillRes = await SkillResource.fetchById(auth, skillId);
          if (skillRes) {
            skills.push(skillRes.toJSON(auth));
          }
        }

        res.status(200).json({ skills });
      } catch (error) {
        logger.error(
          {
            error: normalizeError(error),
            conversationId,
            workspaceId: req.query.wId,
          },
          "Error fetching conversation skills"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch conversation skills",
          },
        });
      }
      break;

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

      const { action, skill_id, agent_configuration_id } = parseResult.data;

      try {
        const skillRes = await SkillResource.fetchById(auth, skill_id);

        if (!skillRes) {
          logger.error(
            {
              skillId: skill_id,
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
          agentConfigurationId: agent_configuration_id ?? null,
        });
        if (r.isErr()) {
          logger.error(
            {
              error: r.error,
              skillId: skill_id,
              conversationId,
              agentConfigurationId: agent_configuration_id,
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

        res.status(200).json({ success: true });
      } catch (error) {
        logger.error(
          {
            error: normalizeError(error),
            skillId: skill_id,
            conversationId,
            agentConfigurationId: agent_configuration_id,
            action,
            workspaceId: req.query.wId,
          },
          "Error updating conversation skills"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to update conversation skills",
          },
        });
      }
      break;

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
