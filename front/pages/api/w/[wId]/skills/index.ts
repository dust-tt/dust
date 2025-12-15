import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getRequestedSpaceIdsFromMCPServerViewIds } from "@app/lib/api/assistant/permissions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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

// Schema for GET status query parameter
const SkillStatusSchema = t.union([
  t.literal("active"),
  t.literal("archived"),
  t.undefined,
]);

// Request body schema for POST
const PostSkillConfigurationRequestBodySchema = t.type({
  name: t.string,
  agentFacingDescription: t.string,
  userFacingDescription: t.union([t.string, t.null]),
  instructions: t.string,
  icon: t.union([t.string, t.null]),
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
      const { withRelations, status } = req.query;

      const statusValidation = SkillStatusSchema.decode(status);
      if (isLeft(statusValidation)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid status: ${status}. Expected "active" or "archived".`,
          },
        });
      }
      const skillStatus = statusValidation.right;

      const skillConfigurations = await SkillResource.listSkills(auth, {
        status: skillStatus,
      });

      if (withRelations === "true") {
        const skillConfigurationsWithRelations = await concurrentExecutor(
          skillConfigurations,
          async (sc) => {
            const usage = await sc.fetchUsage(auth);
            const editors = await sc.listEditors(auth);
            return {
              ...sc.toJSON(auth),
              usage,
              editors: editors ? editors.map((e) => e.toJSON()) : null,
            } satisfies SkillConfigurationType & SkillConfigurationRelations;
          },
          { concurrency: 10 }
        );

        return res
          .status(200)
          .json({ skillConfigurations: skillConfigurationsWithRelations });
      }

      return res.status(200).json({
        skillConfigurations: skillConfigurations.map((sc) => sc.toJSON(auth)),
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
      const mcpServerViewIds = body.tools.map((t) => t.mcpServerViewId);
      const mcpServerViews: MCPServerViewResource[] = [];
      for (const mcpServerViewId of mcpServerViewIds) {
        const mcpServerView = await MCPServerViewResource.fetchById(
          auth,
          mcpServerViewId
        );
        if (!mcpServerView) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: `MCP server view not found ${mcpServerViewId}`,
            },
          });
        }
        mcpServerViews.push(mcpServerView);
      }

      const requestedSpaceIds = await getRequestedSpaceIdsFromMCPServerViewIds(
        auth,
        mcpServerViewIds
      );

      // Use a transaction to ensure all creates succeed or all are rolled back
      const skillResource = await SkillResource.makeNew(auth, {
        status: "active",
        name: body.name,
        agentFacingDescription: body.agentFacingDescription,
        // TODO(skills 2025-12-12): insert an LLM-generated description if missing.
        userFacingDescription: body.userFacingDescription ?? "",
        instructions: body.instructions,
        authorId: user.id,
        requestedSpaceIds,
      });

      // Create MCP server configurations (tools) for this skill
      for (const mcpServerView of mcpServerViews) {
        // TODO(skills 2025-12-09): move this to the makeNew.
        await SkillMCPServerConfigurationModel.create({
          workspaceId: owner.id,
          skillConfigurationId: skillResource.id,
          mcpServerViewId: mcpServerView.id,
        });
      }

      return res.status(200).json({
        skillConfiguration: {
          ...skillResource.toJSON(auth),
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
