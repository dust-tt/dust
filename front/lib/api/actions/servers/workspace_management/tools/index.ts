import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  workspaceAdminGuard,
  workspaceManagerGuard,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentViewType } from "@app/lib/api/actions/servers/workspace_management/metadata";
import {
  DEFAULT_PAGE_SIZE,
  GET_AGENT_DETAILS_TOOL_NAME,
  GET_SKILL_DETAILS_TOOL_NAME,
  LIST_AGENTS_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  MAX_PAGE_SIZE,
  WORKSPACE_MANAGEMENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { AgentsGetViewType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

function makeJsonText(value: unknown) {
  return {
    type: "text" as const,
    text: JSON.stringify(value, null, 2),
  };
}

// Slices `rows` for the requested page. Both list tools fetch the whole set and paginate in
// memory, like the skill_authoring server does: workspaces hold hundreds of agents and skills,
// not millions, and it keeps `total` exact.
function paginate<T>(
  rows: T[],
  { cursor, limit }: { cursor?: number; limit?: number }
): Result<{ page: T[]; total: number; nextCursor: number | null }, MCPError> {
  const pageSize = Math.min(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = cursor ?? 0;

  if (offset >= rows.length && offset > 0) {
    return new Err(
      new MCPError(`cursor ${offset} is out of range (total: ${rows.length})`, {
        tracked: false,
      })
    );
  }

  const nextOffset = offset + pageSize;

  return new Ok({
    page: rows.slice(offset, nextOffset),
    total: rows.length,
    nextCursor: nextOffset < rows.length ? nextOffset : null,
  });
}

// `all_unrestricted` maps onto `admin_internal` to lift the scope restriction (unpublished
// agents the caller does not edit) plus permission filtering to lift the space one, exactly like
// the public agent_configurations endpoint does.
function resolveAgentView(view: AgentViewType): {
  agentsGetView: AgentsGetViewType;
  dangerouslySkipPermissionFiltering: boolean;
} {
  switch (view) {
    case "all_unrestricted":
      return {
        agentsGetView: "admin_internal",
        dangerouslySkipPermissionFiltering: true,
      };
    case "all":
    case "list":
    case "published":
    case "global":
    // The archived view already scopes to the agents the caller edits, or all of them for an
    // admin, so it needs no extra guard.
    case "archived":
      return {
        agentsGetView: view,
        dangerouslySkipPermissionFiltering: false,
      };
    default:
      assertNever(view);
  }
}

function guardAgentView(
  auth: Authenticator,
  view: AgentViewType
): MCPError | null {
  if (view === "all_unrestricted") {
    return workspaceAdminGuard(auth);
  }
  // `list` filters on the caller's own agents, so it cannot run without one.
  if (view === "list" && !auth.user()) {
    return new MCPError(
      "The 'list' view requires an interactive user; use 'all' instead.",
      { tracked: false }
    );
  }
  return null;
}

function skillKindOf(skill: SkillResource): "custom" | "global" {
  return isResourceSId("skill", skill.sId) ? "custom" : "global";
}

const handlers: ToolHandlers<typeof WORKSPACE_MANAGEMENT_TOOLS_METADATA> = {
  [LIST_AGENTS_TOOL_NAME]: async (
    { view, namePrefix, cursor, limit },
    { auth }
  ) => {
    const denied = workspaceManagerGuard(auth);
    if (denied) {
      return new Err(denied);
    }

    const resolvedView = view ?? "all";
    const viewDenied = guardAgentView(auth, resolvedView);
    if (viewDenied) {
      return new Err(viewDenied);
    }

    const { agentsGetView, dangerouslySkipPermissionFiltering } =
      resolveAgentView(resolvedView);

    // `limit` stays out of the fetch on purpose: it has no offset counterpart, and the view
    // applies it in SQL before the requested-space filtering, so a page would silently come
    // back short. Paginate the sorted set here instead, which also keeps `total` exact.
    const agents = await getAgentConfigurationsForView({
      auth,
      agentsGetView,
      agentPrefix: namePrefix,
      sort: "alphabetical",
      variant: "light",
      omitHeavyAttributes: true,
      dangerouslySkipPermissionFiltering,
    });

    const paginated = paginate(agents, { cursor, limit });
    if (paginated.isErr()) {
      return new Err(paginated.error);
    }
    const { page, total, nextCursor } = paginated.value;

    return new Ok([
      makeJsonText({
        total,
        nextCursor,
        view: resolvedView,
        agents: page.map((agent) => ({
          sId: agent.sId,
          name: agent.name,
          description: agent.description,
          scope: agent.scope,
          status: agent.status,
          model: agent.model.modelId,
          tags: agent.tags.map((tag) => tag.name),
          versionCreatedAt: agent.versionCreatedAt,
          canEdit: agent.canEdit,
        })),
      }),
    ]);
  },

  [GET_AGENT_DETAILS_TOOL_NAME]: async ({ agentId }, { auth }) => {
    const denied = workspaceManagerGuard(auth);
    if (denied) {
      return new Err(denied);
    }

    const agents = await getAgentConfigurations(auth, {
      agentIds: [agentId],
      variant: "full",
    });
    const agent = agents[0];

    if (!agent) {
      return new Ok([
        {
          type: "text" as const,
          text:
            `No agent found with id ${agentId} (it may be archived or not ` +
            "accessible).",
        },
      ]);
    }

    if (!agent.canRead) {
      return new Ok([
        {
          type: "text" as const,
          text:
            `Agent ${agent.name} [${agent.sId}]\n` +
            `- Description: (private agent - not available)\n` +
            `- Scope: ${agent.scope}\n` +
            `- Model: ${agent.model.providerId}/${agent.model.modelId}\n\n` +
            "Instructions, skills, and tools are not available for private " +
            "agents you do not have access to.",
        },
      ]);
    }

    const toolNames = agent.actions.map((action) => action.name).join(", ");
    const skillNames = (agent.skills ?? []).join(", ");

    return new Ok([
      {
        type: "text" as const,
        text:
          `Agent ${agent.name} [${agent.sId}]\n` +
          `- Description: ${agent.description}\n` +
          `- Scope: ${agent.scope}\n` +
          `- Model: ${agent.model.providerId}/${agent.model.modelId}\n` +
          `- Skills: ${skillNames || "none"}\n` +
          `- Tools: ${toolNames || "none"}\n\n` +
          "Instructions (full system prompt):\n" +
          `${agent.instructions ?? "(no instructions)"}`,
      },
    ]);
  },

  [LIST_SKILLS_TOOL_NAME]: async (
    { availability, status, kind, includeUsage, cursor, limit },
    { auth }
  ) => {
    const denied = workspaceManagerGuard(auth);
    if (denied) {
      return new Err(denied);
    }

    const resolvedKind = kind ?? "custom";

    const skills = await SkillResource.listByWorkspace(auth, {
      status: status ?? "active",
      availability,
      onlyCustom: resolvedKind === "custom",
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    });

    const filtered =
      resolvedKind === "global"
        ? skills.filter((skill) => skillKindOf(skill) === "global")
        : skills;

    const sorted = [...filtered].sort(
      (a, b) => a.name.localeCompare(b.name) || a.sId.localeCompare(b.sId)
    );

    const paginated = paginate(sorted, { cursor, limit });
    if (paginated.isErr()) {
      return new Err(paginated.error);
    }
    const { page, total, nextCursor } = paginated.value;

    // Usage is only fetched for the current page, and in a single batched query.
    const usageBySkillId = includeUsage
      ? await SkillResource.batchFetchUsage(auth, page)
      : null;

    return new Ok([
      makeJsonText({
        total,
        nextCursor,
        skills: page.map((skill) => ({
          sId: skill.sId,
          name: skill.name,
          userFacingDescription: skill.userFacingDescription,
          agentFacingDescription: skill.agentFacingDescription,
          availability: skill.availability,
          status: skill.status,
          kind: skillKindOf(skill),
          canWrite: skill.canWrite(auth),
          ...(usageBySkillId
            ? { agentsUsingCount: usageBySkillId.get(skill.sId)?.count ?? 0 }
            : {}),
        })),
      }),
    ]);
  },

  [GET_SKILL_DETAILS_TOOL_NAME]: async ({ skillId }, { auth }) => {
    const denied = workspaceManagerGuard(auth);
    if (denied) {
      return new Err(denied);
    }

    const skill = await SkillResource.fetchById(auth, skillId);
    if (!skill) {
      return new Ok([
        {
          type: "text" as const,
          text:
            `No skill found with id ${skillId} (it may be archived or not ` +
            "accessible).",
        },
      ]);
    }

    // `toJSON` is what decides whether a code-defined skill exposes its instructions.
    const json = skill.toJSON(auth);

    return new Ok([
      makeJsonText({
        skill: {
          sId: json.sId,
          name: json.name,
          userFacingDescription: json.userFacingDescription,
          agentFacingDescription: json.agentFacingDescription,
          availability: json.availability,
          status: json.status,
          kind: skillKindOf(skill),
          icon: json.icon,
          canWrite: json.canWrite,
          tools: json.tools.map((tool) => tool.server.name),
          instructions: json.instructions,
        },
      }),
    ]);
  },
};

export const TOOLS = buildTools(WORKSPACE_MANAGEMENT_TOOLS_METADATA, handlers);
