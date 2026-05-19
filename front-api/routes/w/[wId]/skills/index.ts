import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import uniq from "lodash/uniq";
import { z } from "zod";

import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { resolveAdditionalRequestedSpaceModelIds } from "@app/lib/api/skills/space_requirements";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  SKILL_VIEWS,
  type SkillType,
  type SkillViewType,
  type SkillWithoutInstructionsAndToolsType,
  type SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import { isBuilder } from "@app/types/user";

import { validate } from "@front-api/middleware/validator";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import detect from "./detect";
import importRoute from "./import";
import reinforcementDailySpend from "./reinforcement_daily_spend";
import reinforcementSpend from "./reinforcement_spend";
import skill from "./[sId]";
import similar from "./similar";

export type GetSkillsWithoutInstructionsAndToolsResponseBody = {
  skills: SkillWithoutInstructionsAndToolsType[];
};

export type GetSkillsResponseBody = {
  skills: SkillType[];
};

export type GetSkillsWithRelationsResponseBody = {
  skills: SkillWithRelationsType[];
};

export type PostSkillResponseBody = {
  skill: SkillType;
};

const SkillStatusSchema = z
  .enum(["active", "archived", "suggested"])
  .optional();

function isSkillViewType(value: string): value is SkillViewType {
  return SKILL_VIEWS.some((skillViewType) => skillViewType === value);
}

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
const app = new Hono();

app.use("*", workspaceAuth());

// Static sub-paths must be registered before the param sub-app.
app.route("/detect", detect);
app.route("/import", importRoute);
app.route("/reinforcement_daily_spend", reinforcementDailySpend);
app.route("/reinforcement_spend", reinforcementSpend);
app.route("/similar", similar);

app.get("/", async (c) => {
  const auth = c.get("auth");

  const withRelations = c.req.query("withRelations");
  const status = c.req.query("status");
  const globalSpaceOnly = c.req.query("globalSpaceOnly");
  const onlyCustom = c.req.query("onlyCustom");
  const isDefault = c.req.query("isDefault");
  const viewType = c.req.query("viewType");

  let skillView: SkillViewType = "full";
  if (viewType !== undefined) {
    if (!isString(viewType) || !isSkillViewType(viewType)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid viewType: ${viewType}. Expected "full" or "summary".`,
        },
      });
    }

    skillView = viewType;
  }

  if (withRelations === "true" && skillView === "summary") {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "viewType=summary is incompatible with withRelations=true.",
      },
    });
  }

  const statusValidation = SkillStatusSchema.safeParse(status);
  if (!statusValidation.success) {
    return apiError(c, {
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
    withInstructions: skillView !== "summary",
    withTools: skillView === "full",
  });

  if (withRelations === "true") {
    const extendedSkills = await SkillResource.fetchByIds(
      auth,
      removeNulls(uniq(skills.map((s) => s.extendedSkillId)))
    );
    const extendedSkillsMap = new Map(extendedSkills.map((s) => [s.sId, s]));

    const skillsWithRelations = await concurrentExecutor(
      skills,
      async (sc) => {
        const usage = await sc.fetchUsage(auth);
        const editors = await sc.listEditors(auth);
        const editedByUser = await sc.fetchEditedByUser(auth);

        return {
          ...sc.toJSON(auth),
          relations: {
            usage,
            editors: editors ? editors.map((e) => e.toJSON()) : null,
            editedByUser: editedByUser ? editedByUser.toJSON() : null,
            extendedSkill: sc.extendedSkillId
              ? (extendedSkillsMap.get(sc.extendedSkillId)?.toJSON(auth) ??
                null)
              : null,
          },
        } satisfies SkillWithRelationsType;
      },
      { concurrency: 10 }
    );

    return c.json({ skills: skillsWithRelations });
  }

  if (skillView === "summary") {
    return c.json({
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

  return c.json({
    skills: skills.map((sc) => sc.toJSON(auth)),
  });
});

app.post("/", validate("json", PostSkillRequestBodySchema), async (c) => {
  const auth = c.get("auth");
  const owner = auth.getNonNullableWorkspace();

  if (!isBuilder(owner)) {
    return apiError(c, {
      status_code: 403,
      api_error: { type: "app_auth_error", message: "User is not a builder." },
    });
  }

  const user = auth.getNonNullableUser();

  const body = c.req.valid("json");
  const name = body.name.trim();

  if (!name) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Skill name cannot be empty.",
      },
    });
  }

  const existingSkill = await SkillResource.fetchActiveByName(auth, name);

  if (existingSkill) {
    return apiError(c, {
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
    return apiError(c, {
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
    return apiError(c, {
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
    return apiError(c, {
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
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `The extended skill with id "${body.extendedSkillId}" cannot be extended.`,
      },
    });
  }

  // Validate file attachments if provided (gated behind sandbox_tools).
  let files: FileResource[] | undefined;
  if (fileAttachments) {
    const featureFlags = await getFeatureFlags(auth);
    if (!featureFlags.includes("sandbox_tools") && fileAttachments.length > 0) {
      return apiError(c, {
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
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: `File attachments not all found, ${files.length} found, ${fileAttachmentIds.length} requested`,
        },
      });
    }

    for (const file of files) {
      if (!file.isReady || file.useCase !== "skill_attachment") {
        return apiError(c, {
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

  return c.json({ skill: newSkill.toJSON(auth) });
});

// Per-skill operations: mounted at /:sId so child routes can read it.
app.route("/:sId", skill);

export default app;
