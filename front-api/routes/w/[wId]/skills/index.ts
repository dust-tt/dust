import type {
  GetSkillsResponseBody,
  GetSkillsWithRelationsResponseBody,
  PostSkillResponseBody,
} from "@app/lib/api/skills";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { AttachedKnowledgeSchema } from "@app/lib/api/skills/schemas";
import {
  getReferencedSkillSpaceModelIds,
  resolveAdditionalRequestedSpaceModelIds,
} from "@app/lib/api/skills/space_requirements";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import {
  SKILL_REINFORCEMENT_MODES,
  type SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { removeNulls } from "@app/types/shared/utils/general";
import { isBuilder } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import uniq from "lodash/uniq";
import { z } from "zod";
import skill from "./[sId]";
import detect from "./detect";
import importRoute from "./import";
import reinforcementDailySpend from "./reinforcement_daily_spend";
import reinforcementSpend from "./reinforcement_spend";
import similar from "./similar";

const SkillStatusSchema = z
  .enum(["active", "archived", "suggested"])
  .optional();

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

// Mounted at /api/w/:wId/skills.
const app = workspaceApp();

// Static sub-paths must be registered before the param sub-app.
app.route("/detect", detect);
app.route("/import", importRoute);
app.route("/reinforcement_daily_spend", reinforcementDailySpend);
app.route("/reinforcement_spend", reinforcementSpend);
app.route("/similar", similar);

/** @ignoreswagger */
app.get(
  "/",
  async (
    ctx
  ): HandlerResult<
    GetSkillsResponseBody | GetSkillsWithRelationsResponseBody
  > => {
    const auth = ctx.get("auth");

    // @deprecated viewType query param is ignored — instructions and tools
    // are never returned from the list endpoint. Use GET /skills/:sId for full details.
    const withRelations = ctx.req.query("withRelations");
    const status = ctx.req.query("status");
    const globalSpaceOnly = ctx.req.query("globalSpaceOnly");
    const onlyCustom = ctx.req.query("onlyCustom");
    const isDefault = ctx.req.query("isDefault");

    const statusValidation = SkillStatusSchema.safeParse(status);
    if (!statusValidation.success) {
      return apiError(ctx, {
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
      const extendedSkills = await SkillResource.fetchByIds(
        auth,
        removeNulls(uniq(skills.map((s) => s.extendedSkillId)))
      );
      const usageMap = await SkillResource.batchFetchUsage(auth, skills);
      const editorsMap = await SkillResource.batchListEditors(auth, skills);
      const editedByUsersMap = await SkillResource.batchFetchEditedByUsers(
        auth,
        skills
      );
      const childSkillsMap = await SkillResource.batchFetchChildSkills(
        auth,
        skills
      );
      const usedBySkillsMap = await SkillResource.batchFetchUsedBySkills(
        auth,
        skills
      );

      const extendedSkillsMap = new Map(extendedSkills.map((s) => [s.sId, s]));

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
        const usedBySkills = usedBySkillsMap.get(sc.sId) ?? [];
        const usageWithSkills = {
          ...usage,
          count: usage.count + usedBySkills.length,
          skills: usedBySkills,
        };

        return {
          ...skillWithoutInstructionsAndTools,
          relations: {
            usage: usageWithSkills,
            editors: editors ? editors.map((e) => e.toJSON()) : null,
            editedByUser: editedByUser ? editedByUser.toJSON() : null,
            extendedSkill: sc.extendedSkillId
              ? (extendedSkillsMap.get(sc.extendedSkillId)?.toJSON(auth) ??
                null)
              : null,
            childSkills: (childSkillsMap.get(sc.sId) ?? []).map(
              (childSkill) => {
                const {
                  instructions,
                  instructionsHtml,
                  tools,
                  ...childSkillWithoutInstructionsAndTools
                } = childSkill.toJSON(auth);

                return childSkillWithoutInstructionsAndTools;
              }
            ),
          },
        } satisfies SkillWithoutInstructionsAndToolsWithRelationsType;
      });

      return ctx.json({ skills: skillsWithRelations });
    }

    return ctx.json({
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
);

app.post(
  "/",
  validate("json", PostSkillRequestBodySchema),
  async (ctx): HandlerResult<PostSkillResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    if (!isBuilder(owner)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "User is not a builder.",
        },
      });
    }

    const user = auth.getNonNullableUser();

    const body = ctx.req.valid("json");
    const name = body.name.trim();

    if (!name) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Skill name cannot be empty.",
        },
      });
    }

    const existingSkill = await SkillResource.fetchActiveByName(auth, name);

    if (existingSkill) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `A skill with the name "${name}" already exists.`,
        },
      });
    }

    // Validate all MCP server views exist before creating anything.
    const mcpServerViewIds = uniq(body.tools.map((t) => t.mcpServerViewId));
    const mcpServerViews = await MCPServerViewResource.fetchByIds(
      auth,
      mcpServerViewIds
    );

    if (mcpServerViewIds.length !== mcpServerViews.length) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: `MCP server views not all found, ${mcpServerViews.length} found, ${mcpServerViewIds.length} requested`,
        },
      });
    }

    const { attachedKnowledge, fileAttachments } = body;

    const dataSourceViewIds = uniq(
      attachedKnowledge.map((attachment) => attachment.dataSourceViewId)
    );

    const dataSourceViews = await DataSourceViewResource.fetchByIds(
      auth,
      dataSourceViewIds
    );
    if (dataSourceViews.length !== dataSourceViewIds.length) {
      return apiError(ctx, {
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
    const referencedSkillSpaceIds = await getReferencedSkillSpaceModelIds(
      auth,
      body.instructions
    );

    const additionalRequestedSpaceIdsRes =
      await resolveAdditionalRequestedSpaceModelIds(
        auth,
        body.additionalRequestedSpaceIds
      );

    if (additionalRequestedSpaceIdsRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: additionalRequestedSpaceIdsRes.error.message,
        },
      });
    }

    const requestedSpaceIds = uniq([
      ...computedRequestedSpaceIds,
      ...referencedSkillSpaceIds,
      ...additionalRequestedSpaceIdsRes.value,
    ]);

    const extendedSkill = body.extendedSkillId
      ? await SkillResource.fetchById(auth, body.extendedSkillId)
      : null;

    // Only global skills can be extended.
    if (extendedSkill !== null && !extendedSkill.isExtendable) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `The extended skill with id "${body.extendedSkillId}" cannot be extended.`,
        },
      });
    }

    // Validate file attachments if provided.
    let files: FileResource[] | undefined;
    if (fileAttachments) {
      const fileAttachmentIds = uniq(fileAttachments.map((f) => f.fileId));
      files = await FileResource.fetchByIds(auth, fileAttachmentIds);
      if (files.length !== fileAttachmentIds.length) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: `File attachments not all found, ${files.length} found, ${fileAttachmentIds.length} requested`,
          },
        });
      }

      for (const file of files) {
        if (!file.isReady || file.useCase !== "skill_attachment") {
          return apiError(ctx, {
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

    const newSkill = await SkillResource.makeNew(
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
      }
    );

    // Update file useCaseMetadata with the newly created skill's sId.
    if (files) {
      await FileResource.bulkSetUseCaseMetadata(auth, files, {
        skillId: newSkill.sId,
      });
    }

    return ctx.json({ skill: newSkill.toJSON(auth) });
  }
);

// Per-skill operations: mounted at /:sId so child routes can read it.
app.route("/:sId", skill);

export default app;
