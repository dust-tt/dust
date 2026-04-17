import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import { removeNulls } from "@app/types/shared/utils/general";

const SKILL_KNOWLEDGE_FILE_SYSTEM_SERVER_NAME = "skill_knowledge_file_system";
const SKILL_KNOWLEDGE_DATA_WAREHOUSE_SERVER_NAME =
  "skill_knowledge_data_warehouse";

const SKILL_AUTO_INTERNAL_SERVER_NAMES = [
  "data_sources_file_system",
  "data_warehouses",
] as const satisfies readonly AutoInternalMCPServerNameType[];

export async function getSkillServers(
  auth: Authenticator,
  {
    agentConfiguration,
    skills,
  }: {
    agentConfiguration: LightAgentConfigurationType;
    skills: (SkillResource & { extendedSkill: SkillResource | null })[];
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

  const remoteDbViews = inheritedDataSourceViews.filter((v) =>
    isRemoteDatabase(v.dataSource)
  );
  const nonRemoteDbViews = inheritedDataSourceViews.filter(
    (v) => !isRemoteDatabase(v.dataSource)
  );

  const mcpServers = skills.flatMap((skill) =>
    [
      ...skill.mcpServerConfigurations,
      ...(skill.extendedSkill?.mcpServerConfigurations ?? []),
    ].map((config) => {
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

  const {
    documentDataSourceConfigurations,
    warehouseDataSourceConfigurations,
  } = await getSkillDataSourceConfigurations(auth, { skills });

  // Only fetch auto-internal knowledge views when a skill has attached
  // knowledge configurations; otherwise the fetch returns unused rows.
  const hasKnowledge =
    documentDataSourceConfigurations.length > 0 ||
    warehouseDataSourceConfigurations.length > 0;
  const autoInternalViews = hasKnowledge
    ? await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
        auth,
        SKILL_AUTO_INTERNAL_SERVER_NAMES
      )
    : new Map<AutoInternalMCPServerNameType, MCPServerViewResource>();

  const [fileSystemServer, dataWarehouseServer] = await Promise.all([
    createSkillKnowledgeFileSystemServer(auth, {
      dataSourceConfigurations: documentDataSourceConfigurations,
      mcpServerView: autoInternalViews.get("data_sources_file_system") ?? null,
    }),
    createSkillKnowledgeDataWarehouseServer(auth, {
      dataSourceConfigurations: warehouseDataSourceConfigurations,
      mcpServerView: autoInternalViews.get("data_warehouses") ?? null,
    }),
  ]);

  return [
    ...mcpServers,
    ...removeNulls([fileSystemServer, dataWarehouseServer]),
  ];
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
): Promise<{
  documentDataSourceConfigurations: DataSourceConfiguration[];
  warehouseDataSourceConfigurations: DataSourceConfiguration[];
}> {
  // Filter skills that have attached knowledge.
  const skillsWithKnowledge = skills.filter(
    (skill) => skill.dataSourceConfigurations.length > 0
  );

  if (skillsWithKnowledge.length === 0) {
    return {
      documentDataSourceConfigurations: [],
      warehouseDataSourceConfigurations: [],
    };
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

  // Build configurations split by type, grouped by dataSourceViewId (sId).
  const documentConfigsByViewId = new Map<string, DataSourceConfiguration>();
  const warehouseConfigsByViewId = new Map<string, DataSourceConfiguration>();

  for (const skill of skillsWithKnowledge) {
    for (const config of skill.dataSourceConfigurations) {
      const view = viewsByModelId.get(config.dataSourceViewId);

      if (!view) {
        // Skip configurations where the data source view doesn't exist or user has no access.
        continue;
      }

      const targetMap = isRemoteDatabase(view.dataSource)
        ? warehouseConfigsByViewId
        : documentConfigsByViewId;

      const existingConfig = targetMap.get(view.sId);
      if (existingConfig) {
        // Merge parentsIn arrays for duplicate data source views.
        const mergedParentsIn = Array.from(
          new Set([
            ...(existingConfig.filter.parents?.in ?? []),
            ...config.parentsIn,
          ])
        );

        targetMap.set(view.sId, {
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
        targetMap.set(view.sId, {
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

  return {
    documentDataSourceConfigurations: Array.from(
      documentConfigsByViewId.values()
    ),
    warehouseDataSourceConfigurations: Array.from(
      warehouseConfigsByViewId.values()
    ),
  };
}

/**
 * Creates a file system server configuration scoped to the provided data source configurations.
 * Returns null if no configurations are provided or the server view doesn't exist.
 */
async function createSkillKnowledgeFileSystemServer(
  auth: Authenticator,
  {
    dataSourceConfigurations,
    mcpServerView,
  }: {
    dataSourceConfigurations: DataSourceConfiguration[];
    mcpServerView: MCPServerViewResource | null;
  }
): Promise<MCPServerConfigurationType | null> {
  if (dataSourceConfigurations.length === 0 || !mcpServerView) {
    return null;
  }

  return buildServerSideMCPServerConfiguration({
    mcpServerView,
    dataSources: dataSourceConfigurations,
    serverNameOverride: SKILL_KNOWLEDGE_FILE_SYSTEM_SERVER_NAME,
  });
}

/**
 * Creates a data warehouse server configuration scoped to the provided data source configurations.
 * Returns null if no configurations are provided or the server view doesn't exist.
 */
async function createSkillKnowledgeDataWarehouseServer(
  auth: Authenticator,
  {
    dataSourceConfigurations,
    mcpServerView,
  }: {
    dataSourceConfigurations: DataSourceConfiguration[];
    mcpServerView: MCPServerViewResource | null;
  }
): Promise<MCPServerConfigurationType | null> {
  if (dataSourceConfigurations.length === 0 || !mcpServerView) {
    return null;
  }

  return buildServerSideMCPServerConfiguration({
    mcpServerView,
    dataSources: dataSourceConfigurations,
    serverNameOverride: SKILL_KNOWLEDGE_DATA_WAREHOUSE_SERVER_NAME,
  });
}

/**
 * Resolves all skill-based MCP servers for an agent in a conversation.
 */
export async function resolveSkillMCPServers(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
  }
): Promise<MCPServerConfigurationType[]> {
  const { enabledSkills } = await SkillResource.listForAgentLoop(auth, {
    agentConfiguration,
    conversation,
  });

  if (enabledSkills.length === 0) {
    return [];
  }

  return getSkillServers(auth, {
    agentConfiguration,
    skills: enabledSkills,
  });
}
