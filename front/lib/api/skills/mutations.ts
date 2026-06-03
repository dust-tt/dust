import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { resolveAdditionalRequestedSpaceModelIds } from "@app/lib/api/skills/space_requirements";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { pruneOutdatedSkillEditSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { FileResource } from "@app/lib/resources/file_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  type SkillAttachedKnowledge,
  SkillResource,
} from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type {
  SkillReinforcementMode,
  SkillSourceMetadata,
  SkillSourceType,
} from "@app/types/assistant/skill_configuration";
import type { APIErrorType, APIErrorWithStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isBuilder } from "@app/types/user";
import uniq from "lodash/uniq";

export type SkillMutationError = APIErrorWithStatusCode<400 | 403 | 404>;

function skillMutationError({
  message,
  statusCode,
  type,
}: {
  message: string;
  statusCode: 400 | 403 | 404;
  type: APIErrorType;
}): SkillMutationError {
  return {
    status_code: statusCode,
    api_error: {
      type,
      message,
    },
  };
}

function invalidRequestError(message: string): SkillMutationError {
  return skillMutationError({
    statusCode: 400,
    type: "invalid_request_error",
    message,
  });
}

function appAuthError(message: string): SkillMutationError {
  return skillMutationError({
    statusCode: 403,
    type: "app_auth_error",
    message,
  });
}

export type CreateSkillMutationParams = {
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string;
  instructionsHtml?: string | null;
  icon?: string | null;
  mcpServerViews: MCPServerViewResource[];
  attachedKnowledge: SkillAttachedKnowledge[];
  fileAttachments?: FileResource[];
  additionalRequestedSpaceIds?: string[];
  extendedSkillId?: string | null;
  source?: SkillSourceType;
  sourceMetadata?: SkillSourceMetadata | null;
  isDefault?: boolean;
  reinforcement?: SkillReinforcementMode;
  enableSkillReferences?: boolean;
  referencedSkillIds?: string[];
};

