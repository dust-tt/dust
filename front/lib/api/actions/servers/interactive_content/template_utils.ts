import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  makeCoreSearchNodesFilters,
  type ResolvedDataSourceConfiguration,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import { getSkillDataSourceConfigurations } from "@app/lib/api/assistant/skill_actions";
import config from "@app/lib/api/config";
import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_TEMPLATE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

async function fetchTemplateFromCanonicalPath(
  auth: Authenticator,
  runContext: AgentLoopRunContextType,
  canonicalPath: string
): Promise<Result<string, MCPError>> {
  const { conversation } = runContext;

  const fsResult = await DustFileSystem.forAgentLoop(auth, {
    conversation,
    scopedPaths: [canonicalPath],
  });
  if (fsResult.isErr()) {
    return new Err(
      new MCPError(
        `Could not access file system for template path: ${canonicalPath}. Error: ${fsResult.error.message}`,
        { tracked: false }
      )
    );
  }

  const dustFs = fsResult.value;

  const statResult = await dustFs.stat(canonicalPath);
  if (statResult.isErr()) {
    return new Err(
      new MCPError(
        `Could not stat template file: ${canonicalPath}. Error: ${statResult.error.message}`,
        { tracked: false }
      )
    );
  }
  if (!statResult.value) {
    return new Err(
      new MCPError(
        `Template file not found: ${canonicalPath}. The file may not exist or may not be accessible.`,
        { tracked: false }
      )
    );
  }

  if (statResult.value.sizeBytes > MAX_TEMPLATE_SIZE_BYTES) {
    return new Err(
      new MCPError(
        `Template content is too large (${statResult.value.sizeBytes} bytes). Maximum size is ${MAX_TEMPLATE_SIZE_BYTES} bytes.`,
        { tracked: false }
      )
    );
  }

  const readResult = await dustFs.readBuffer(canonicalPath);
  if (readResult.isErr()) {
    return new Err(
      new MCPError(
        `Could not read template file: ${canonicalPath}. Error: ${readResult.error.message}`,
        { tracked: readResult.error.code === "internal" }
      )
    );
  }
  if (readResult.value === null) {
    return new Err(
      new MCPError(`Template file not found: ${canonicalPath}.`, {
        tracked: false,
      })
    );
  }

  return new Ok(readResult.value.toString("utf-8"));
}

/**
 * Fetches template content from a knowledge node (by node ID) or a canonical file system path.
 *
 * - Node ID: looks up the document via the Core API across the agent's data sources.
 * - Canonical path (e.g. `pod-{spaceId}/...` or `conversation-{cId}/...`): reads directly from the DustFileSystem.
 */
export async function fetchTemplateContent(
  auth: Authenticator,
  runContext: AgentLoopRunContextType,
  {
    templateRef,
  }: {
    templateRef: string;
  }
): Promise<Result<string, MCPError>> {
  // Reject file IDs, we have seen cases where the model confuses file IDs with template refs.
  if (isResourceSId("file", templateRef)) {
    return new Err(
      new MCPError(
        `Invalid template reference: "${templateRef}" is a file ID, not a template node ID or canonical path. ` +
          "If the file comes from the conversation, please read it and pass as the `source` " +
          "parameter in `inline` mode.",
        { tracked: false }
      )
    );
  }

  if (parseScopedPrefix(templateRef)) {
    return fetchTemplateFromCanonicalPath(auth, runContext, templateRef);
  }

  const { agentConfiguration, conversation } = runContext;

  // Fetch skills for this agent and conversation (same pattern as agent loop).
  const { enabledSkills, systemSkills } = await SkillResource.listForAgentLoop(
    auth,
    {
      agentConfiguration,
      conversation,
    }
  );

  // Get merged data source configurations from skills.
  const { documentDataSourceConfigurations: skillDataSourceConfigurations } =
    await getSkillDataSourceConfigurations(auth, {
      skills: [...systemSkills, ...enabledSkills],
    });

  // Also collect data source configurations from the agent's actions.
  const actionDataSourceConfigurations: DataSourceConfiguration[] =
    agentConfiguration.actions
      .filter(isServerSideMCPServerConfiguration)
      .flatMap((action) => action.dataSources ?? []);

  const dataSourceConfigurations = [
    ...skillDataSourceConfigurations,
    ...actionDataSourceConfigurations,
  ];

  if (dataSourceConfigurations.length === 0) {
    return new Err(
      new MCPError(
        "No data sources found in agent configuration. " +
          "Template nodes can only be used when the agent has data sources attached.",
        { tracked: false }
      )
    );
  }

  // Resolve DataSourceConfiguration[] to ResolvedDataSourceConfiguration[].
  const agentDataSourceConfigurations: ResolvedDataSourceConfiguration[] = [];
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
      node_ids: [templateRef],
      data_source_views: makeCoreSearchNodesFilters({
        agentDataSourceConfigurations,
      }),
    },
  });

  if (searchResult.isErr() || searchResult.value.nodes.length === 0) {
    return new Err(
      new MCPError(
        `Could not find template node: ${templateRef}. ${
          searchResult.isErr()
            ? `Error: ${searchResult.error.message}`
            : "The node may not exist or may not be accessible through the agent's configuration."
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
        `Could not find data source for template node: ${templateRef}`,
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
        `Could not read template node: ${templateRef}. Error: ${readResult.error.message}`,
        { tracked: false }
      )
    );
  }

  const templateContent = readResult.value.text;
  if (templateContent.length > MAX_TEMPLATE_SIZE_BYTES) {
    return new Err(
      new MCPError(
        `Template content is too large (${templateContent.length} bytes). Maximum size is ${MAX_TEMPLATE_SIZE_BYTES} bytes.`,
        { tracked: false }
      )
    );
  }

  return new Ok(templateContent);
}
