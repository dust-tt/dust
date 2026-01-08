import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { LightAgentConfigurationType } from "@app/types";
import { removeNulls } from "@app/types";

const SKIL_KNOWLEDGE_FILE_SYSTEM_SERVER_NAME = "skill_knowledge_file_system";

export async function getSkillServers(
  auth: Authenticator,
  {
    agentConfiguration,
    skills,
  }: {
    agentConfiguration: LightAgentConfigurationType;
    skills: SkillResource[];
  }
): Promise<MCPServerConfigurationType[]> {
  const rawInheritedDataSourceViews = await concurrentExecutor(
    skills,
    (skill) => skill.listInheritedDataSourceViews(auth, agentConfiguration),
    { concurrency: 5 }
  );
  const inheritedDataSourceViews = removeNulls(
    rawInheritedDataSourceViews.flat()
  );
  const dataSources: DataSourceConfiguration[] = inheritedDataSourceViews.map(
    (view) => ({
      dataSourceViewId: view.sId,
      workspaceId: auth.getNonNullableWorkspace().sId,
      filter: view.toViewFilter(),
    })
  );

  return skills.flatMap((skill) =>
    skill.mcpServerViews.map((mcpServerView) => {
      return buildServerSideMCPServerConfiguration({
        mcpServerView,
        dataSources,
      });
    })
  );
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
    serverNameOverride: SKIL_KNOWLEDGE_FILE_SYSTEM_SERVER_NAME,
  });
}
