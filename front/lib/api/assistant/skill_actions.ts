import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { LightAgentConfigurationType } from "@app/types";
import { removeNulls } from "@app/types";

const SKILL_KNOWLEDGE_FILE_SYSTEM_SERVER_NAME = "skill_knowledge_file_system";

type SkillWithExtendedSkill = SkillResource & {
  extendedSkill: SkillResource | null;
};

/**
 * Resolves skill MCP servers, filtering out skills whose servers all require data sources
 * that are unavailable.
 */
export async function getSkillServers(
  auth: Authenticator,
  {
    agentConfiguration,
    skills,
  }: {
    agentConfiguration: LightAgentConfigurationType;
    skills: SkillWithExtendedSkill[];
  }
): Promise<{
  servers: MCPServerConfigurationType[];
  enabledSkills: SkillWithExtendedSkill[];
}> {
  const rawInheritedDataSourceViews = await concurrentExecutor(
    skills,
    (skill) => skill.listInheritedDataSourceViews(auth, agentConfiguration),
    { concurrency: 5 }
  );
  const inheritedDataSourceViews = removeNulls(
    rawInheritedDataSourceViews.flat()
  );

  const remoteDbViews = inheritedDataSourceViews.filter((v) =>
    isRemoteDatabase(v.dataSource)
  );
  const nonRemoteDbViews = inheritedDataSourceViews.filter(
    (v) => !isRemoteDatabase(v.dataSource)
  );

  const enabledSkills: SkillWithExtendedSkill[] = [];
  const servers: MCPServerConfigurationType[] = [];

  for (const skill of skills) {
    const configs = [
      ...skill.mcpServerConfigurations,
      ...(skill.extendedSkill?.mcpServerConfigurations ?? []),
    ];

    const resolvedConfigs = removeNulls(
      configs.map((config) => {
        const { view, childAgentId, serverNameOverride } = config;

        const {
          requiresDataWarehouseConfiguration,
          requiresDataSourceConfiguration,
        } = getMCPServerRequirements(view.toJSON());

        let applicableViews: DataSourceViewResource[];
        if (requiresDataWarehouseConfiguration) {
          applicableViews = remoteDbViews;
        } else if (requiresDataSourceConfiguration) {
          applicableViews = nonRemoteDbViews;
        } else {
          applicableViews = [];
        }

        if (
          (requiresDataWarehouseConfiguration ||
            requiresDataSourceConfiguration) &&
          applicableViews.length === 0
        ) {
          return null;
        }

        const dataSources = applicableViews.map((dsView) => ({
          dataSourceViewId: dsView.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          filter: dsView.toViewFilter(),
        }));

        return buildServerSideMCPServerConfiguration({
          mcpServerView: view,
          dataSources,
          childAgentId,
          serverNameOverride,
        });
      })
    );

    // Only include the skill if it has no server configs or at least one resolved.
    if (configs.length === 0 || resolvedConfigs.length > 0) {
      enabledSkills.push(skill);
    }

    servers.push(...resolvedConfigs);
  }

  return { servers, enabledSkills };
}

/**
 * Extracts and deduplicates data source configurations from skills with attached knowledge.
 * Returns an array of merged configurations, or empty array if no skills have knowledge.
 */
export async function getSkillDataSourceConfigurations(
  auth: Authenticator,
  {
    skills,
  }: {
    skills: SkillResource[];
  }
): Promise<DataSourceConfiguration[]> {
  // Filter skills that have attached knowledge.
  const skillsWithKnowledge = skills.filter(
    (skill) => skill.dataSourceConfigurations.length > 0
  );

  if (skillsWithKnowledge.length === 0) {
    return [];
  }

  // Extract all unique dataSourceViewIds from skill configurations.
  const dataSourceViewModelIds = Array.from(
    new Set(
      skillsWithKnowledge.flatMap((skill) =>
        skill.dataSourceConfigurations.map((config) => config.dataSourceViewId)
      )
    )
  );

  const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
    auth,
    dataSourceViewModelIds
  );

  // Create a map for efficient lookup: ModelId -> DataSourceViewResource.
  const viewsByModelId = new Map(
    dataSourceViews.map((view) => [view.id, view])
  );

  // Build configurations with parentsIn filters, grouped by dataSourceViewId (sId).
  const configsByViewId = new Map<string, DataSourceConfiguration>();

  for (const skill of skillsWithKnowledge) {
    for (const config of skill.dataSourceConfigurations) {
      const view = viewsByModelId.get(config.dataSourceViewId);

      if (!view) {
        // Skip configurations where the data source view doesn't exist or user has no access.
        continue;
      }

      const existingConfig = configsByViewId.get(view.sId);
      if (existingConfig) {
        // Merge parentsIn arrays for duplicate data source views.
        const mergedParentsIn = Array.from(
          new Set([
            ...(existingConfig.filter.parents?.in ?? []),
            ...config.parentsIn,
          ])
        );

        configsByViewId.set(view.sId, {
          ...existingConfig,
          filter: {
            ...existingConfig.filter,
            parents: {
              in: mergedParentsIn,
              not: null,
            },
          },
        });
      } else {
        // Create new configuration.
        configsByViewId.set(view.sId, {
          dataSourceViewId: view.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          filter: {
            parents: {
              in: config.parentsIn,
              not: null,
            },
            tags: null,
          },
        });
      }
    }
  }

  return Array.from(configsByViewId.values());
}

/**
 * Creates a file system server configuration scoped to the provided data source configurations.
 * Returns null if no configurations are provided or the server view doesn't exist.
 */
export async function createSkillKnowledgeFileSystemServer(
  auth: Authenticator,
  {
    dataSourceConfigurations,
  }: {
    dataSourceConfigurations: DataSourceConfiguration[];
  }
): Promise<MCPServerConfigurationType | null> {
  if (dataSourceConfigurations.length === 0) {
    return null;
  }

  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "data_sources_file_system"
    );

  if (!mcpServerView) {
    return null;
  }

  return buildServerSideMCPServerConfiguration({
    mcpServerView,
    dataSources: dataSourceConfigurations,
    serverNameOverride: SKILL_KNOWLEDGE_FILE_SYSTEM_SERVER_NAME,
  });
}
