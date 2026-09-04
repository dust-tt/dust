import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { AttachedKnowledgeSchema } from "@app/lib/api/skills/schemas";
import {
  getReferencedSkillSpaceModelIds,
  resolveAdditionalRequestedSpaceModelIds,
} from "@app/lib/api/skills/space_requirements";
import { hasFeatureFlag } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type {
  GetSkillsResponseBody,
  GetSkillsWithRelationsResponseBody,
  PostSkillResponseBody,
} from "@app/types/api/skills";
import {
  availabilityFromIsDefault,
  DEFAULT_SKILL_AVAILABILITY,
  SKILL_AVAILABILITIES,
  SKILL_REINFORCEMENT_MODES,
  type SkillAvailability,
} from "@app/types/assistant/skill_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import uniq from "lodash/uniq";
import { z } from "zod";
import skill from "./[sId]";
import archive from "./archive";
import availability from "./availability";
import detect from "./detect";
import importRoute from "./import";
import reinforcementDailySpend from "./reinforcement_daily_spend";
import reinforcementSpend from "./reinforcement_spend";
import similar from "./similar";

const SkillStatusSchema = z
  .enum(["active", "archived", "suggested"])
  .optional();

const SkillAvailabilitiesSchema = z
  .array(z.enum(SKILL_AVAILABILITIES))
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
    attachedKnowledge: z.array(AttachedKnowledgeSchema),
    instructionsHtml: z.string().nullable(),
    additionalRequestedSpaceIds: z.array(z.string()).optional(),
    fileAttachments: z.array(z.object({ fileId: z.string() })).optional(),
    // @deprecated Use availability instead. Kept while old clients still send it.
    isDefault: z.boolean().optional(),
    availability: z.enum(SKILL_AVAILABILITIES).optional(),
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

// isDefault is a deprecated alias; an explicit availability takes priority over it. Returns
// undefined when the caller did not request any availability.
function resolveRequestedAvailability({
  availability,
  isDefault,
}: {
  availability?: SkillAvailability;
  isDefault?: boolean;
}): SkillAvailability | undefined {
  if (availability !== undefined) {
    return availability;
  }
  if (isDefault !== undefined) {
    return availabilityFromIsDefault(isDefault);
  }
  return undefined;
}

// Mounted at /api/w/:wId/skills.
const app = workspaceApp();

