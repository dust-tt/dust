import { AttachedKnowledgeSchema } from "@app/lib/api/skills/schemas";
import {
  findSkillEditorsWithoutSpaceAccess,
  getReferencedSkillSpaceModelIds,
  resolveAdditionalRequestedSpaceModelIds,
} from "@app/lib/api/skills/space_requirements";
import { hasFeatureFlag } from "@app/lib/auth";
import { pruneOutdatedSkillEditSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  DeleteSkillResponseBody,
  GetSkillResponseBody,
  GetSkillWithRelationsResponseBody,
  PatchSkillResponseBody,
} from "@app/types/api/skills";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import {
  availabilityFromIsDefault,
  SKILL_AVAILABILITIES,
} from "@app/types/assistant/skill_configuration";
import type { APIErrorResponse } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { rejectArchivedSkill } from "@front-api/routes/w/[wId]/skills/guards";
import type { Context, TypedResponse } from "hono";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import { z } from "zod";

import editors from "./editors";
import favorite from "./favorite";
import filesRoute from "./files/[fileId]/content";
import history from "./history";
import reinforcement from "./reinforcement";
import restore from "./restore";

const ParamsSchema = z.object({
  sId: z.string(),
});

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
  // @deprecated Use availability instead. Kept while old clients still send it.
  isDefault: z.boolean().optional(),
  availability: z.enum(SKILL_AVAILABILITIES).optional(),
  reinforcement: z.enum(["auto", "on", "off"]).optional(),
});

// Shared per-request prelude: resolve :sId to a SkillResource or return a
// failure Response. See [API10].
async function loadSkill(
  ctx: Context,
  sId: string,
  {
    redactUnreadableForAdmin = false,
  }: {
    redactUnreadableForAdmin?: boolean;
  } = {}
): Promise<
  | { skill: SkillResource; sId: string }
  | (Response & TypedResponse<APIErrorResponse>)
> {
  const auth = ctx.get("auth");

  const skill = await SkillResource.fetchById(auth, sId, {
    permissionFiltering:
      redactUnreadableForAdmin && auth.isAdmin()
        ? "redact_unreadable"
        : "strict",
  });
  if (!skill) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  return { skill, sId };
}

// Mounted at /api/w/:wId/skills/:sId.
const app = workspaceApp();

