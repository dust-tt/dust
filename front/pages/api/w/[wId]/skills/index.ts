import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isBuilder } from "@app/types";
import type {
  SkillConfigurationRelations,
  SkillConfigurationType,
} from "@app/types/assistant/skill_configuration";

export type GetSkillConfigurationsResponseBody = {
  skillConfigurations: SkillConfigurationType[];
};

export type GetSkillConfigurationsWithRelationsResponseBody = {
  skillConfigurations: (SkillConfigurationType & SkillConfigurationRelations)[];
};

export type PostSkillConfigurationResponseBody = {
  skillConfiguration: SkillConfigurationType;
};

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
    WithAPIErrorResponse<
      | GetSkillConfigurationsResponseBody
      | GetSkillConfigurationsWithRelationsResponseBody
      | PostSkillConfigurationResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (!isBuilder(owner)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Skills are not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { withRelations } = req.query;

      const skillConfigurations =
        await SkillResource.fetchAllAvailableSkills(auth);

      if (withRelations === "true") {
        const skillConfigurationsWithRelations = await concurrentExecutor(
          skillConfigurations,
          async (sc) => ({
            ...sc.toJSON(),
            usage: await sc.fetchUsage(auth),
            editors: await sc.listEditors(auth),
          }),
          { concurrency: 10 }
        );

        return res
          .status(200)
          .json({ skillConfigurations: skillConfigurationsWithRelations });
      }

      return res.status(200).json({
        skillConfigurations: skillConfigurations.map((sc) => sc.toJSON()),
      });
    }

    case "POST": {
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

      const existingSkill = await SkillResource.fetchActiveByName(
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
        const skill = await SkillResource.makeNew(
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
          message: "The method passed is not supported, GET or POST expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
