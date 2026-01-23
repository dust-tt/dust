import assert from "assert";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type {
  ContentNodeAttachmentType,
  ConversationAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  isContentFragmentDataSourceNode,
  isContentNodeAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { isSearchableFolder } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";

/**
 * Get folder search MCP servers for each searchable folder attachment.
 * Creates one search server per folder.
 */
export async function getFolderSearchServers(
  auth: Authenticator,
  attachments: ConversationAttachmentType[]
): Promise<ServerSideMCPServerConfigurationType[]> {
  const retrievalView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "search"
    );

  assert(
    retrievalView,
    "MCP server view not found for search. Ensure auto tools are created."
  );

  const searchableFolders: ContentNodeAttachmentType[] = [];
  for (const attachment of attachments) {
    if (
      isContentNodeAttachmentType(attachment) &&
      isSearchableFolder(attachment)
    ) {
      searchableFolders.push(attachment);
    }
  }

  const servers: ServerSideMCPServerConfigurationType[] = [];

  for (const [i, folder] of searchableFolders.entries()) {
    const dataSources: DataSourceConfiguration[] = [
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        dataSourceViewId: folder.nodeDataSourceViewId,
        filter: {
          parents: isContentFragmentDataSourceNode(folder)
            ? null
            : {
                in: [folder.nodeId],
                not: [],
              },
          tags: null,
        },
      },
    ];

    servers.push({
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_server_configuration",
      name: `search_folder_${i}`,
      description: `Search content within the documents inside "${folder.title}"`,
      dataSources,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      secretName: null,
      additionalConfiguration: {},
      mcpServerViewId: retrievalView.sId,
      dustAppConfiguration: null,
      internalMCPServerId: retrievalView.mcpServerId,
    });
  }

  return servers;
}