// Sub-routes for this skill.
app.route("/editors", editors);
app.route("/favorite", favorite);
app.route("/history", history);
app.route("/reinforcement", reinforcement);
app.route("/restore", restore);
app.route("/files/:fileId/content", filesRoute);

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (
    ctx
  ): HandlerResult<
    GetSkillResponseBody | GetSkillWithRelationsResponseBody
  > => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");

    const loaded = await loadSkill(ctx, sId, {
      redactUnreadableForAdmin: true,
    });
    if (loaded instanceof Response) {
      return loaded;
    }
    const { skill } = loaded;

    const withRelations = ctx.req.query("withRelations");

    const hasSkillFavorites = await hasFeatureFlag(auth, "skill_favorites");
    let favoriteState: { isFavorite?: boolean } = {};
    if (hasSkillFavorites) {
      const isFavorite = await skill.isFavoriteForCurrentUser(auth);
      favoriteState = { isFavorite };
    }

    const serializedSkill = skill.toJSON(auth);

    if (withRelations === "true") {
      const usage = await skill.fetchUsage(auth);
      const editors = await skill.listEditors(auth);
      const editedByUser = await skill.fetchEditedByUser(auth);
      const childSkills = await skill.fetchChildSkills(auth);
      const usedBySkills =
        (await SkillResource.batchFetchUsedBySkills(auth, [skill])).get(
          skill.sId
        ) ?? [];

      const skillWithRelations: SkillWithRelationsType = {
        ...serializedSkill,
        relations: {
          usage: {
            ...usage,
            count: usage.count + usedBySkills.length,
            skills: usedBySkills,
          },
          editors: editors ? editors.map((e) => e.toJSON()) : null,
          editedByUser: editedByUser ? editedByUser.toJSON() : null,
          childSkills: childSkills.map((childSkill) => {
            const {
              instructions,
              instructionsHtml,
              tools,
              ...childSkillWithoutInstructionsAndTools
            } = childSkill.toJSON(auth);

            return childSkillWithoutInstructionsAndTools;
          }),
        },
      };

      return ctx.json({
        skill: { ...skillWithRelations, ...favoriteState },
      } satisfies GetSkillWithRelationsResponseBody);
    }
    return ctx.json({
      skill: { ...serializedSkill, ...favoriteState },
    } satisfies GetSkillResponseBody);
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchSkillRequestBodySchema),
  async (ctx): HandlerResult<PatchSkillResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { sId } = ctx.req.valid("param");

    const loaded = await loadSkill(ctx, sId);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { skill } = loaded;

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

    // Resolve the requested availability once: isDefault is a deprecated alias; an explicit
    // availability takes priority over it.
    const requestedAvailability =
      body.availability ??
      (body.isDefault !== undefined
        ? availabilityFromIsDefault(body.isDefault)
        : undefined);

    const availabilityChanged =
      requestedAvailability !== undefined &&
      requestedAvailability !== skill.availability;

    // Changing a skill's availability requires the workspace-level permission to publish
    // skills — even for editors.
    if (
      availabilityChanged &&
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

    // without make skill discoverable permission, a user can neither make a skill
    // auto-discoverable nor change an already auto-discoverable skill's availability.
    const involvesAutoDiscoverable =
      requestedAvailability === "users_and_agents" ||
      skill.availability === "users_and_agents";
    if (
      availabilityChanged &&
      involvesAutoDiscoverable &&
      !(await auth.hasWorkspacePermission("make_discoverable", "skill"))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "You don't have permission to change this skill's auto-discoverable status.",
        },
      });
    }

    const archivedError = rejectArchivedSkill(ctx, skill);
    if (archivedError) {
      return archivedError;
    }

    // Editing a skill remains editor-only; non-editors holding the publish permission use
    // PATCH /skills/:sId/availability to publish or unpublish without editing.
    if (!skill.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can modify this skill.",
        },
      });
    }

    // Check for existing active skill with the same name (excluding current skill).
    const existingSkill = await SkillResource.fetchByName(auth, name);

    if (existingSkill && existingSkill.id !== skill.id) {
      return apiError(ctx, {
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
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid MCP server view ID: ${tool.mcpServerViewId}`,
          },
        });
      }
    }

    // Fetch MCP server views first to compute requestedSpaceIds. The views end up on the
    // updated skill, whose serialized response includes their tools — fetch the heavy attributes.
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

    // Validate all data source views from attached knowledge exist and user has access.
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
      body.instructions,
      skill.sId
    );

    // `additionalRequestedSpaceIds` is the wire name of the skill's manual space selection, stored
    // as `manuallyRequestedSpaceIds`.
    let additionalRequestedSpaceIds: ModelId[];

    if (body.additionalRequestedSpaceIds !== undefined) {
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

      additionalRequestedSpaceIds = additionalRequestedSpaceIdsRes.value;
    } else {
      // A request that says nothing about the spaces leaves the manual selection as it is.
      additionalRequestedSpaceIds = [...skill.manuallyRequestedSpaceIds];
    }

    // A skill requests a space for one of four reasons: one of its tools lives there, some of its
    // attached knowledge does, a skill it references requests it, or a person picked it by hand.
    // Only the last one is stored; the other three are derived, and disappear with what pulled
    // them in.
    const requestedSpaceIds = uniq([
      ...computedRequestedSpaceIds, // Tools and attached knowledge.
      ...referencedSkillSpaceIds, // Nested skills.
      ...additionalRequestedSpaceIds, // Picked by hand.
    ]);

    // Adding a restricted space can lock out editors that are already on the skill. `updateSkill`
    // also makes the caller an editor, so they are part of the set to validate.
    const editors = (await skill.listEditors(auth)) ?? [];
    const requestedSpaces = await SpaceResource.fetchByModelIds(
      auth,
      requestedSpaceIds
    );
    const editorsAccessError = await findSkillEditorsWithoutSpaceAccess(auth, {
      editors: uniqBy([...editors, auth.getNonNullableUser()], "id"),
      requestedSpaces,
    });
    if (editorsAccessError) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: editorsAccessError,
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
      availability: requestedAvailability,
      manuallyRequestedSpaceIds: additionalRequestedSpaceIds,
      mcpServerViews,
      name,
      reinforcement: body.reinforcement,
      requestedSpaceIds,
      userFacingDescription: body.userFacingDescription,
      ...(shouldActivate ? { status: "active" as const } : {}),
    });

    await pruneOutdatedSkillEditSuggestions(auth, skill);

    return ctx.json({ skill: skill.toJSON(auth) });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<DeleteSkillResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { sId } = ctx.req.valid("param");

    // Admins can archive the skills built on spaces they are not a member of (shown to them
    // redacted).
    const loaded = await loadSkill(ctx, sId, {
      redactUnreadableForAdmin: true,
    });
    if (loaded instanceof Response) {
      return loaded;
    }
    const { skill } = loaded;

    // Check if user can administrate.
    if (!skill.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only admins and editors can archive this skill.",
        },
      });
    }

    const archivedDeleteError = rejectArchivedSkill(ctx, skill);
    if (archivedDeleteError) {
      return archivedDeleteError;
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

    return ctx.json({ success: true });
  }
);

export default app;
