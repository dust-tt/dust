import { updateSkill } from "@app/lib/api/skills/mutations";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { AttachedKnowledgeSchema } from "@app/pages/api/w/[wId]/skills";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { APIErrorResponse } from "@app/types/error";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context, TypedResponse } from "hono";
import uniq from "lodash/uniq";
import { z } from "zod";

import editors from "./editors";
import filesRoute from "./files/[fileId]/content";
import history from "./history";
import reinforcement from "./reinforcement";
import restore from "./restore";

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
  referencedSkillIds: z.array(z.string()).optional(),
  fileAttachments: z.array(z.object({ fileId: z.string() })).optional(),
  isDefault: z.boolean().optional(),
  reinforcement: z.enum(["auto", "on", "off"]).optional(),
});

// Shared per-request prelude: resolve :sId to a SkillResource or return a
// failure Response. See [API10].
async function loadSkill(
  ctx: Context,
  sId: string
): Promise<
  | { skill: SkillResource; sId: string }
  | (Response & TypedResponse<APIErrorResponse>)
> {
  const auth = ctx.get("auth");

  const skill = await SkillResource.fetchById(auth, sId);
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
app.route("/history", history);
app.route("/reinforcement", reinforcement);
app.route("/restore", restore);
app.route("/files/:fileId/content", filesRoute);

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

    const loaded = await loadSkill(ctx, sId);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { skill } = loaded;

    const withRelations = ctx.req.query("withRelations");

    const serializedSkill = skill.toJSON(auth);

    if (withRelations === "true") {
      const featureFlags = await getFeatureFlags(auth);
      const includeChildSkills = featureFlags.includes("nested_skills");

      const usage = await skill.fetchUsage(auth);
      const editors = await skill.listEditors(auth);
      const editedByUser = await skill.fetchEditedByUser(auth);
      const extendedSkill = serializedSkill.extendedSkillId
        ? await SkillResource.fetchById(auth, serializedSkill.extendedSkillId)
        : null;
      const childSkills = includeChildSkills
        ? await skill.fetchChildSkills(auth)
        : [];

      const skillWithRelations: SkillWithRelationsType = {
        ...serializedSkill,
        relations: {
          usage,
          editors: editors ? editors.map((e) => e.toJSON()) : null,
          editedByUser: editedByUser ? editedByUser.toJSON() : null,
          extendedSkill: extendedSkill ? extendedSkill.toJSON(auth) : null,
          ...(includeChildSkills
            ? {
                childSkills: childSkills.map((childSkill) => {
                  const {
                    instructions,
                    instructionsHtml,
                    tools,
                    ...childSkillWithoutInstructionsAndTools
                  } = childSkill.toJSON(auth);

                  return childSkillWithoutInstructionsAndTools;
                }),
              }
            : {}),
        },
      };

      return ctx.json({ skill: skillWithRelations });
    }
    return ctx.json({ skill: serializedSkill });
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchSkillRequestBodySchema),
  async (ctx): HandlerResult<PatchSkillResponseBody> => {
    const auth = ctx.get("auth");
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

    // Check if user can write.
    if (!skill.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can modify this skill.",
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

    // Fetch MCP server views first to compute requestedSpaceIds.
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

    const featureFlags = await getFeatureFlags(auth);
    const enableSkillReferences = featureFlags.includes("nested_skills");

    // Validate file attachments if provided (gated behind sandbox_tools).
    let files: FileResource[] | undefined;
    if (fileAttachments) {
      if (
        !featureFlags.includes("sandbox_tools") &&
        fileAttachments.length > 0
      ) {
        return apiError(ctx, {
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

    const skillResult = await updateSkill(auth, skill, {
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
      additionalRequestedSpaceIds: body.additionalRequestedSpaceIds,
      enableSkillReferences,
      referencedSkillIds: body.referencedSkillIds,
      userFacingDescription: body.userFacingDescription,
      activateSuggestedSkill: true,
    });

    if (skillResult.isErr()) {
      return apiError(ctx, skillResult.error);
    }

    return ctx.json({ skill: skillResult.value.toJSON(auth) });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<DeleteSkillResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { sId } = ctx.req.valid("param");

    const loaded = await loadSkill(ctx, sId);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { skill } = loaded;

    // Check if user can write.
    if (!skill.canWrite(auth)) {
      return apiError(ctx, {
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

    return ctx.json({ success: true });
  }
);

export default app;
