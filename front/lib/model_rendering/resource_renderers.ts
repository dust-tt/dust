import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  isBrowseResultResourceType,
  isDataSourceNodeListType,
  isIncludeQueryResourceType,
  isRunAgentQueryResourceType,
  isRunAgentResultResourceType,
  isSearchQueryResourceType,
  isSearchResultResourceType,
  isToolMarkerResourceType,
  isWebsearchQueryResourceType,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function renderResourceForModel(
  block: CallToolResult["content"][number]
): string {
  if (
    isRunAgentQueryResourceType(block) ||
    isSearchQueryResourceType(block) ||
    isIncludeQueryResourceType(block) ||
    isWebsearchQueryResourceType(block) ||
    isToolMarkerResourceType(block)
  ) {
    // We explicitly ignore those.
    return "";
  } else if (isRunAgentResultResourceType(block)) {
    const refs = block.resource.refs;

    let text = "";

    if (refs && Object.keys(refs).length > 0) {
      const refsText = Object.entries(refs)
        .map(([ref, citation]) => {
          return `- ${ref}: ${maybeRenderLink(citation.title, citation.href)} - ${citation.provider}`;
        })
        .join("\n");

      text += `# Citations references:\n${refsText}\n`;
    }

    text += `# Output:\n${block.resource.text}`;

    return text;
  } else if (isDataSourceNodeListType(block)) {
    let text = `Retrieved ${block.resource.resultCount} nodes (next page cursor: ${block.resource.nextPageCursor}):`;

    for (const node of block.resource.data) {
      text += "\n-----------\n";
      text += `${maybeRenderLink(node.title, node.sourceUrl)}\n`;
      text += `mimeType: ${node.mimeType}${node.connectorProvider ? ` (connector provider: ${node.connectorProvider})` : ""}\n`;
      text += `hasChildren: ${node.hasChildren}\n`;
      text += `lastUpdatedAt: ${node.lastUpdatedAt}\n`;
      text += `connectorProvider: ${node.connectorProvider}\n`;
      text += `parentTitle: ${node.parentTitle} (path: ${node.path})\n`;
    }

    return text;
  } else if (isSearchResultResourceType(block)) {
    let text = `Search result: ${block.resource.text}\n`;
    text += `id: ${block.resource.id}\n`;
    text += `uri: ${block.resource.uri}\n`;
    text += `ref: ${block.resource.ref}\n`;
    text += `source: ${block.resource.source.provider}\n`;
    text += `mimeType: ${block.resource.mimeType}\n`;

    if (block.resource.tags.length > 0) {
      text += `tags: ${block.resource.tags.join(", ")}\n`;
    }
    if (block.resource.chunks.length > 0) {
      text += `retrieved chunks:\n-----------\n${block.resource.chunks.join("------------")}`;
    }
    return text;
  } else if (isWebsearchResultResourceType(block)) {
    let text = `${maybeRenderLink(block.resource.title, block.resource.uri)}\n`;
    text += `ref: ${block.resource.reference}\n`;
    text += `${block.resource.text}\n`;
    return text;
  } else if (isBrowseResultResourceType(block)) {
    let text = `${maybeRenderLink(block.resource.title ?? "Web page", block.resource.uri)}\n`;
    if (block.resource.html) {
      text += `${block.resource.html}\n`;
    } else {
      text += `${block.resource.text}\n`;
    }
    if (block.resource.errorMessage) {
      text += `error: ${block.resource.errorMessage}\n`;
    }
    if (block.resource.responseCode !== "200") {
      text += `response code: ${block.resource.responseCode}\n`;
    }
    return text;
  } else {
    return JSON.stringify(block);
  }
}

function maybeRenderLink(t: string, href?: string | null) {
  if (href) {
    return `[${t}](${href})`;
  }
  return t;
}
