import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { SkillConfigurationModel } from "@app/lib/models/skill";
import {
  SkillDataSourceConfigurationModel,
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import type { SkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  SkillConfigurationFindOptions,
  SkillMCPServerConfiguration,
  SkillPermissionFilter,
  SkillPermissionFilteringMode,
  SkillResourceFactory,
} from "@app/lib/resources/skill/types";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import groupBy from "lodash/groupBy";
import omit from "lodash/omit";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

export async function baseFetch(
  resourceClass: typeof SkillResource,
  createResource: SkillResourceFactory,
  filterReadable: SkillPermissionFilter,
  auth: Authenticator,
  options: SkillConfigurationFindOptions = {},
  context: {
    agentLoopData?: AgentLoopExecutionData;
    effectiveSpaceIds?: string[];
    permissionFiltering?: SkillPermissionFilteringMode;
    transaction?: Transaction;
  } = {}
): Promise<SkillResource[]> {
  const workspace = auth.getNonNullableWorkspace();
  const {
    agentLoopData,
    effectiveSpaceIds: providedEffectiveSpaceIds,
    permissionFiltering = "strict",
    transaction,
  } = context;

  const {
    where,
    includes,
    onlyCustom,
    withInstructions = true,
    withTools = true,
    withToolMetadata = false,
    withFileAttachments = true,
    ...otherOptions
  } = options;

  const customSkills = await resourceClass.model.findAll({
    ...otherOptions,
    ...(withInstructions
      ? {}
      : { attributes: { exclude: ["instructions", "instructionsHtml"] } }),
    where: {
      // Fetch active by default, unless explicitly overridden by the caller.
      status: "active",
      ...omit(where, "sId"),
      workspaceId: workspace.id,
    },
    include: includes,
    transaction,
  });

  let allowedCustomSkills: SkillConfigurationModel[];
  const redactedCustomSkillIds = new Set<ModelId>();
  switch (permissionFiltering) {
    case "strict":
      allowedCustomSkills = await filterReadable(auth, customSkills, {
        transaction,
      });
      break;
    case "redact_unreadable": {
      if (!auth.isAdmin()) {
        throw new Error("Only admins can fetch the skills they cannot read.");
      }
      // With the `admin_can_see_private_entities` feature flag, admins get the skills they
      // cannot read in full instead of redacted.
      if (await hasFeatureFlag(auth, "admin_can_see_private_entities")) {
        allowedCustomSkills = customSkills;
        break;
      }
      const readableIds = new Set(
        (await filterReadable(auth, customSkills, { transaction })).map(
          (skill) => skill.id
        )
      );
      for (const skill of customSkills) {
        if (!readableIds.has(skill.id)) {
          redactedCustomSkillIds.add(skill.id);
        }
      }
      allowedCustomSkills = customSkills;
      break;
    }
    case "dangerously_skip":
      allowedCustomSkills = customSkills;
      break;
    default:
      assertNever(permissionFiltering);
  }
  const allowedCustomSkillIds = allowedCustomSkills.map((skill) => skill.id);

  let allowedCustomSkillsRes: SkillResource[] = [];
  if (allowedCustomSkills.length > 0) {
    let mcpServerConfigurations: SkillMCPServerConfigurationModel[] = [];
    let allMCPServerViews: MCPServerViewResource[] = [];

    if (withTools) {
      mcpServerConfigurations = await SkillMCPServerConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: {
            [Op.in]: allowedCustomSkillIds,
          },
        },
        transaction,
      });

      allMCPServerViews = await MCPServerViewResource.fetchByModelIds(
        auth,
        removeNulls(mcpServerConfigurations.map((c) => c.mcpServerViewId)),
        {
          includeMetadata: withToolMetadata,
          includeHeavyAttributes: [
            "authorization",
            "cachedTools",
            "customHeaders",
            "lastError",
            "sharedSecret",
          ],
        }
      );
    }

    const skillMCPServerConfigsBySkillId = groupBy(
      mcpServerConfigurations,
      "skillConfigurationId"
    );
    const mcpServerViewsById = new Map(
      allMCPServerViews.map((view) => [view.id, view])
    );

    const dataSourceConfigurations =
      await SkillDataSourceConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: {
            [Op.in]: customSkills.map((c) => c.id),
          },
        },
        transaction,
      });

    const dataSourceConfigsBySkillId = groupBy(
      dataSourceConfigurations,
      "skillConfigurationId"
    );

    const fileAttachmentModels = withFileAttachments
      ? await SkillFileAttachmentModel.findAll({
          where: {
            workspaceId: workspace.id,
            skillConfigurationId: {
              [Op.in]: allowedCustomSkillIds,
            },
          },
          transaction,
        })
      : [];

    const allFileResources = withFileAttachments
      ? await FileResource.fetchByModelIdsWithAuth(
          auth,
          fileAttachmentModels.map((a) => a.fileId),
          transaction
        )
      : [];

    const fileResourceById = new Map(allFileResources.map((f) => [f.id, f]));

    const fileAttachmentsBySkillId = groupBy(
      fileAttachmentModels,
      "skillConfigurationId"
    );

    allowedCustomSkillsRes = allowedCustomSkills.map((customSkill) => {
      const customSkillAttributes = {
        ...customSkill.get(),
        ...(withInstructions
          ? {}
          : { instructions: "", instructionsHtml: null }),
      };
      const skillMCPServerViewIds = skillMCPServerConfigsBySkillId[
        customSkill.id
      ]?.map((skillConfig) => skillConfig.mcpServerViewId);

      const skillDataSourceConfigs =
        dataSourceConfigsBySkillId[customSkill.id] ?? [];

      const skillMCPServerViews = removeNulls(
        [...new Set(skillMCPServerViewIds ?? [])].map(
          (viewId) => mcpServerViewsById.get(viewId) ?? null
        )
      );

      const resource = createResource(
        resourceClass.model,
        customSkillAttributes,
        {
          mcpServerConfigurations: skillMCPServerViews.map((view) => ({
            view,
          })),
          dataSourceConfigurations: skillDataSourceConfigs,
          fileAttachments: removeNulls(
            (fileAttachmentsBySkillId[customSkill.id] ?? []).map(
              (a) => fileResourceById.get(a.fileId) ?? null
            )
          ),
        },
        redactedCustomSkillIds.has(customSkill.id)
      );
      return resource;
    });
  }

  // Only include global skills if onlyCustom is not true.
  if (onlyCustom === true) {
    return allowedCustomSkillsRes;
  }

  const globalSkillDefinitions = await GlobalSkillsRegistry.findAll(
    auth,
    where
  );
  const systemSkillDefinitions = await SystemSkillsRegistry.findAll(
    auth,
    where
  );

  const allCodeDefinedSkills = [
    ...globalSkillDefinitions,
    ...systemSkillDefinitions,
  ];

  const enabledCodeDefinedSkills = allCodeDefinedSkills.filter(
    (def) => !agentLoopData || !def.isDisabledForAgentLoop?.(agentLoopData)
  );

  const effectiveSpaceIds = providedEffectiveSpaceIds ?? [];
  const requestedSpaceModelIds = removeNulls(
    effectiveSpaceIds.map(getResourceIdFromSId)
  );

  // Batch-fetch MCP server views for all enabled global skills in a single query.
  let mcpServerViews: MCPServerViewResource[] = [];
  if (withTools) {
    const mcpServerIds = uniq(
      enabledCodeDefinedSkills.flatMap(
        (def) => def.mcpServers?.map((s) => s.name) ?? []
      )
    ).map((name) =>
      autoInternalMCPServerNameToSId({ name, workspaceId: workspace.id })
    );
    const allMCPServerViews = await MCPServerViewResource.listByMCPServers(
      auth,
      mcpServerIds,
      {
        transaction,
        includeHeavyAttributes: [
          "authorization",
          "cachedTools",
          "customHeaders",
          "lastError",
          "sharedSecret",
        ],
      }
    );
    mcpServerViews = allMCPServerViews.filter(
      (view) =>
        requestedSpaceModelIds.includes(view.vaultId) ||
        view.space.kind === "global"
    );
  }

  const globalSkills = await concurrentExecutor(
    enabledCodeDefinedSkills,
    (def) =>
      fromGlobalSkill(resourceClass, createResource, auth, def, {
        agentLoopData,
        effectiveSpaceIds,
        mcpServerViews,
        withInstructions,
      }),
    { concurrency: 5 }
  );

  return [...allowedCustomSkillsRes, ...globalSkills];
}

