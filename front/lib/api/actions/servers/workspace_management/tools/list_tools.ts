import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  makeTextLines,
  paginate,
  renderFields,
  renderPageFooter,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { listAvailableTools } from "@app/lib/api/assistant/workspace_capabilities";
import { Err, Ok } from "@app/types/shared/result";

// Same inventory as sidekick's `get_available_tools`: the tools of the spaces the caller is a
// member of, minus the knowledge ones, which agents and skills configure as knowledge instead.
export async function listTools(
  {
    namePrefix,
    cursor,
    limit,
  }: {
    namePrefix?: string;
    cursor?: number;
    limit?: number;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const tools = await listAvailableTools(auth);

  const prefix = namePrefix?.toLowerCase();
  const filtered = prefix
    ? tools.filter((tool) => tool.name.toLowerCase().startsWith(prefix))
    : tools;

  const sorted = [...filtered].sort(
    (a, b) => a.name.localeCompare(b.name) || a.sId.localeCompare(b.sId)
  );

  const paginated = paginate(sorted, { cursor, limit });
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page, total, nextCursor } = paginated.value;

  if (total === 0) {
    return new Ok([{ type: "text" as const, text: "No tools found." }]);
  }

  return new Ok([
    makeTextLines([
      ...page.map((tool) =>
        [
          `${tool.name} [${tool.sId}]`,
          renderFields({
            type: tool.serverType,
            availability: tool.availability,
          }),
          tool.description,
        ]
          .filter(Boolean)
          .join(" — ")
      ),
      renderPageFooter({ shown: page.length, total, nextCursor }),
    ]),
  ]);
}
