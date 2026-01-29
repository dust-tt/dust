import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeCoreSearchNodesFilters } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { getSkillDataSourceConfigurations } from "@app/lib/api/assistant/skill_actions";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { Result, UserMessageType } from "@app/types";
import { CoreAPI, Err, isUserMessageType, Ok } from "@app/types";

const MAX_TEMPLATE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

/**
 * Fetches template content from a knowledge node using the agent's skills configuration.
 */
export async function fetchTemplateContent(
  auth: Authenticator,
  runContext: AgentLoopRunContextType,
  { templateNodeId }: { templateNodeId: string }
): Promise<Result<string, MCPError>> {
  const { agentConfiguration, conversation } = runContext;

  // Extract the last user message for dynamic skill instructions
  const lastUserMessage = conversation.content
    .map((tuple) => tuple[0])
    .filter((m): m is UserMessageType => isUserMessageType(m))
    .at(-1);

  // Fetch skills for this agent and conversation (same pattern as agent loop).
  const { enabledSkills } = await SkillResource.listForAgentLoop(auth, {
    agentConfiguration,
    conversation,
    userMessage: lastUserMessage,
  });

  // Get merged data source configurations from skills.
  const dataSourceConfigurations = await getSkillDataSourceConfigurations(
    auth,
    {
      skills: enabledSkills,
    }
  );

  if (dataSourceConfigurations.length === 0) {
    return new Err(
      new MCPError(
        "No data sources found in skills configuration. " +
          "Template nodes can only be used when the agent has skills with attached knowledge.",
        { tracked: false }
      )
    );
  }

  // Resolve DataSourceConfiguration[] to ResolvedDataSourceConfiguration[].
  const agentDataSourceConfigurations = [];
  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    dataSourceConfigurations.map((c) => c.dataSourceViewId)
  );

  const dataSourceViewMap = new Map<string, DataSourceViewResource>();
  for (const view of dataSourceViews) {
    dataSourceViewMap.set(view.sId, view);
  }

  for (const config of dataSourceConfigurations) {
    const dataSourceView = dataSourceViewMap.get(config.dataSourceViewId);
    if (!dataSourceView) {
      return new Err(
        new MCPError(`Data source view not found: ${config.dataSourceViewId}`, {
          tracked: false,
        })
      );
    }

    const dataSource = dataSourceView.dataSource;

    agentDataSourceConfigurations.push({
      ...config,
      dataSource: {
        dustAPIProjectId: dataSource.dustAPIProjectId,
        dustAPIDataSourceId: dataSource.dustAPIDataSourceId,
        connectorProvider: dataSource.connectorProvider,
        name: dataSource.name,
      },
      dataSourceView,
    });
  }

  // Search for the template node.
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const searchResult = await coreAPI.searchNodes({
    filter: {
      node_ids: [templateNodeId],
      data_source_views: makeCoreSearchNodesFilters({
        agentDataSourceConfigurations,
      }),
    },
  });

  if (searchResult.isErr() || searchResult.value.nodes.length === 0) {
    return new Err(
      new MCPError(
        `Could not find template node: ${templateNodeId}. ${
          searchResult.isErr()
            ? `Error: ${searchResult.error.message}`
            : "The node may not exist or may not be accessible through your skills configuration."
        }`,
        { tracked: false }
      )
    );
  }

  const node = searchResult.value.nodes[0];
  if (node.node_type !== "document") {
    return new Err(
      new MCPError(
        `Template node is of type ${node.node_type}, not a document. Only document nodes can be used as templates.`,
        { tracked: false }
      )
    );
  }

  // Get dataSource from the data source configuration.
  const dataSource = agentDataSourceConfigurations.find(
    (config) => config.dataSource.dustAPIDataSourceId === node.data_source_id
  )?.dataSource;

  if (!dataSource) {
    return new Err(
      new MCPError(
        `Could not find data source for template node: ${templateNodeId}`,
        { tracked: false }
      )
    );
  }

  // Read the template node content.
  const readResult = await coreAPI.getDataSourceDocumentText({
    dataSourceId: node.data_source_id,
    documentId: node.node_id,
    projectId: dataSource.dustAPIProjectId,
  });
  if (readResult.isErr()) {
    return new Err(
      new MCPError(
        `Could not read template node: ${templateNodeId}. Error: ${readResult.error.message}`,
        { tracked: false }
      )
    );
  }

  const templateContent = readResult.value.text;
  if (templateContent.length > MAX_TEMPLATE_SIZE_BYTES) {
    return new Err(
      new MCPError(
        `Template content is too large (${templateContent.length} bytes). Maximum size is ${MAX_TEMPLATE_SIZE_BYTES} bytes (1MB).`,
        { tracked: false }
      )
    );
  }

  return new Ok(templateContent);
}
