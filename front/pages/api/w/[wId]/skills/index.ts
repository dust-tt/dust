/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { resolveAdditionalRequestedSpaceModelIds } from "@app/lib/api/skills/space_requirements";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import {
  SKILL_REINFORCEMENT_MODES,
  type SkillType,
  type SkillWithoutInstructionsAndToolsType,
  type SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { removeNulls } from "@app/types/shared/utils/general";
import { isBuilder } from "@app/types/user";
import uniq from "lodash/uniq";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type GetSkillsResponseBody = {
  skills: SkillWithoutInstructionsAndToolsType[];
};

export type GetSkillsWithRelationsResponseBody = {
  skills: SkillWithoutInstructionsAndToolsWithRelationsType[];
};

export type PostSkillResponseBody = {
  skill: SkillType;
};

const SkillStatusSchema = z
  .enum(["active", "archived", "suggested"])
  .optional();

// Schema for attached knowledge.
export const AttachedKnowledgeSchema = z.object({
  dataSourceViewId: z.string(),
  nodeId: z.string(),
  spaceId: z.string(),
  title: z.string(),
});

// Request body schema for POST.
const PostSkillRequestBodySchema = z.intersection(
  z.object({
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
    extendedSkillId: z.string().nullable(),
    attachedKnowledge: z.array(AttachedKnowledgeSchema),
    instructionsHtml: z.string().nullable(),
    additionalRequestedSpaceIds: z.array(z.string()).optional(),
    fileAttachments: z.array(z.object({ fileId: z.string() })).optional(),
    isDefault: z.boolean().optional(),
    reinforcement: z.enum(SKILL_REINFORCEMENT_MODES).optional(),
  }),
  z.union([
    z.object({
      source: z.literal("github"),
      sourceMetadata: z.object({
        repoUrl: z.string(),
        filePath: z.string(),
      }),
    }),
    z.object({
      source: z.literal("local_file"),
      sourceMetadata: z.object({ filePath: z.string() }).nullable(),
    }),
    z.object({
      source: z.literal("web_app").optional(),
      sourceMetadata: z.null().optional(),
    }),
  ])
);

type PostSkillRequestBody = z.infer<typeof PostSkillRequestBodySchema>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSkillsResponseBody
      | GetSkillsWithRelationsResponseBody
      | PostSkillResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET": {
      // @deprecated viewType query param is ignored — instructions and tools
      // are never returned from the list endpoint. Use GET /skills/:sId for full details.
      const { withRelations, status, globalSpaceOnly, onlyCustom, isDefault } =
        req.query;

      const statusValidation = SkillStatusSchema.safeParse(status);
      if (!statusValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid status: ${status}. Expected "active", "archived", or "suggested".`,
          },
        });
      }
      const skillStatus = statusValidation.data;

      const skills = await SkillResource.listByWorkspace(auth, {
        status: skillStatus,
        globalSpaceOnly: globalSpaceOnly === "true",
        onlyCustom: onlyCustom === "true",
        isDefault: isDefault === "true" ? true : undefined,
        withInstructions: false,
        withTools: false,
      });

      if (withRelations === "true") {
        const [extendedSkills, usageMap, editorsMap, editedByUsersMap] =
          await Promise.all([
            SkillResource.fetchByIds(
              auth,
              removeNulls(uniq(skills.map((skill) => skill.extendedSkillId)))
            ),
            SkillResource.batchFetchUsage(auth, skills),
            SkillResource.batchListEditors(auth, skills),
            SkillResource.batchFetchEditedByUsers(auth, skills),
          ]);

        const extendedSkillsMap = new Map(
          extendedSkills.map((skill) => [skill.sId, skill])
        );

        const skillsWithRelations = skills.map((sc) => {
          const {
            instructions,
            instructionsHtml,
            tools,
            ...skillWithoutInstructionsAndTools
          } = sc.toJSON(auth);

          const usage = usageMap.get(sc.sId) ?? { count: 0, agents: [] };
          const editors = editorsMap.get(sc.sId) ?? null;
          const editedByUser = editedByUsersMap.get(sc.sId) ?? null;

          return {
            ...skillWithoutInstructionsAndTools,
            relations: {
              usage,
              editors: editors ? editors.map((e) => e.toJSON()) : null,
              editedByUser: editedByUser ? editedByUser.toJSON() : null,
              extendedSkill: sc.extendedSkillId
                ? (extendedSkillsMap.get(sc.extendedSkillId)?.toJSON(auth) ??
                  null)
                : null,
            },
          } satisfies SkillWithoutInstructionsAndToolsWithRelationsType;
        });

        return res.status(200).json({ skills: skillsWithRelations });
      }

      return res.status(200).json({
        skills: skills.map((sc) => {
          const {
            instructions,
            instructionsHtml,
            tools,
            ...skillWithoutInstructionsAndTools
          } = sc.toJSON(auth);

          return skillWithoutInstructionsAndTools;
        }),
      });
    }

    case "POST": {
      if (!isBuilder(owner)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "User is not a builder.",
          },
        });
      }

      const user = auth.getNonNullableUser();

      const bodyValidation = PostSkillRequestBodySchema.safeParse(req.body);

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

      const body: PostSkillRequestBody = bodyValidation.data;
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

      const existingSkill = await SkillResource.fetchActiveByName(auth, name);

      if (existingSkill) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `A skill with the name "${name}" already exists.`,
          },
        });
      }

      // Validate all MCP server views exist before creating anything
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

      const requestedSpaceIds = uniq([
        ...computedRequestedSpaceIds,
        ...additionalRequestedSpaceIdsRes.value,
      ]);

      const extendedSkill = body.extendedSkillId
        ? await SkillResource.fetchById(auth, body.extendedSkillId)
        : null;

      // Only global skills can be extended.
      if (extendedSkill !== null && !extendedSkill.isExtendable) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The extended skill with id "${body.extendedSkillId}" cannot be extended.`,
          },
        });
      }

      const featureFlags = await getFeatureFlags(auth);
      const enableSkillReferences = featureFlags.includes("nested_skills");
      if (enableSkillReferences) {
        const skillReferenceValidation =
          SkillResource.getValidatedSkillReferenceModelIds(auth, {
            instructions: body.instructions,
          });

        if (skillReferenceValidation.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: skillReferenceValidation.error.message,
            },
          });
        }
      }

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

      // Generate icon suggestion if not provided.
      let icon = body.icon;
      if (!icon) {
        const iconResult = await getSkillIconSuggestion(auth, {
          name,
          instructions: body.instructions,
          agentFacingDescription: body.agentFacingDescription,
        });
        if (iconResult.isOk()) {
          icon = iconResult.value;
        } else {
          logger.warn(
            { error: iconResult.error },
            "Failed to generate icon suggestion for skill"
          );
          icon = "ActionListIcon";
        }
      }

      const skill = await SkillResource.makeNew(
        auth,
        {
          status: "active",
          name,
          agentFacingDescription: body.agentFacingDescription,
          userFacingDescription: body.userFacingDescription,
          instructions: body.instructions,
          instructionsHtml: body.instructionsHtml,
          editedBy: user.id,
          requestedSpaceIds,
          extendedSkillId: body.extendedSkillId,
          icon,
          source: body.source ?? "web_app",
          sourceMetadata: body.sourceMetadata ?? null,
          isDefault: body.isDefault ?? false,
          reinforcement: body.reinforcement ?? "on",
        },
        {
          mcpServerViews,
          attachedKnowledge: attachedKnowledgeWithDataSourceViews,
          fileAttachments: files,
          enableSkillReferences,
        }
      );

      // Update file useCaseMetadata with the newly created skill's sId.
      if (files) {
        await FileResource.bulkSetUseCaseMetadata(auth, files, {
          skillId: skill.sId,
        });
      }

      return res.status(200).json({
        skill: skill.toJSON(auth),
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
