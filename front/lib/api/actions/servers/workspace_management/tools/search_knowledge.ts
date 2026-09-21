import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { searchKnowledge } from "@app/lib/api/assistant/workspace_capabilities";
import type { KnowledgeCategory } from "@app/types/api/public/spaces";
import { Err, Ok } from "@app/types/shared/result";

export async function searchKnowledgeTool(
  {
    query,
    topK,
    category,
  }: {
    query?: string;
    topK: number;
    category?: KnowledgeCategory;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const res = await searchKnowledge(auth, { query, topK, category });
  if (res.isErr()) {
    return new Err(
      new MCPError(`Failed to search knowledge: ${res.error.message}`)
    );
  }

  const { dataSourceViews, nodes, totalDataSourceViews } = res.value;
  if (totalDataSourceViews === 0) {
    return new Ok([
      {
        type: "text",
        text: JSON.stringify({
          dataSourceViews: [],
          nodes: [],
          message: "No knowledge sources found in the workspace.",
        }),
      },
    ]);
  }

  return new Ok([
    {
      type: "text",
      text: JSON.stringify({ dataSourceViews, nodes }, null, 2),
    },
  ]);
}