// Static sub-paths must be registered before the param sub-app.
app.route("/archive", archive);
app.route("/availability", availability);
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
    const withMessageCount = ctx.req.query("withMessageCount") === "true";
    const status = ctx.req.query("status");
    const globalSpaceOnly = ctx.req.query("globalSpaceOnly");
    const onlyCustom = ctx.req.query("onlyCustom");
    // @deprecated Use availability instead. Kept while old clients still send it.
    const isDefault = ctx.req.query("isDefault");
    const bypassEditorVisibility =
      ctx.req.query("bypassEditorVisibility") === "true";
    // Repeatable: ?availability=workspace_users&availability=users_and_agents.
    const availabilityParams = ctx.req.queries("availability");

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

    const availabilityValidation =
      SkillAvailabilitiesSchema.safeParse(availabilityParams);
    if (!availabilityValidation.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid availability: ${availabilityParams}. Expected "editors", "workspace_users", or "users_and_agents".`,
        },
      });
    }
    // An explicit availability takes priority over the deprecated isDefault alias.
    const availability =
      availabilityValidation.data && availabilityValidation.data.length > 0
        ? availabilityValidation.data
        : isDefault === "true"
          ? ["users_and_agents" as const]
          : undefined;

    // Only admins may list unpublished skills they don't edit (e.g. for governance views).
    if (bypassEditorVisibility && !auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only admins can bypass editor visibility.",
        },
      });
    }

    const allSkills = await SkillResource.listByWorkspace(auth, {
      status: skillStatus,
      globalSpaceOnly: globalSpaceOnly === "true",
      onlyCustom: onlyCustom === "true",
      availability,
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
      permissionFiltering: bypassEditorVisibility
        ? "redact_unreadable"
        : "strict",
    });
    const hasSkillFavorites = await hasFeatureFlag(auth, "skill_favorites");
    let favoriteSkillIds = new Set<string>();
    if (hasSkillFavorites) {
      const favoriteSkills =
        await SkillResource.listFavoritesForCurrentUser(auth);
      favoriteSkillIds = new Set(favoriteSkills.map((skill) => skill.sId));
    }

    const canCreateSkill = await auth.hasWorkspacePermission("create", "skill");

    // Skills with editors-only availability (unpublished) are only listed for members of
    // their editor group. Suggestions are the exception: they are created with an empty
    // editor group, so nobody can write them and the rule would hide them from everyone.
    // They are listed instead to the skill administrators allowed to create skills.
    const skills = bypassEditorVisibility
      ? allSkills
      : allSkills.filter(
          (skill) =>
            skill.availability !== "editors" ||
            skill.canWrite(auth) ||
            (skill.status === "suggested" &&
              canCreateSkill &&
              skill.canAdministrate(auth))
        );

    if (withRelations === "true") {
      const usageMap = await SkillResource.batchFetchUsage(auth, skills);
      let messageCountMap: Map<string, number> | null = null;
      if (withMessageCount) {
        messageCountMap = await SkillResource.batchFetchMessageCounts(
          auth,
          skills.filter((skill) => !skill.isSystemSkill)
        );
      }
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

      const skillsWithRelations = skills.map((sc) => {
        const favoriteState: { isFavorite?: boolean } = hasSkillFavorites
          ? { isFavorite: favoriteSkillIds.has(sc.sId) }
          : {};
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
          ...(messageCountMap
            ? {
                messageCount: sc.isSystemSkill
                  ? null
                  : (messageCountMap.get(sc.sId) ?? 0),
              }
            : {}),
          relations: {
            usage: usageWithSkills,
            editors: editors ? editors.map((e) => e.toJSON()) : null,
            editedByUser: editedByUser ? editedByUser.toJSON() : null,
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
          ...favoriteState,
        } satisfies GetSkillsWithRelationsResponseBody["skills"][number];
      });

      return ctx.json({ skills: skillsWithRelations });
    }

    return ctx.json({
      skills: skills.map((sc) => {
        const favoriteState: { isFavorite?: boolean } = hasSkillFavorites
          ? { isFavorite: favoriteSkillIds.has(sc.sId) }
          : {};
        const {
          instructions,
          instructionsHtml,
          tools,
          ...skillWithoutInstructionsAndTools
        } = sc.toJSON(auth);

        return {
          ...skillWithoutInstructionsAndTools,
          ...favoriteState,
        } satisfies GetSkillsResponseBody["skills"][number];
      }),
    });
  }
);

app.post(
  "/",
  validate("json", PostSkillRequestBodySchema),
  ensureHasWorkspacePermission(
    "create",
    "skill",
    "Creating skills is restricted.",
    "app_auth_error"
  ),
  async (ctx): HandlerResult<PostSkillResponseBody> => {
    const auth = ctx.get("auth");

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

    const requestedAvailability = resolveRequestedAvailability(body);

    // Explicitly creating a skill already published (anything other than editors-only) requires
    // the workspace-level permission to publish skills. The default availability is exempt so
    // plain creation keeps working.
    if (
      requestedAvailability !== undefined &&
      requestedAvailability !== "editors" &&
      !(await auth.hasWorkspacePermission("publish", "skill"))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "You don't have permission to change this skill's availability.",
        },
      });
    }
    if (
      requestedAvailability === "users_and_agents" &&
      !(await auth.hasWorkspacePermission("make_discoverable", "skill"))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "You don't have permission to create a skill with that availability.",
        },
      });
    }

    const availability = requestedAvailability ?? DEFAULT_SKILL_AVAILABILITY;

    const existingSkill = await SkillResource.fetchByName(auth, name);

    if (existingSkill) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `A skill with the name "${name}" already exists.`,
        },
      });
    }

    // Validate all MCP server views exist before creating anything. The views end up on the
    // created skill, whose serialized response includes their tools — fetch the heavy attributes.
    const mcpServerViewIds = uniq(body.tools.map((t) => t.mcpServerViewId));
    const mcpServerViews = await MCPServerViewResource.fetchByIds(
      auth,
      mcpServerViewIds,
      {
        includeHeavyAttributes: [
          "authorization",
          "cachedTools",
          "customHeaders",
          "lastError",
          "sharedSecret",
        ],
      }
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
        manuallyRequestedSpaceIds: additionalRequestedSpaceIdsRes.value,
        icon,
        source: body.source ?? "web_app",
        sourceMetadata: body.sourceMetadata ?? null,
        availability,
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
