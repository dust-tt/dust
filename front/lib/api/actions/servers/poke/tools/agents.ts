import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { POKE_TOOLS_METADATA } from "@app/lib/api/actions/servers/poke/metadata";
import {
  GET_WORKSPACE_AGENT_TOOL_NAME,
  LIST_WORKSPACE_AGENTS_TOOL_NAME,
} from "@app/lib/api/actions/servers/poke/metadata";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAuthors, getEditors } from "@app/lib/api/assistant/editors";
import { Err } from "@app/types/shared/result";

type AgentHandlers = Pick<
  ToolHandlers<typeof POKE_TOOLS_METADATA>,
  typeof LIST_WORKSPACE_AGENTS_TOOL_NAME | typeof GET_WORKSPACE_AGENT_TOOL_NAME
>;

// In-memory cursor for stateless pagination.
// Results may be inconsistent across page boundaries if agents are updated
// concurrently — acceptable for diagnostic use.
function encodeCursor(sortKey: string, sId: string): string {
  return Buffer.from(JSON.stringify({ sortKey, sId })).toString("base64url");
}

function decodeCursor(cursor: string): { sortKey: string; sId: string } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "sortKey" in parsed &&
      "sId" in parsed &&
      typeof (parsed as Record<string, unknown>).sortKey === "string" &&
      typeof (parsed as Record<string, unknown>).sId === "string"
    ) {
      return parsed as { sortKey: string; sId: string };
    }
    return null;
  } catch {
    return null;
  }
}

export const agentHandlers: AgentHandlers = {
  [LIST_WORKSPACE_AGENTS_TOOL_NAME]: async (
    { workspace_id, status, limit, next_page_cursor },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      LIST_WORKSPACE_AGENTS_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }
    const targetAuth = targetAuthResult.value;

    const allAgents = await getAgentConfigurationsForView({
      auth: targetAuth,
      agentsGetView: status === "archived" ? "archived" : "admin_internal",
      variant: "light",
    });

    // Sort by versionCreatedAt DESC, sId ASC as tiebreaker.
    // Null versionCreatedAt is treated as oldest.
    const sorted = [...allAgents].sort((a, b) => {
      const timeA = a.versionCreatedAt
        ? new Date(a.versionCreatedAt).getTime()
        : 0;
      const timeB = b.versionCreatedAt
        ? new Date(b.versionCreatedAt).getTime()
        : 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return a.sId < b.sId ? -1 : a.sId > b.sId ? 1 : 0;
    });

    const pageLimit = Math.min(limit ?? 50, 200);

    let startIndex = 0;
    if (next_page_cursor) {
      const cursor = decodeCursor(next_page_cursor);
      if (!cursor) {
        return new Err(
          new MCPError("Invalid next_page_cursor.", { tracked: false })
        );
      }
      const cursorTime = new Date(cursor.sortKey).getTime();
      // Find the first item strictly after the cursor position.
      startIndex = sorted.findIndex((a) => {
        const aTime = a.versionCreatedAt
          ? new Date(a.versionCreatedAt).getTime()
          : 0;
        if (aTime < cursorTime) {
          return true;
        }
        if (aTime === cursorTime && a.sId > cursor.sId) {
          return true;
        }
        return false;
      });
      if (startIndex === -1) {
        startIndex = sorted.length;
      }
    }

    const page = sorted.slice(startIndex, startIndex + pageLimit);
    const lastItem = page[page.length - 1];
    const nextPageCursor =
      startIndex + pageLimit < sorted.length && lastItem
        ? encodeCursor(lastItem.versionCreatedAt ?? "", lastItem.sId)
        : null;

    return jsonResponse({
      workspace_id,
      totalCount: sorted.length,
      agents: page.map((a) => ({
        agentId: a.sId,
        name: a.name,
        description: a.description,
        scope: a.scope,
        status: a.status,
        version: a.version,
        versionCreatedAt: a.versionCreatedAt,
        instructionsLength: a.instructions?.length ?? 0,
        requestedSpaceCount: a.requestedSpaceIds.length,
      })),
      nextPageCursor,
    });
  },

  [GET_WORKSPACE_AGENT_TOOL_NAME]: async (
    { workspace_id, agent_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_AGENT_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }
    const targetAuth = targetAuthResult.value;

    // Try active agents first (admin_internal), then archived.
    let agents = await getAgentConfigurationsForView({
      auth: targetAuth,
      agentsGetView: "admin_internal",
      variant: "full",
    });
    let agent = agents.find((a) => a.sId === agent_id) ?? null;

    if (!agent) {
      agents = await getAgentConfigurationsForView({
        auth: targetAuth,
        agentsGetView: "archived",
        variant: "full",
      });
      agent = agents.find((a) => a.sId === agent_id) ?? null;
    }

    if (!agent) {
      return new Err(
        new MCPError(
          `Agent "${agent_id}" not found in workspace "${workspace_id}".`,
          { tracked: false }
        )
      );
    }

    const [authors, editors] = await Promise.all([
      getAuthors([agent]),
      getEditors(targetAuth, agent),
    ]);

    const author =
      agent.versionAuthorId !== null
        ? (authors.find((u) => u.id === agent.versionAuthorId) ?? null)
        : null;

    return jsonResponse({
      workspace_id,
      agent: {
        agentId: agent.sId,
        name: agent.name,
        description: agent.description,
        scope: agent.scope,
        status: agent.status,
        version: agent.version,
        versionCreatedAt: agent.versionCreatedAt,
        instructions: agent.instructions,
        instructionsLength: agent.instructions?.length ?? 0,
        toolCount: agent.actions.length,
        toolNames: agent.actions.map((a) => a.name),
        requestedSpaceIds: agent.requestedSpaceIds,
        author: author
          ? {
              userId: author.sId,
              email: author.email,
              fullName: author.fullName,
            }
          : null,
        editors: editors.map((e) => ({
          userId: e.sId,
          email: e.email,
          fullName: e.fullName,
        })),
      },
    });
  },
};
