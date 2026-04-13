import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";

import type { SeedContext, SkillSuggestionAsset } from "./types";

/**
 * Resolves tool edit IDs from internal MCP server names to workspace-specific MCPServerView sIds.
 */
async function resolveToolEdits(
  ctx: SeedContext,
  toolEdits: { action: "add" | "remove"; toolId: string }[]
): Promise<{ action: "add" | "remove"; toolId: string }[]> {
  const { auth } = ctx;

  const serverNamesToResolve = toolEdits
    .map((edit) => edit.toolId)
    .filter((id) => isInternalMCPServerName(id))
    .filter((id): id is AutoInternalMCPServerNameType =>
      isAutoInternalMCPServerName(id)
    );

  if (serverNamesToResolve.length === 0) {
    return toolEdits;
  }

  const mcpServerViews =
    await MCPServerViewResource.getMCPServerViewsForAutoInternalTools(
      auth,
      serverNamesToResolve
    );

  const serverNameToViewSId = new Map<string, string>();
  for (const view of mcpServerViews) {
    const viewJson = view.toJSON();
    if (viewJson) {
      serverNameToViewSId.set(viewJson.server.name, viewJson.sId);
    }
  }

  return toolEdits.map((edit) => {
    const resolvedId = serverNameToViewSId.get(edit.toolId);
    if (isInternalMCPServerName(edit.toolId) && resolvedId === undefined) {
      throw new Error(
        `Failed to resolve MCP server view ID for tool "${edit.toolId}"`
      );
    }
    return {
      ...edit,
      toolId: resolvedId ?? edit.toolId,
    };
  });
}

export async function seedSkillSuggestions(
  ctx: SeedContext,
  suggestions: SkillSuggestionAsset[],
  skills: Map<string, SkillResource>
): Promise<void> {
  const { auth, execute, logger } = ctx;

  const hasToolEdits = suggestions.some(
    (s) => s.suggestion.toolEdits && s.suggestion.toolEdits.length > 0
  );
  if (hasToolEdits) {
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  }

  for (const suggestionAsset of suggestions) {
    const skill = skills.get(suggestionAsset.skillName);
    if (!skill) {
      logger.warn(
        { skillName: suggestionAsset.skillName },
        "Skill not found for suggestion, skipping"
      );
      continue;
    }

    logger.info(
      { skillName: suggestionAsset.skillName },
      "Creating skill suggestion..."
    );

    if (execute) {
      const resolvedSuggestion = { ...suggestionAsset.suggestion };
      if (resolvedSuggestion.toolEdits) {
        resolvedSuggestion.toolEdits = await resolveToolEdits(
          ctx,
          resolvedSuggestion.toolEdits
        );
      }

      const created = await SkillSuggestionFactory.create(auth, skill, {
        kind: suggestionAsset.kind,
        suggestion: resolvedSuggestion,
        analysis: suggestionAsset.analysis,
        state: suggestionAsset.state,
        source: suggestionAsset.source,
      });
      logger.info(
        { sId: created.sId, skillName: suggestionAsset.skillName },
        "Skill suggestion created"
      );
    }
  }
}
