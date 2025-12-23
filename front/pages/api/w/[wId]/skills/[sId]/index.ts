import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getRequestedSpaceIdsFromMCPServerViewIds } from "@app/lib/api/assistant/permissions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { Err, isBuilder, isString, Ok } from "@app/types";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

export type GetSkillConfigurationResponseBody = {
  skillConfiguration: SkillType;
};

export type GetSkillWithRelationsResponseBody = {
  skill: SkillWithRelationsType;
};

export type PatchSkillConfigurationResponseBody = {
  skillConfiguration: Omit<
    SkillType,
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

type PatchSkillConfigurationRequestBody = t.TypeOf<
  typeof PatchSkillConfigurationRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSkillConfigurationResponseBody
      | GetSkillWithRelationsResponseBody
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

  if (!isBuilder(owner)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  }

  if (!isString(req.query.sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const sId = req.query.sId;
  const skillResource = await SkillResource.fetchById(auth, sId);

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
      const { withRelations } = req.query;

      const skillConfiguration = skillResource.toJSON(auth);

      if (withRelations === "true") {
        const usage = await skillResource.fetchUsage(auth);
        const editors = await skillResource.listEditors(auth);
        const author = await skillResource.fetchAuthor(auth);
        const extendedSkill = skillConfiguration.extendedSkillId
          ? await SkillResource.fetchById(
              auth,
              skillConfiguration.extendedSkillId
            )
          : null;

        const skillConfigurationWithRelations: SkillWithRelationsType = {
          ...skillConfiguration,
          relations: {
            usage,
            editors: editors ? editors.map((e) => e.toJSON()) : null,
            mcpServerViews: skillResource.mcpServerViews.map((view) =>
              view.toJSON()
            ),
            author: author ? author.toJSON() : null,
            extendedSkill: extendedSkill ? extendedSkill.toJSON(auth) : null,
          },
        };

        return res.status(200).json({
          skill: skillConfigurationWithRelations,
        });
      }
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

      // Check if user can write.
      if (!skillResource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can modify this skill.",
          },
        });
      }

      // Check for existing active skill with the same name (excluding current skill)
      const existingSkill = await SkillResource.fetchActiveByName(
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

      // Fetch MCP server views first to compute requestedSpaceIds
      const mcpServerViewIds = body.tools.map((t) => t.mcpServerViewId);
      const mcpServerViews = await MCPServerViewResource.fetchByIds(
        auth,
        mcpServerViewIds
      );

      if (mcpServerViewIds.length !== mcpServerViews.length) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `MCP server views not all found, ${mcpServerViews.length} found, ${mcpServerViewIds.length} requested`,
          },
        });
      }

      const requestedSpaceIds = await getRequestedSpaceIdsFromMCPServerViewIds(
        auth,
        mcpServerViewIds
      );

      // Wrap everything in a transaction to avoid inconsistent state.
      const result = await withTransaction(async (transaction) => {
        const updateResult = await skillResource.updateSkill(
          auth,
          {
            name: body.name,
            agentFacingDescription: body.agentFacingDescription,
            // TODO(skills 2025-12-12): insert an LLM-generated description if missing.
            userFacingDescription: body.userFacingDescription ?? "",
            instructions: body.instructions,
            icon: body.icon,
            requestedSpaceIds,
          },
          { transaction }
        );

        if (updateResult.isErr()) {
          return new Err(new Error(updateResult.error.message));
        }

        const updatedSkill = updateResult.value;

        await updatedSkill.updateTools(
          auth,
          {
            mcpServerViews,
          },
          { transaction }
        );

        return new Ok({
          updatedSkill,
          createdTools: mcpServerViews.map((t) => ({ mcpServerViewId: t.sId })),
        });
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error updating skill: ${result.error.message}`,
          },
        });
      }

      return res.status(200).json({
        skillConfiguration: {
          ...result.value.updatedSkill.toJSON(auth),
          tools: result.value.createdTools,
        },
      });
    }

    case "DELETE": {
      // Check if user can write.
      if (!skillResource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can delete this skill.",
          },
        });
      }

      await skillResource.archive(auth);

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
