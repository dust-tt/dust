import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { resolveAdditionalRequestedSpaceModelIds } from "@app/lib/api/skills/space_requirements";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import uniq from "lodash/uniq";
import { z } from "zod";

export interface CreateSkillError {
  message: string;
  statusCode: 400 | 403 | 404;
}

export const AttachedKnowledgeSchema = z.object({
  dataSourceViewId: z.string(),
  nodeId: z.string(),
  spaceId: z.string(),
  title: z.string(),
});

export const CreateSkillInputSchema = z.intersection(
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

export type CreateSkillInput = z.infer<typeof CreateSkillInputSchema>;

export async function createSkill(
  auth: Authenticator,
  input: CreateSkillInput
): Promise<Result<SkillType, CreateSkillError>> {
  const name = input.name.trim();
  if (!name) {
    return new Err({
      message: "Skill name cannot be empty.",
      statusCode: 400,
    });
  }

  const existingSkill = await SkillResource.fetchActiveByName(auth, name);
  if (existingSkill) {
    return new Err({
      message: `A skill with the name "${name}" already exists.`,
      statusCode: 400,
    });
  }

  const mcpServerViewIds = uniq(input.tools.map((t) => t.mcpServerViewId));
  const mcpServerViews = await MCPServerViewResource.fetchByIds(
    auth,
    mcpServerViewIds
  );
  if (mcpServerViewIds.length !== mcpServerViews.length) {
    return new Err({
      message: `MCP server views not all found, ${mcpServerViews.length} found, ${mcpServerViewIds.length} requested`,
      statusCode: 404,
    });
  }

  const dataSourceViewIds = uniq(
    input.attachedKnowledge.map((a) => a.dataSourceViewId)
  );
  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    dataSourceViewIds
  );
  if (dataSourceViews.length !== dataSourceViewIds.length) {
    return new Err({
      message: `Data source views not all found, ${dataSourceViews.length} found, ${dataSourceViewIds.length} requested`,
      statusCode: 404,
    });
  }

  const dataSourceViewIdMap = new Map(
    dataSourceViews.map((dsv) => [dsv.sId, dsv])
  );
  const attachedKnowledgeWithDataSourceViews = input.attachedKnowledge.map(
    (attachment) => ({
      // Non-null assertion is safe: count check above guarantees presence.
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
      input.additionalRequestedSpaceIds
    );
  if (additionalRequestedSpaceIdsRes.isErr()) {
    return new Err({
      message: additionalRequestedSpaceIdsRes.error.message,
      statusCode: 400,
    });
  }

  const requestedSpaceIds = uniq([
    ...computedRequestedSpaceIds,
    ...additionalRequestedSpaceIdsRes.value,
  ]);

  const extendedSkill = input.extendedSkillId
    ? await SkillResource.fetchById(auth, input.extendedSkillId)
    : null;
  if (extendedSkill !== null && !extendedSkill.isExtendable) {
    return new Err({
      message: `The extended skill with id "${input.extendedSkillId}" cannot be extended.`,
      statusCode: 400,
    });
  }

  const filesRes = await resolveFileAttachments(auth, input.fileAttachments);
  if (filesRes.isErr()) {
    return filesRes;
  }
  const files = filesRes.value;

  let icon = input.icon;
  if (!icon) {
    const iconResult = await getSkillIconSuggestion(auth, {
      name,
      instructions: input.instructions,
      agentFacingDescription: input.agentFacingDescription,
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

  const skill = await SkillResource.makeNew(
    auth,
    {
      status: "active",
      name,
      agentFacingDescription: input.agentFacingDescription,
      userFacingDescription: input.userFacingDescription,
      instructions: input.instructions,
      instructionsHtml: input.instructionsHtml,
      editedBy: auth.getNonNullableUser().id,
      requestedSpaceIds,
      extendedSkillId: input.extendedSkillId,
      icon,
      source: input.source ?? "web_app",
      sourceMetadata: input.sourceMetadata ?? null,
      isDefault: input.isDefault ?? false,
    },
    {
      mcpServerViews,
      attachedKnowledge: attachedKnowledgeWithDataSourceViews,
      fileAttachments: files,
    }
  );

  if (files) {
    await FileResource.bulkSetUseCaseMetadata(auth, files, {
      skillId: skill.sId,
    });
  }

  return new Ok(skill.toJSON(auth));
}

async function resolveFileAttachments(
  auth: Authenticator,
  fileAttachments: { fileId: string }[] | undefined
): Promise<Result<FileResource[] | undefined, CreateSkillError>> {
  if (!fileAttachments) {
    return new Ok(undefined);
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sandbox_tools") && fileAttachments.length > 0) {
    return new Err({
      message: "File attachments are not supported.",
      statusCode: 403,
    });
  }

  const fileAttachmentIds = uniq(fileAttachments.map((f) => f.fileId));
  const files = await FileResource.fetchByIds(auth, fileAttachmentIds);
  if (files.length !== fileAttachmentIds.length) {
    return new Err({
      message: `File attachments not all found, ${files.length} found, ${fileAttachmentIds.length} requested`,
      statusCode: 404,
    });
  }

  for (const file of files) {
    if (!file.isReady || file.useCase !== "skill_attachment") {
      return new Err({
        message: `File ${file.sId} is not ready or not a skill_attachment.`,
        statusCode: 400,
      });
    }
  }

  return new Ok(files);
}