export async function createSkill(
  auth: Authenticator,
  params: CreateSkillMutationParams
): Promise<Result<SkillResource, SkillMutationError>> {
  const owner = auth.workspace();
  if (!owner || !isBuilder(owner)) {
    return new Err(appAuthError("User is not a builder."));
  }

  const user = auth.user();
  if (!user) {
    return new Err(
      appAuthError("Skill creation requires an authenticated user.")
    );
  }

  const name = params.name.trim();
  if (!name) {
    return new Err(invalidRequestError("Skill name cannot be empty."));
  }

  const existingSkill = await SkillResource.fetchActiveByName(auth, name);
  if (existingSkill) {
    return new Err(
      invalidRequestError(`A skill with the name "${name}" already exists.`)
    );
  }

  const computedRequestedSpaceIds =
    await SkillResource.computeRequestedSpaceIds(auth, {
      mcpServerViews: params.mcpServerViews,
      attachedKnowledge: params.attachedKnowledge,
    });

  const additionalRequestedSpaceModelIds =
    await resolveAdditionalRequestedSpaceModelIds(
      auth,
      params.additionalRequestedSpaceIds
    );
  if (additionalRequestedSpaceModelIds.isErr()) {
    return new Err(
      invalidRequestError(additionalRequestedSpaceModelIds.error.message)
    );
  }

  const requestedSpaceIds = uniq([
    ...computedRequestedSpaceIds,
    ...additionalRequestedSpaceModelIds.value,
  ]);

  let icon = params.icon ?? null;
  if (!icon) {
    const iconResult = await getSkillIconSuggestion(auth, {
      name,
      instructions: params.instructions,
      agentFacingDescription: params.agentFacingDescription,
    });

    if (iconResult.isOk()) {
      icon = iconResult.value;
    } else {
      logger.warn(
        { err: iconResult.error },
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
      agentFacingDescription: params.agentFacingDescription,
      userFacingDescription: params.userFacingDescription,
      instructions: params.instructions,
      instructionsHtml: params.instructionsHtml ?? null,
      editedBy: user.id,
      requestedSpaceIds,
      extendedSkillId: params.extendedSkillId ?? null,
      icon,
      source: params.source ?? "web_app",
      sourceMetadata: params.sourceMetadata ?? null,
      isDefault: params.isDefault ?? false,
      reinforcement: params.reinforcement ?? "on",
    },
    {
      mcpServerViews: params.mcpServerViews,
      attachedKnowledge: params.attachedKnowledge,
      fileAttachments: params.fileAttachments,
      enableSkillReferences: params.enableSkillReferences ?? false,
      referencedSkillIds: params.referencedSkillIds ?? [],
    }
  );

  if (params.fileAttachments && params.fileAttachments.length > 0) {
    await FileResource.bulkSetUseCaseMetadata(auth, params.fileAttachments, {
      skillId: skill.sId,
    });
  }

  await auth.refresh();

  return new Ok(skill);
}

export type UpdateSkillMutationParams = {
  name?: string;
  agentFacingDescription?: string;
  userFacingDescription?: string;
  instructions?: string;
  instructionsHtml?: string | null;
  icon?: string | null;
  mcpServerViews?: MCPServerViewResource[];
  attachedKnowledge?: SkillAttachedKnowledge[];
  fileAttachments?: FileResource[];
  additionalRequestedSpaceIds?: string[];
  isDefault?: boolean;
  reinforcement?: SkillReinforcementMode;
  source?: SkillSourceType;
  sourceMetadata?: SkillSourceMetadata | null;
  enableSkillReferences?: boolean;
  referencedSkillIds?: string[];
  activateSuggestedSkill?: boolean;
};

export async function updateSkill(
  auth: Authenticator,
  skill: SkillResource,
  params: UpdateSkillMutationParams
): Promise<Result<SkillResource, SkillMutationError>> {
  const name = params.name !== undefined ? params.name.trim() : skill.name;
  if (!name) {
    return new Err(invalidRequestError("Skill name cannot be empty."));
  }

  if (!skill.canWrite(auth)) {
    return new Err(appAuthError("Only editors can modify this skill."));
  }

  const existingSkill = await SkillResource.fetchActiveByName(auth, name);
  if (existingSkill && existingSkill.id !== skill.id) {
    return new Err(
      invalidRequestError(`A skill with the name "${name}" already exists.`)
    );
  }

  const mcpServerViews = params.mcpServerViews ?? skill.mcpServerViews;
  const attachedKnowledge =
    params.attachedKnowledge ?? (await skill.getAttachedKnowledge(auth));

  const computedRequestedSpaceIds =
    await SkillResource.computeRequestedSpaceIds(auth, {
      mcpServerViews,
      attachedKnowledge,
    });

  let additionalRequestedSpaceModelIds: number[];
  if (params.additionalRequestedSpaceIds !== undefined) {
    const additionalRequestedSpaceModelIdsRes =
      await resolveAdditionalRequestedSpaceModelIds(
        auth,
        params.additionalRequestedSpaceIds
      );
    if (additionalRequestedSpaceModelIdsRes.isErr()) {
      return new Err(
        invalidRequestError(additionalRequestedSpaceModelIdsRes.error.message)
      );
    }

    additionalRequestedSpaceModelIds =
      additionalRequestedSpaceModelIdsRes.value;
  } else {
    const previousAttachedKnowledge = await skill.getAttachedKnowledge(auth);
    const previousComputedRequestedSpaceIds =
      await SkillResource.computeRequestedSpaceIds(auth, {
        mcpServerViews: skill.mcpServerViews,
        attachedKnowledge: previousAttachedKnowledge,
      });
    const previousComputedRequestedSpaceIdsSet = new Set(
      previousComputedRequestedSpaceIds
    );

    additionalRequestedSpaceModelIds = skill.requestedSpaceIds.filter(
      (spaceId) => !previousComputedRequestedSpaceIdsSet.has(spaceId)
    );
  }

  const requestedSpaceIds = uniq([
    ...computedRequestedSpaceIds,
    ...additionalRequestedSpaceModelIds,
  ]);

  const shouldActivate =
    params.activateSuggestedSkill === true && skill.status === "suggested";
  if (shouldActivate) {
    const owner = auth.getNonNullableWorkspace();
    logger.info(
      {
        skillId: skill.sId,
        workspaceId: owner.sId,
      },
      "Suggested skill accepted"
    );
  }

  const enableSkillReferences =
    params.enableSkillReferences ??
    (await getFeatureFlags(auth)).includes("nested_skills");

  await skill.updateSkill(auth, {
    agentFacingDescription:
      params.agentFacingDescription ?? skill.agentFacingDescription,
    attachedKnowledge,
    fileAttachments: params.fileAttachments,
    icon: params.icon !== undefined ? params.icon : skill.icon,
    instructions: params.instructions ?? skill.instructions,
    instructionsHtml:
      params.instructionsHtml !== undefined
        ? params.instructionsHtml
        : skill.instructionsHtml,
    isDefault: params.isDefault,
    mcpServerViews,
    name,
    reinforcement: params.reinforcement,
    requestedSpaceIds,
    source: params.source,
    sourceMetadata: params.sourceMetadata ?? undefined,
    enableSkillReferences,
    referencedSkillIds: params.referencedSkillIds,
    userFacingDescription:
      params.userFacingDescription ?? skill.userFacingDescription,
    ...(shouldActivate ? { status: "active" as const } : {}),
  });

  await pruneOutdatedSkillEditSuggestions(auth, skill);

  return new Ok(skill);
}
