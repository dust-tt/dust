import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";

async function detectServerNames(
  skill: DetectedSkill
): Promise<AutoInternalMCPServerNameType[]> {
  const servers: AutoInternalMCPServerNameType[] = [];

  if (/\b(WebFetch|WebSearch)\b/.test(skill.instructions)) {
    servers.push("web_search_&_browse");
  }

  return servers;
}

/**
 * Given a detected skill, returns the MCPServerViewResources that should
 * be automatically attached based on its content.
 */
export async function suggestMCPServersForDetectedSkill(
  auth: Authenticator,
  skill: DetectedSkill
): Promise<MCPServerViewResource[]> {
  const serverNames = await detectServerNames(skill);

  if (serverNames.length === 0) {
    return [];
  }

  return MCPServerViewResource.getMCPServerViewsForAutoInternalTools(
    auth,
    serverNames
  );
}
