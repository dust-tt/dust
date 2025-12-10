import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { normalizeError } from "@app/types";
import type { SkillConfigurationType } from "@app/types/skill_configuration";

export type GetSkillConfigurationResponseBody = {
  skillConfiguration: SkillConfigurationType;
};

export type PatchSkillConfigurationResponseBody = {
  skillConfiguration: Omit<
    SkillConfigurationType,
    | "author"
    | "requestedSpaceIds"
    | "workspaceId"
    | "createdAt"
    | "updatedAt"
    | "authorId"
  >;
};

export type DeleteSkillConfigurationResponseBody = {
  success: boolean;
};

// Request body schema for PATCH
const PatchSkillConfigurationRequestBodySchema = t.type({
  name: t.string,
  description: t.string,
  instructions: t.string,
  tools: t.array(
    t.type({
      mcpServerViewId: t.string,
    })
  ),
});

type PatchSkillConfigurationRequestBody = t.TypeOf<
  typeof PatchSkillConfigurationRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSkillConfigurationResponseBody
      | PatchSkillConfigurationResponseBody
      | DeleteSkillConfigurationResponseBody
    >
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

  if (typeof req.query.sId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const sId = req.query.sId;
  const skillResource = await SkillConfigurationResource.fetchById(auth, sId);

  if (!skillResource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const skillConfiguration = skillResource.toJSON();
      return res.status(200).json({ skillConfiguration });
    }

    case "PATCH": {
      const bodyValidation = PatchSkillConfigurationRequestBodySchema.decode(
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

      const body: PatchSkillConfigurationRequestBody = bodyValidation.right;

      // Check if user can edit
      if (!skillResource.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can modify this skill.",
          },
        });
      }

      // Check for existing active skill with the same name (excluding current skill)
      const existingSkill = await SkillConfigurationResource.fetchActiveByName(
        auth,
        body.name
      );

      if (existingSkill && existingSkill.id !== skillResource.id) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `A skill with the name "${body.name}" already exists.`,
          },
        });
      }

      // Validate MCP server view IDs
      for (const tool of body.tools) {
        if (!isResourceSId("mcp_server_view", tool.mcpServerViewId)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid MCP server view ID: ${tool.mcpServerViewId}`,
            },
          });
        }
      }

      // Wrap everything in a transaction to avoid inconsistent state
      try {
        const result = await frontSequelize.transaction(async (transaction) => {
          const updateResult = await skillResource.updateSkill(
            auth,
            {
              name: body.name,
              description: body.description,
              instructions: body.instructions,
            },
            { transaction }
          );

          if (updateResult.isErr()) {
            throw new Error(updateResult.error.message);
          }

          const updatedSkill = updateResult.value;

          // Update tools
          const mcpServerViewIds = body.tools.map((t) => t.mcpServerViewId);
          const mcpServerViews = await MCPServerViewResource.fetchByIds(
            auth,
            mcpServerViewIds
          );

          if (mcpServerViewIds.length !== mcpServerViews.length) {
            throw new Error(
              `MCP server views not all found, ${mcpServerViews.length} found, ${mcpServerViewIds.length} requested`
            );
          }

          const toolsResult = await updatedSkill.updateTools(
            auth,
            {
              mcpServerViews,
            },
            { transaction }
          );

          if (toolsResult.isErr()) {
            throw new Error(toolsResult.error.message);
          }

          return { updatedSkill, createdTools: toolsResult.value };
        });

        return res.status(200).json({
          skillConfiguration: {
            ...result.updatedSkill.toJSON(),
            tools: result.createdTools,
          },
        });
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error updating skill: ${normalizeError(error).message}`,
          },
        });
      }
    }

    case "DELETE": {
      // Check if user can edit
      if (!skillResource.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can delete this skill.",
          },
        });
      }

      const deleteResult = await skillResource.delete(auth);
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error deleting skill: ${deleteResult.error.message}`,
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
