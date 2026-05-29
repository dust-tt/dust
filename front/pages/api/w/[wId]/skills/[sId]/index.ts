/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { resolveAdditionalRequestedSpaceModelIds } from "@app/lib/api/skills/space_requirements";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { pruneOutdatedSkillEditSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { AttachedKnowledgeSchema } from "@app/pages/api/w/[wId]/skills";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import { isString } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

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
    | "editedBy"
  >;
};

export type DeleteSkillResponseBody = {
  success: boolean;
};

// Request body schema for PATCH.
const PatchSkillRequestBodySchema = z.object({
  name: z.string(),
  agentFacingDescription: z.string(),
  userFacingDescription: z.string(),
  instructions: z.string(),
  icon: z.string().nullable(),
  tools: z.array(
    z.object({
      mcpServerViewId: z.string(),
    })
  ),
  attachedKnowledge: z.array(AttachedKnowledgeSchema),
  instructionsHtml: z.string().nullable(),
  additionalRequestedSpaceIds: z.array(z.string()).optional(),
  fileAttachments: z.array(z.object({ fileId: z.string() })).optional(),
  isDefault: z.boolean().optional(),
  reinforcement: z.enum(["auto", "on", "off"]).optional(),
});

type PatchSkillRequestBody = z.infer<typeof PatchSkillRequestBodySchema>;

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
    case "GET": {
      const { withRelations } = req.query;

      const serializedSkill = skill.toJSON(auth);

      if (withRelations === "true") {
        const usage = await skill.fetchUsage(auth);
        const editors = await skill.listEditors(auth);
        const editedByUser = await skill.fetchEditedByUser(auth);
        const extendedSkill = serializedSkill.extendedSkillId
          ? await SkillResource.fetchById(auth, serializedSkill.extendedSkillId)
          : null;

        const skillWithRelations: SkillWithRelationsType = {
          ...serializedSkill,
          relations: {
            usage,
            editors: editors ? editors.map((e) => e.toJSON()) : null,
            editedByUser: editedByUser ? editedByUser.toJSON() : null,
            extendedSkill: extendedSkill ? extendedSkill.toJSON(auth) : null,
          },
        };

        return res.status(200).json({
          skill: skillWithRelations,
        });
      }
      return res.status(200).json({ skill: serializedSkill });
    }

    case "PATCH": {
      const bodyValidation = PatchSkillRequestBodySchema.safeParse(req.body);

      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const body: PatchSkillRequestBody = bodyValidation.data;
      const name = body.name.trim();

      if (!name) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Skill name cannot be empty.",
          },
        });
      }

      // Check if user can write.
      if (!skill.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can modify this skill.",
          },
        });
      }

      // Check for existing active skill with the same name (excluding current skill).
      const existingSkill = await SkillResource.fetchActiveByName(auth, name);

      if (existingSkill && existingSkill.id !== skill.id) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `A skill with the name "${name}" already exists.`,
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

      const { attachedKnowledge, fileAttachments } = body;

      // Validate all data source views from attached knowledge exist and user has access.
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

      const computedRequestedSpaceIds =
        await SkillResource.computeRequestedSpaceIds(auth, {
          mcpServerViews,
          attachedKnowledge: attachedKnowledgeWithDataSourceViews,
        });

      let additionalRequestedSpaceIds: ModelId[];

      if (body.additionalRequestedSpaceIds !== undefined) {
        const additionalRequestedSpaceIdsRes =
          await resolveAdditionalRequestedSpaceModelIds(
            auth,
            body.additionalRequestedSpaceIds
          );

        if (additionalRequestedSpaceIdsRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: additionalRequestedSpaceIdsRes.error.message,
            },
          });
        }

        additionalRequestedSpaceIds = additionalRequestedSpaceIdsRes.value;
      } else {
        const previousAttachedKnowledge =
          await skill.getAttachedKnowledge(auth);
        const previousComputedRequestedSpaceIds =
          await SkillResource.computeRequestedSpaceIds(auth, {
            mcpServerViews: skill.mcpServerViews,
            attachedKnowledge: previousAttachedKnowledge,
          });
        const previousComputedRequestedSpaceIdsSet = new Set(
          previousComputedRequestedSpaceIds
        );

        additionalRequestedSpaceIds = skill.requestedSpaceIds.filter(
          (spaceId) => !previousComputedRequestedSpaceIdsSet.has(spaceId)
        );
      }

      const requestedSpaceIds = uniq([
        ...computedRequestedSpaceIds,
        ...additionalRequestedSpaceIds,
      ]);

      const featureFlags = await getFeatureFlags(auth);

      // Validate file attachments if provided (gated behind sandbox_tools).
      let files: FileResource[] | undefined;
      if (fileAttachments) {
        if (
          !featureFlags.includes("sandbox_tools") &&
          fileAttachments.length > 0
        ) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message: "File attachments are not supported.",
            },
          });
        }

        const fileAttachmentIds = uniq(fileAttachments.map((f) => f.fileId));
        files = await FileResource.fetchByIds(auth, fileAttachmentIds);
        if (files.length !== fileAttachmentIds.length) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: `File attachments not all found, ${files.length} found, ${fileAttachmentIds.length} requested`,
            },
          });
        }

        for (const file of files) {
          if (!file.isReady || file.useCase !== "skill_attachment") {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: `File ${file.sId} is not ready or not a skill_attachment.`,
              },
            });
          }
        }
      }

      // When saving a suggested skill, automatically activate it.
      const shouldActivate = skill.status === "suggested";

      if (shouldActivate) {
        logger.info(
          {
            skillId: skill.sId,
            workspaceId: owner.sId,
          },
          "Suggested skill accepted"
        );
      }

      await skill.updateSkill(auth, {
        agentFacingDescription: body.agentFacingDescription,
        attachedKnowledge: attachedKnowledgeWithDataSourceViews,
        fileAttachments: files,
        icon: body.icon,
        instructions: body.instructions,
        instructionsHtml: body.instructionsHtml,
        isDefault: body.isDefault,
        mcpServerViews,
        name,
        reinforcement: body.reinforcement,
        requestedSpaceIds,
        enableSkillReferences: featureFlags.includes("nested_skills"),
        userFacingDescription: body.userFacingDescription,
        ...(shouldActivate ? { status: "active" as const } : {}),
      });

      await pruneOutdatedSkillEditSuggestions(auth, skill);

      return res.status(200).json({
        skill: skill.toJSON(auth),
      });
    }

    case "DELETE": {
      // Check if user can write.
      if (!skill.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can delete this skill.",
          },
        });
      }

      if (skill.status === "suggested") {
        logger.info(
          {
            skillId: skill.sId,
            workspaceId: owner.sId,
          },
          "Suggested skill rejected"
        );
      }

      await skill.archive(auth);

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
