import type { Authenticator } from "@app/lib/auth";
import {
  SkillDataSourceConfigurationModel,
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import { SkillUserFavoriteModel } from "@app/lib/models/skill/skill_user_favorite";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  SkillConfigurationFindOptions,
  SkillFetchContext,
  SkillFetcher,
  SkillHydrationOptions,
  SkillPermissionFilteringMode,
} from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import uniq from "lodash/uniq";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

export async function fetchFileSkills(
  resourceClass: typeof SkillResource,
  auth: Authenticator,
  file: FileResource
): Promise<{ isReferenced: boolean; skills: SkillResource[] }> {
  const workspace = auth.getNonNullableWorkspace();
  // The unique workspace/file index bounds this lookup to one attachment.
  const attachment = await SkillFileAttachmentModel.findOne({
    attributes: ["skillConfigurationId"],
    where: {
      fileId: file.id,
      workspaceId: workspace.id,
    },
  });

  if (attachment) {
    const skills = await resourceClass.fetchByModelIds(auth, [
      attachment.skillConfigurationId,
    ]);
    return { isReferenced: true, skills };
  }

  // This fallback is only used for detached files. The workspace-leading index bounds the scan.
  const where: WhereOptions<SkillVersionModel> = {
    fileAttachmentIds: { [Op.contains]: [file.id] },
    workspaceId: workspace.id,
  };
  const versions = await SkillVersionModel.findAll({
    attributes: ["skillConfigurationId"],
    group: ["skillConfigurationId"],
    where,
  });

  const skillModelIds = uniq(
    versions.map((version) => version.skillConfigurationId)
  );
  const skills = await resourceClass.fetchByModelIds(auth, skillModelIds);
  return { isReferenced: skillModelIds.length > 0, skills };
}

export async function fetchByIds(
  fetchSkills: SkillFetcher,
  auth: Authenticator,
  sIds: string[],
  {
    agentLoopData,
    effectiveSpaceIds,
    permissionFiltering,
    onlyActive = false,
    withInstructions = true,
    withTools = true,
    withToolMetadata = false,
    withFileAttachments = true,
  }: SkillFetchContext & SkillHydrationOptions & { onlyActive?: boolean } = {}
): Promise<SkillResource[]> {
  if (sIds.length === 0) {
    return [];
  }

  // Separate custom skill IDs from global skill IDs.
  const { customSkillIds, globalSkillIds } = sIds.reduce<{
    customSkillIds: ModelId[];
    globalSkillIds: string[];
  }>(
    (acc, sId) => {
      if (isResourceSId("skill", sId)) {
        const modelId = getResourceIdFromSId(sId);
        if (modelId !== null) {
          acc.customSkillIds.push(modelId);
        }
      } else {
        acc.globalSkillIds.push(sId);
      }
      return acc;
    },
    { customSkillIds: [], globalSkillIds: [] }
  );

  return fetchSkills(
    auth,
    {
      where: {
        id: customSkillIds,
        sId: globalSkillIds,
        status: onlyActive ? ["active"] : ["active", "archived", "suggested"],
      },
      withInstructions,
      withTools,
      withToolMetadata,
      withFileAttachments,
    },
    { agentLoopData, effectiveSpaceIds, permissionFiltering }
  );
}

