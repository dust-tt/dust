import type { SkillAvailabilityChange } from "@app/lib/api/skills/availability_change";
import { validateSkillAvailabilityChange } from "@app/lib/api/skills/availability_change";
import { validateSkillNameChange } from "@app/lib/api/skills/name_change";
import {
  AttachedKnowledgeSchema,
  SkillNameSchema,
} from "@app/lib/api/skills/schemas";
import {
  findSkillEditorsWithoutAccessToSpaceIds,
  resolveAdditionalRequestedSpaceModelIds,
} from "@app/lib/api/skills/space_requirements";
import { pruneOutdatedSkillEditSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
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
  SKILL_REINFORCEMENT_MODES,
} from "@app/types/assistant/skill_configuration";
import type { APIErrorResponse } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { rejectArchivedSkill } from "@front-api/routes/w/[wId]/skills/guards";
import type { Context, TypedResponse } from "hono";
import uniq from "lodash/uniq";
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
  name: SkillNameSchema,
  agentFacingDescription: z.string(),
  userFacingDescription: z.string().max(USER_FACING_DESCRIPTION_MAX_LENGTH),
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

    const isFavorite = await skill.isFavoriteForCurrentUser(auth);
    const serializedSkill = { ...skill.toJSON(auth), isFavorite };

    if (withRelations === "true") {
      const usage = await skill.fetchUsage(auth);
      const editors = await skill.listEditors(auth);
      const editedByUser = await skill.fetchEditedByUser(auth);
      const childSkills = await skill.fetchChildSkills(auth);
      const usedBySkills =
        (await SkillResource.batchFetchUsedBySkills(auth, [skill])).get(
          skill.sId
        ) ?? [];

      const skillWithRelations = {
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
      } satisfies SkillWithRelationsType;

      return ctx.json({
        skill: skillWithRelations,
      } satisfies GetSkillWithRelationsResponseBody);
    }
    return ctx.json({
      skill: serializedSkill,
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

    const archivedError = rejectArchivedSkill(ctx, skill);
    if (archivedError) {
      return archivedError;
    }

    // Editing a skill remains editor-only; non-editors holding the publish permission use
    // PATCH /skills/:sId/availability to publish or unpublish without editing.
    if (!auth.can("write", skill)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can modify this skill.",
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

    let availabilityChange: SkillAvailabilityChange | null = null;
    if (requestedAvailability !== undefined) {
      const availabilityValidation = validateSkillAvailabilityChange(
        auth,
        skill,
        { availability: requestedAvailability }
      );
      if (availabilityValidation.isErr()) {
        switch (availabilityValidation.error.code) {
          case "not_authorized":
          case "publish_denied":
          case "make_discoverable_denied":
            return apiError(ctx, {
              status_code: 403,
              api_error: {
                type: "app_auth_error",
                message: availabilityValidation.error.message,
              },
            });
          case "archived":
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: availabilityValidation.error.message,
              },
            });
          default:
            assertNever(availabilityValidation.error.code);
        }
      }
      availabilityChange = availabilityValidation.value;
    }

    const nameValidation = await validateSkillNameChange(auth, skill, {
      name: body.name,
    });
    if (nameValidation.isErr()) {
      switch (nameValidation.error.code) {
        case "not_authorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "app_auth_error",
              message: nameValidation.error.message,
            },
          });
        case "archived":
        case "empty":
        case "too_long":
        case "already_exists":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: nameValidation.error.message,
            },
          });
        default:
          assertNever(nameValidation.error.code);
      }
    }
    const { name } = nameValidation.value;

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

    const requestedSpaceIds = await SkillResource.computeRequestedSpaceIds(
      auth,
      {
        attachedKnowledge: attachedKnowledgeWithDataSourceViews,
        excludedSkillId: skill.sId,
        instructions: body.instructions,
        manuallyRequestedSpaceIds: additionalRequestedSpaceIds,
        mcpServerViews,
      }
    );

    // Adding a restricted space can lock out editors that are already on the skill.
    const editorsAccessError = await findSkillEditorsWithoutAccessToSpaceIds(
      auth,
      skill,
      requestedSpaceIds
    );
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
      availability: availabilityChange?.availability,
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
    if (!auth.can("admin", skill)) {
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
