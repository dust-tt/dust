import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  isRunAgentQueryResourceType,
  isRunAgentResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function renderResourceForModel(
  block: CallToolResult["content"][number]
): string {
  if (isRunAgentQueryResourceType(block)) {
    // Don't render run agent queries (already contained in tool call args).
    return "";
  }

  if (isRunAgentResultResourceType(block)) {
    const refs = block.resource.refs;
    if (refs) {
      const maybeRenderLink = (c: { title: string; href?: string }) => {
        if (c.href) {
          return `[${c.title}](${c.href})`;
        }
        return c.title;
      };

      const refsText = Object.entries(refs)
        .map(([ref, citation]) => {
          return `- ${ref}: ${maybeRenderLink({ title: citation.title, href: citation.href })} - ${citation.provider}`;
        })
        .join("\n");

      return `# Citations references:\n${refsText}\n\n# Output:\n${block.resource.text}`;
    }
  }

  return JSON.stringify(block);
}