export async function listFavoritesForCurrentUser(
  resourceClass: typeof SkillResource,
  auth: Authenticator,
  context?: SkillFetchContext
): Promise<SkillResource[]> {
  const user = auth.user();
  if (!user) {
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();
  const favorites = await SkillUserFavoriteModel.findOne({
    attributes: ["skillIds"],
    where: {
      workspaceId: workspace.id,
      userId: user.id,
    },
  });

  if (!favorites || favorites.skillIds.length === 0) {
    return [];
  }

  return resourceClass.fetchByIds(auth, favorites.skillIds, {
    ...context,
    onlyActive: true,
  });
}

export async function isFavoriteForCurrentUser(
  skillResource: SkillResource,
  auth: Authenticator
): Promise<boolean> {
  const user = auth.user();
  if (!user) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  const favorites = await SkillUserFavoriteModel.findOne({
    attributes: ["skillIds"],
    where: {
      workspaceId: workspace.id,
      userId: user.id,
    },
  });

  return favorites?.skillIds.includes(skillResource.sId) ?? false;
}

export async function setFavorite(
  resourceClass: typeof SkillResource,
  skillResource: SkillResource,
  auth: Authenticator,
  isFavorite: boolean
): Promise<Result<undefined, Error>> {
  const user = auth.user();
  if (!user) {
    return new Err(new Error("User must be authenticated"));
  }

  if (skillResource.status !== "active") {
    return new Err(new Error("Only active skills can update favorite state."));
  }

  const workspace = auth.getNonNullableWorkspace();
  const favorites = await SkillUserFavoriteModel.findOne({
    where: {
      workspaceId: workspace.id,
      userId: user.id,
    },
  });

  const wasFavorite = favorites?.skillIds.includes(skillResource.sId) ?? false;
  if (wasFavorite === isFavorite) {
    return new Ok(undefined);
  }

  if (favorites) {
    await favorites.update({
      skillIds: isFavorite
        ? [...favorites.skillIds, skillResource.sId]
        : favorites.skillIds.filter((skillId) => skillId !== skillResource.sId),
    });
  } else {
    await SkillUserFavoriteModel.create({
      workspaceId: workspace.id,
      userId: user.id,
      skillIds: [skillResource.sId],
    });
  }

  if (skillResource.kind === "custom") {
    await skillResource.model.increment("favoriteCount", {
      by: isFavorite ? 1 : -1,
      where: {
        id: skillResource.id,
        workspaceId: workspace.id,
      },
    });
    await resourceClass.launchSearchIndexation(auth, [skillResource.sId]);
  }

  return new Ok(undefined);
}

export async function listByWorkspace(
  fetchSkills: SkillFetcher,
  auth: Authenticator,
  {
    status = "active",
    limit,
    globalSpaceOnly,
    onlyCustom,
    availability,
    updatedAfter,
    reinforcementNotOff,
    withInstructions = true,
    withTools = true,
    withFileAttachments = true,
    permissionFiltering,
  }: {
    status?: SkillStatus | SkillStatus[];
    limit?: number;
    globalSpaceOnly?: boolean;
    onlyCustom?: boolean;
    availability?: SkillAvailability | SkillAvailability[];
    updatedAfter?: Date;
    reinforcementNotOff?: boolean;
    withInstructions?: boolean;
    withTools?: boolean;
    withFileAttachments?: boolean;
    permissionFiltering?: SkillPermissionFilteringMode;
  } = {}
): Promise<SkillResource[]> {
  const skills = await fetchSkills(
    auth,
    {
      where: {
        status,
        ...(availability !== undefined ? { availability } : {}),
        ...(updatedAfter ? { updatedAt: { [Op.gte]: updatedAfter } } : {}),
        ...(reinforcementNotOff ? { reinforcement: { [Op.ne]: "off" } } : {}),
      },
      ...(limit ? { limit } : {}),
      onlyCustom,
      withInstructions,
      withTools,
      withFileAttachments,
    },
    { permissionFiltering }
  );

  if (globalSpaceOnly) {
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    return skills.filter((skill) =>
      skill.requestedSpaceIds.every((id) => id === globalSpace.id)
    );
  }

  return skills;
}

export async function listByMCPServerViewIds(
  fetchSkills: SkillFetcher,
  auth: Authenticator,
  mcpServerViewIds: ModelId[],
  { status = "active" }: { status?: SkillStatus | SkillStatus[] } = {}
): Promise<SkillResource[]> {
  if (mcpServerViewIds.length === 0) {
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();

  // Query skill IDs that have any of the given MCP server views.
  const skillConfigs = await SkillMCPServerConfigurationModel.findAll({
    attributes: ["skillConfigurationId"],
    where: {
      workspaceId: workspace.id,
      mcpServerViewId: {
        [Op.in]: mcpServerViewIds,
      },
    },
  });

  if (skillConfigs.length === 0) {
    return [];
  }

  const skillIds = uniq(skillConfigs.map((c) => c.skillConfigurationId));

  return fetchSkills(auth, {
    where: {
      id: {
        [Op.in]: skillIds,
      },
      status,
    },
    onlyCustom: true,
  });
}

export async function listByDataSourceViewIds(
  fetchSkills: SkillFetcher,
  auth: Authenticator,
  dataSourceViewIds: ModelId[],
  {
    status = "active",
    withInstructions = true,
    withTools = true,
    withFileAttachments = true,
  }: Pick<
    SkillConfigurationFindOptions,
    "withInstructions" | "withTools" | "withFileAttachments"
  > & { status?: SkillStatus | SkillStatus[] } = {}
): Promise<SkillResource[]> {
  if (dataSourceViewIds.length === 0) {
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();

  // Query skill IDs that have any of the given data source views.
  const skillConfigs = await SkillDataSourceConfigurationModel.findAll({
    attributes: ["skillConfigurationId"],
    where: {
      workspaceId: workspace.id,
      dataSourceViewId: {
        [Op.in]: dataSourceViewIds,
      },
    },
  });

  if (skillConfigs.length === 0) {
    return [];
  }

  const skillIds = uniq(skillConfigs.map((c) => c.skillConfigurationId));

  return fetchSkills(auth, {
    where: {
      id: {
        [Op.in]: skillIds,
      },
      status,
    },
    onlyCustom: true,
    withInstructions,
    withTools,
    withFileAttachments,
  });
}

export async function listByDataSourceIds(
  fetchSkills: SkillFetcher,
  auth: Authenticator,
  dataSourceIds: ModelId[],
  {
    withInstructions = true,
    withTools = true,
    withFileAttachments = true,
  }: Pick<
    SkillConfigurationFindOptions,
    "withInstructions" | "withTools" | "withFileAttachments"
  > = {}
): Promise<SkillResource[]> {
  if (dataSourceIds.length === 0) {
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();

  // Query skill IDs that have any of the given data sources.
  const skillConfigs = await SkillDataSourceConfigurationModel.findAll({
    attributes: ["skillConfigurationId"],
    where: {
      workspaceId: workspace.id,
      dataSourceId: {
        [Op.in]: dataSourceIds,
      },
    },
  });

  if (skillConfigs.length === 0) {
    return [];
  }

  const skillIds = uniq(skillConfigs.map((c) => c.skillConfigurationId));

  return fetchSkills(auth, {
    where: {
      id: {
        [Op.in]: skillIds,
      },
      status: "active",
    },
    onlyCustom: true,
    withInstructions,
    withTools,
    withFileAttachments,
  });
}
