import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { SkillConfiguration } from "@app/types/skill_configuration";

export type PostSkillConfigurationResponseBody = {
  skillConfiguration: Omit<
    SkillConfiguration,
    | "author"
    | "requestedSpaceIds"
    | "workspaceId"
    | "createdAt"
    | "updatedAt"
    | "authorId"
  >;
};

// Request body schema for POST
const PostSkillConfigurationRequestBodySchema = t.type({
  name: t.string,
  description: t.string,
  instructions: t.string,
  scope: t.union([t.literal("private"), t.literal("workspace")]),
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
    WithAPIErrorResponse<PostSkillConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

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
    case "POST": {
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

      // Check for existing active skill with the same name.
      // TODO(skills): consolidate this kind of db interaction within a resource.
      const existingSkill = await SkillConfigurationModel.findOne({
        where: {
          workspaceId: owner.id,
          name: body.name,
          status: "active",
        },
      });

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
        const skill = await SkillConfigurationModel.create(
          {
            workspaceId: owner.id,
            version: 0,
            status: "active",
            scope: body.scope,
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
          id: skillConfiguration.id,
          sId: makeSId("skill", {
            id: skillConfiguration.id,
            workspaceId: skillConfiguration.workspaceId,
          }),
          name: skillConfiguration.name,
          description: skillConfiguration.description,
          instructions: skillConfiguration.instructions,
          status: skillConfiguration.status,
          scope: skillConfiguration.scope,
          version: skillConfiguration.version,
          tools: body.tools,
        },
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