async function fromGlobalSkill(
  resourceClass: typeof SkillResource,
  createResource: SkillResourceFactory,
  auth: Authenticator,
  def: SkillDefinition,
  {
    agentLoopData,
    effectiveSpaceIds,
    mcpServerViews,
    withInstructions = true,
  }: {
    agentLoopData?: AgentLoopExecutionData;
    effectiveSpaceIds: string[];
    mcpServerViews: MCPServerViewResource[];
    withInstructions?: boolean;
  }
): Promise<SkillResource> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  const requestedSpaceModelIds = removeNulls(
    effectiveSpaceIds.map(getResourceIdFromSId)
  );

  const viewsByServerId = groupBy(
    mcpServerViews.filter((v) => v.internalMCPServerId !== null),
    "internalMCPServerId"
  );

  const mcpServerConfigurations: SkillMCPServerConfiguration[] = (
    def.mcpServers ?? []
  ).flatMap(({ name, childAgentId, serverNameOverride }) =>
    (
      viewsByServerId[autoInternalMCPServerNameToSId({ name, workspaceId })] ??
      []
    ).map((view) => ({ view, childAgentId, serverNameOverride }))
  );

  const instructions = withInstructions
    ? def.fetchInstructions
      ? await def.fetchInstructions(auth, {
          spaceIds: effectiveSpaceIds,
          agentLoopData,
        })
      : def.instructions
    : "";

  return createResource(
    resourceClass.model,
    {
      editedBy: -1,
      createdAt: new Date(),
      agentFacingDescription: def.agentFacingDescription,
      userFacingDescription: def.userFacingDescription,
      // We fake the id here. We should rely exclusively on sId for global skills.
      id: -1,
      instructions,
      instructionsHtml: null,
      name: def.name,
      requestedSpaceIds: requestedSpaceModelIds,
      manuallyRequestedSpaceIds: [],
      status: "active",
      updatedAt: new Date(),
      workspaceId,
      icon: def.icon,
      source: null,
      sourceMetadata: null,
      availability: SystemSkillsRegistry.isSystemSkill(def.sId)
        ? "workspace_users"
        : "users_and_agents",
      favoriteCount: 0,
      reinforcement: "auto",
      lastReinforcementAnalysisAt: null,
      selfImprovementCostsCapMicroUsd: null,
      selfImprovementCostsCapAwuCredits: null,
      selfImprovementLock: false,
    },
    {
      // Global skills do not have data source configurations.
      dataSourceConfigurations: [],
      exposeInstructions: def.exposeInstructions,
      codeDefinedSkillId: def.sId,
      mcpServerConfigurations,
      fileAttachments: [],
      files: def.files ?? [],
    }
  );
}
