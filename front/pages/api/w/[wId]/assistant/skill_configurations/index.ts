import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillConfigurationResource } from "@app/lib/resources/skill/skill_configuration_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isGlobalAgentId, isString } from "@app/types";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

export type PostSkillConfigurationResponseBody = {
  skillConfiguration: SkillConfigurationType;
};

export interface GetAgentSkillsResponseBody {
  skills: SkillConfigurationType[];
}

// Request body schema for POST
const PostSkillConfigurationRequestBodySchema = t.type({
  name: t.string,
  description: t.string,
  instructions: t.string,
  tools: t.array(
    t.type({
      mcpServerViewId: t.string,
    })
  ),
});

type PostSkillConfigurationRequestBody = t.TypeOf<
  typeof PostSkillConfigurationRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | WithAPIErrorResponse<PostSkillConfigurationResponseBody>
    | WithAPIErrorResponse<GetAgentSkillsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Skill builder is not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { aId } = req.query;
      if (!isString(aId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid agent configuration ID.",
          },
        });
      }

      const agent = await getAgentConfiguration(auth, {
        agentId: aId,
        variant: "light",
      });
      if (!agent) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent configuration was not found.",
          },
        });
      }

      if (isGlobalAgentId(agent.sId)) {
        // TODO(skills 2025-12-09): Implement fetching skills for global agents.
        return res.status(200).json({
          skills: [],
        });
      }

      const skills =
        await SkillConfigurationResource.fetchByAgentConfigurationId(
          auth,
          agent.id
        );

      return res.status(200).json({
        skills: skills.map((s) => s.toJSON()),
      });
    }
    case "POST": {
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only users that are `builders` for the current workspace can manage skills.",
          },
        });
      }

      const user = auth.getNonNullableUser();

      const bodyValidation = PostSkillConfigurationRequestBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const body: PostSkillConfigurationRequestBody = bodyValidation.right;

      const existingSkill = await SkillConfigurationResource.fetchActiveByName(
        auth,
        body.name
      );

      if (existingSkill) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `A skill with the name "${body.name}" already exists.`,
          },
        });
      }

      // Validate all MCP server views exist before creating anything
      const mcpServerViews: MCPServerViewResource[] = [];
      for (const tool of body.tools) {
        const mcpServerView = await MCPServerViewResource.fetchById(
          auth,
          tool.mcpServerViewId
        );
        if (!mcpServerView) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: `MCP server view not found ${tool.mcpServerViewId}`,
            },
          });
        }
        mcpServerViews.push(mcpServerView);
      }

      // Use a transaction to ensure all creates succeed or all are rolled back
      const skillConfiguration = await withTransaction(async (transaction) => {
        const skill = await SkillConfigurationResource.makeNew(
          {
            workspaceId: owner.id,
            version: 0,
            status: "active",
            name: body.name,
            description: body.description,
            instructions: body.instructions,
            authorId: user.id,
            // TODO(skills): add space restrictions.
            requestedSpaceIds: [],
          },
          { transaction }
        );

        await GroupResource.makeNewSkillEditorsGroup(auth, skill, {
          transaction,
        });

        // Create MCP server configurations (tools) for this skill
        for (const mcpServerView of mcpServerViews) {
          // TODO(skills 2025-12-09): move this to the makeNew.
          await SkillMCPServerConfigurationModel.create(
            {
              workspaceId: owner.id,
              skillConfigurationId: skill.id,
              mcpServerViewId: mcpServerView.id,
            },
            { transaction }
          );
        }

        return skill;
      });

      return res.status(200).json({
        skillConfiguration: {
          ...skillConfiguration.toJSON(),
          tools: body.tools,
        },
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
