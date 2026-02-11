import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err } from "@app/types";

import {
  makeDocumentResource,
  readDocumentNode,
} from "@app/lib/api/actions/servers/data_sources_file_system/tools/utils";

export async function tail(
  {
    dataSources,
    nodeId,
    n,
  }: {
    dataSources: DataSourcesToolConfigurationType;
    nodeId: string;
    n: number;
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
  });

  if (readResult.isErr()) {
    return new Err(
      new MCPError(
        `Could not read node: ${nodeId} (error: ${readResult.error.message})`,
        { tracked: false }
      )
    );
  }

  const text = readResult.value.text.split("\n").slice(-n).join("\n");

  return makeDocumentResource(result.value, node, text);
}
