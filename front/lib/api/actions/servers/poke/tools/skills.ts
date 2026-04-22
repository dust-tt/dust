import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { POKE_TOOLS_METADATA } from "@app/lib/api/actions/servers/poke/metadata";
import {
  GET_WORKSPACE_SKILL_TOOL_NAME,
  LIST_WORKSPACE_SKILLS_TOOL_NAME,
} from "@app/lib/api/actions/servers/poke/metadata";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { Err } from "@app/types/shared/result";

type SkillHandlers = Pick<
  ToolHandlers<typeof POKE_TOOLS_METADATA>,
  typeof LIST_WORKSPACE_SKILLS_TOOL_NAME | typeof GET_WORKSPACE_SKILL_TOOL_NAME
>;

// In-memory cursor for stateless pagination.
// Results may be inconsistent across page boundaries if skills are updated
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

export const skillHandlers: SkillHandlers = {
  [LIST_WORKSPACE_SKILLS_TOOL_NAME]: async (
    { workspace_id, status, limit, next_page_cursor },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      LIST_WORKSPACE_SKILLS_TOOL_NAME,
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

    const allSkills = await SkillResource.listByWorkspace(targetAuth, {
      status: status ?? "active",
    });

    // Sort by updatedAt DESC, sId ASC as tiebreaker.
    const sorted = [...allSkills].sort((a, b) => {
      const timeB = b.updatedAt.getTime();
      const timeA = a.updatedAt.getTime();
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
      startIndex = sorted.findIndex((s) => {
        const sTime = s.updatedAt.getTime();
        if (sTime < cursorTime) {
          return true;
        }
        if (sTime === cursorTime && s.sId > cursor.sId) {
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
        ? encodeCursor(lastItem.updatedAt.toISOString(), lastItem.sId)
        : null;

    return jsonResponse({
      workspace_id,
      totalCount: sorted.length,
      skills: page.map((s) => ({
        skillId: s.sId,
        name: s.name,
        agentFacingDescription: s.agentFacingDescription,
        status: s.status,
        isDefault: s.isDefault,
        updatedAt: s.updatedAt.toISOString(),
        instructionsLength: s.instructions?.length ?? 0,
      })),
      nextPageCursor,
    });
  },

  [GET_WORKSPACE_SKILL_TOOL_NAME]: async (
    { workspace_id, skill_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_SKILL_TOOL_NAME,
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

    const skill = await SkillResource.fetchById(targetAuth, skill_id);
    if (!skill) {
      return new Err(
        new MCPError(
          `Skill "${skill_id}" not found in workspace "${workspace_id}".`,
          { tracked: false }
        )
      );
    }

    const editors = (await skill.listEditors(targetAuth)) ?? [];
    const workspaceModelId = targetAuth.getNonNullableWorkspace().id;

    return jsonResponse({
      workspace_id,
      skill: {
        skillId: skill.sId,
        name: skill.name,
        agentFacingDescription: skill.agentFacingDescription,
        userFacingDescription: skill.userFacingDescription,
        status: skill.status,
        isDefault: skill.isDefault,
        updatedAt: skill.updatedAt.toISOString(),
        instructions: skill.instructions,
        instructionsLength: skill.instructions?.length ?? 0,
        requestedSpaceIds: skill.requestedSpaceIds.map((spaceModelId) =>
          SpaceResource.modelIdToSId({
            id: spaceModelId,
            workspaceId: workspaceModelId,
          })
        ),
        editors: editors.map((e) => {
          const user = e.toJSON();
          return {
            userId: user.sId,
            email: user.email,
            fullName: user.fullName,
          };
        }),
      },
    });
  },
};
