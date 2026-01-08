import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import uniq from "lodash/uniq";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { apiError } from "@app/logger/withlogging";
import { AttachedKnowledgeSchema } from "@app/pages/api/w/[wId]/skills";
import type { WithAPIErrorResponse } from "@app/types";
import { isBuilder, isString } from "@app/types";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

export type GetSkillResponseBody = {
  skill: SkillType;
};

export type GetSkillWithRelationsResponseBody = {
  skill: SkillWithRelationsType;
};

export type PatchSkillResponseBody = {
  skill: Omit<
    SkillType,
    | "author"
    | "requestedSpaceIds"
    | "workspaceId"
    | "createdAt"
    | "updatedAt"
    | "authorId"
  >;
};

export type DeleteSkillResponseBody = {
  success: boolean;
};

// Request body schema for PATCH
const PatchSkillRequestBodySchema = t.type({
  name: t.string,
  agentFacingDescription: t.string,
  userFacingDescription: t.string,
  instructions: t.string,
  icon: t.union([t.string, t.null]),
  tools: t.array(
    t.type({
      mcpServerViewId: t.string,
    })
  ),
  attachedKnowledge: t.array(AttachedKnowledgeSchema),
});

type PatchSkillRequestBody = t.TypeOf<typeof PatchSkillRequestBodySchema>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSkillResponseBody
      | GetSkillWithRelationsResponseBody
      | PatchSkillResponseBody
      | DeleteSkillResponseBody
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

      const skill = skillResource.toJSON(auth);

      if (withRelations === "true") {
        const usage = await skillResource.fetchUsage(auth);
        const editors = await skillResource.listEditors(auth);
        const author = await skillResource.fetchAuthor(auth);
        const extendedSkill = skill.extendedSkillId
          ? await SkillResource.fetchById(auth, skill.extendedSkillId)
          : null;

        const skillWithRelations: SkillWithRelationsType = {
          ...skill,
          relations: {
            usage,
            editors: editors ? editors.map((e) => e.toJSON()) : null,
            author: author ? author.toJSON() : null,
            extendedSkill: extendedSkill ? extendedSkill.toJSON(auth) : null,
          },
        };

        return res.status(200).json({
          skill: skillWithRelations,
        });
      }
      return res.status(200).json({ skill });
    }

    case "PATCH": {
      const bodyValidation = PatchSkillRequestBodySchema.decode(req.body);

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

      const body: PatchSkillRequestBody = bodyValidation.right;

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

      // Check for existing active skill with the same name (excluding current skill).
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

      // Validate MCP server view IDs.
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

      // Fetch MCP server views first to compute requestedSpaceIds.
      const mcpServerViewIds = uniq(body.tools.map((t) => t.mcpServerViewId));
      const mcpServerViews = await MCPServerViewResource.fetchByIds(
        auth,
        mcpServerViewIds
      );

      if (mcpServerViewIds.length !== mcpServerViews.length) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: `MCP server views not all found, ${mcpServerViews.length} found, ${mcpServerViewIds.length} requested`,
          },
        });
      }

      const requestedSpaceIds =
        await MCPServerViewResource.listSpaceRequirementsByIds(
          auth,
          mcpServerViewIds
        );

      // Validate all data source views from attached knowledge exist and user has access.
      const { attachedKnowledge } = body;
      const dataSourceViewIds = uniq(
        attachedKnowledge.map((attachment) => attachment.dataSourceViewId)
      );

      const dataSourceViews = await DataSourceViewResource.fetchByIds(
        auth,
        dataSourceViewIds
      );
      if (dataSourceViews.length !== dataSourceViewIds.length) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: `Data source views not all found, ${dataSourceViews.length} found, ${dataSourceViewIds.length} requested`,
          },
        });
      }

      const dataSourceViewIdMap = new Map(
        dataSourceViews.map((dsv) => [dsv.sId, dsv])
      );

      const attachedKnowledgeWithDataSourceViews = attachedKnowledge.map(
        (attachment) => ({
          dataSourceView: dataSourceViewIdMap.get(attachment.dataSourceViewId)!,
          nodeId: attachment.nodeId,
        })
      );

      await skillResource.updateSkill(auth, {
        agentFacingDescription: body.agentFacingDescription,
        attachedKnowledge: attachedKnowledgeWithDataSourceViews,
        icon: body.icon,
        instructions: body.instructions,
        mcpServerViews,
        name: body.name,
        requestedSpaceIds,
        userFacingDescription: body.userFacingDescription,
      });

      return res.status(200).json({
        skill: skillResource.toJSON(auth),
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
