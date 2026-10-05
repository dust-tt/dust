import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  SEARCH_SKILLS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import { DEFAULT_PAGE_SIZE } from "@app/lib/api/actions/servers/workspace_management/metadata";
import {
  makeTextLines,
  renderFields,
  renderPageFooter,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { searchSkills } from "@app/lib/api/skills/search";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:aubin-tchoi,label:security;product] ranked-skill-tool-search
 * Search MUST use strict workspace-scoped ES search, preserve hit order, and paginate in ES.
 * Search failures MUST return an error, never an empty result or a database fallback.
 */
export const searchSkillsTool: ToolHandlers<
  typeof WORKSPACE_MANAGEMENT_TOOLS_METADATA
>[typeof SEARCH_SKILLS_TOOL_NAME] = async (
  { query, cursor = 0, limit = DEFAULT_PAGE_SIZE, ...filters },
  { auth }
) => {
  const result = await searchSkills(auth, {
    searchTerm: query,
    offset: cursor,
    limit,
    permissionFiltering: "strict",
    filters,
  });
  if (result.isErr()) {
    if (result.error === "offset_out_of_range") {
      return new Err(new MCPError(result.error, { tracked: false }));
    }
    return new Err(
      new MCPError("Failed to search skills", { cause: result.error })
    );
  }

  const { skills, total, hasMore } = result.value;
  if (cursor > 0 && cursor >= total) {
    return new Err(
      new MCPError(`cursor ${cursor} is out of range (total: ${total})`, {
        tracked: false,
      })
    );
  }

  return new Ok([
    makeTextLines([
      ...skills.map((skill) =>
        [
          `${skill.name} [${skill.sId}]`,
          renderFields({
            availability: skill.availability,
            status: skill.status,
          }),
          skill.userFacingDescription,
        ]
          .filter(Boolean)
          .join(" — ")
      ),
      renderPageFooter({
        shown: skills.length,
        total,
        nextCursor: hasMore ? cursor + limit : null,
      }),
    ]),
  ]);
};
