import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:fabiencelier,label:security;product] suggestable-tools-match-list-tools
 * A tool that a suggestion adds to or removes from an agent MUST be one `listAvailableTools` offers
 * the caller: a view of a global or regular space the caller is a member of, of a `manual` or
 * `auto` server, and not restricted to skills (the agent save silently drops those). Recording and
 * applying a tool suggestion both resolve its tool through this, so a tool that stopped qualifying
 * in between is refused when the suggestion is accepted.
 */
export async function fetchSuggestableTools(
  auth: Authenticator,
  toolIds: string[]
): Promise<Map<string, MCPServerViewType>> {
  if (toolIds.length === 0) {
    return new Map();
  }

  const views = await MCPServerViewResource.fetchByIds(auth, toolIds, {
    mode: "configuration",
    isRestrictedToSkills: false,
  });

  const suggestable = new Map<string, MCPServerViewType>();
  for (const view of views) {
    if (
      !auth.can("read", view) ||
      (view.space.kind !== "global" && view.space.kind !== "regular") ||
      !view.space.isMember(auth)
    ) {
      continue;
    }
    const json = view.toJSON();
    if (
      json &&
      (json.server.availability === "manual" ||
        json.server.availability === "auto")
    ) {
      suggestable.set(view.sId, json);
    }
  }

  return suggestable;
}

/**
 * The tool a suggestion adds, among the `suggestable` ones (see `fetchSuggestableTools`): it must
 * need no configuration, since a suggestion only adds it with its defaults (knowledge and sub-agent
 * tools always need some).
 */
export function checkToolAddition(
  toolId: string,
  suggestable: Map<string, MCPServerViewType>
): Result<MCPServerViewType, string> {
  const view = suggestable.get(toolId);
  if (!view) {
    return new Err(`Tool "${toolId}" is invalid or not accessible.`);
  }
  if (!getMCPServerRequirements(view).noRequirement) {
    return new Err(
      `Tool "${toolId}" needs a configuration (knowledge, a sub-agent or settings) that a ` +
        "suggestion cannot set: ask the user to add it from the agent builder."
    );
  }
  return new Ok(view);
}

/**
 * A suggestion only removes what it could add: a tool that is used by a single action of the agent
 * and needs no configuration. Several actions can share a tool (knowledge or sub-agent tools
 * configured differently), and removing the tool would remove them all.
 */
export function checkToolRemoval(
  toolId: string,
  suggestable: Map<string, MCPServerViewType>,
  actions: { mcpServerViewId: string }[]
): Result<undefined, string> {
  const actionCount = actions.filter(
    (action) => action.mcpServerViewId === toolId
  ).length;
  if (actionCount === 0) {
    return new Err(`The agent does not have the tool "${toolId}".`);
  }
  if (actionCount > 1 || checkToolAddition(toolId, suggestable).isErr()) {
    return new Err(
      `Tool "${toolId}" cannot be removed by a suggestion (it is used by several actions, or ` +
        "configured with knowledge, a sub-agent or settings): ask the user to remove it from " +
        "the agent builder."
    );
  }
  return new Ok(undefined);
}
