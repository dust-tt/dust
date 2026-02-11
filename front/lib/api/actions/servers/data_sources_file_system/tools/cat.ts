import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { Err, Ok } from "@app/types/shared/result";

import {
  makeDocumentResource,
  readDocumentNode,
} from "@app/lib/api/actions/servers/data_sources_file_system/tools/utils";

export async function cat(
  {
    dataSources,
    nodeId,
    grep,
  }: {
    dataSources: DataSourcesToolConfigurationType;
    nodeId: string;
    grep?: string;
  },
  context: { auth?: Authenticator; agentLoopContext?: AgentLoopContextType }
) {
  const result = await readDocumentNode({ dataSources, nodeId }, context);
  if (result.isErr()) {
    return result;
  }

  const { node, dataSource, coreAPI } = result.value;

  const readResult = await coreAPI.getDataSourceDocumentText({
    dataSourceId: node.data_source_id,
    documentId: node.node_id,
    projectId: dataSource.dustAPIProjectId,
    grep,
  });

  if (readResult.isErr()) {
    return new Err(
      new MCPError(
        `Could not read node: ${nodeId} (error: ${readResult.error.message})`,
        {
          tracked: readResult.error.code !== "invalid_regex",
        }
      )
    );
  }

  return makeDocumentResource(result.value, node, readResult.value.text);
}
