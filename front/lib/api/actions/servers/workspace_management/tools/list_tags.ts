import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeTextLines } from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { TagResource } from "@app/lib/resources/tags_resource";
import { Ok } from "@app/types/shared/result";

// Same listing as GET /api/w/:wId/tags, open to every member. Workspaces hold a few dozen tags, so
// the list is not paginated.
export async function listTags(
  _args: Record<string, never>,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const tags = await TagResource.findAll(auth);

  if (tags.length === 0) {
    return new Ok([{ type: "text" as const, text: "No tags found." }]);
  }

  return new Ok([
    makeTextLines(
      tags.map(
        (tag) =>
          `${tag.name} [${tag.sId}]` +
          (tag.kind === "protected" ? " - protected" : "")
      )
    ),
  ]);
}
