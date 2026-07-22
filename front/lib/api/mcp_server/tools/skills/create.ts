import {
  CREATE_SKILL_DESCRIPTION,
  CREATE_SKILL_INPUT_SCHEMA,
} from "@app/lib/api/actions/servers/skill_authoring/metadata";
import { createSkill } from "@app/lib/api/actions/servers/skill_authoring/tools";
import config from "@app/lib/api/config";
import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import {
  mcpError,
  mcpJsonResponse,
} from "@app/lib/api/mcp_server/tools/response";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerSkillsCreateTool(server: McpServer) {
  registerDustMcpTool(
    server,
    "create_skill",
    {
      description: CREATE_SKILL_DESCRIPTION,
      inputSchema: CREATE_SKILL_INPUT_SCHEMA.shape,
    },
    async (auth, args) => {
      const result = await createSkill(auth, args);
      if (result.isErr()) {
        return mcpError(result.error.message);
      }

      const skill = result.value;
      const workspace = auth.workspace();
      return mcpJsonResponse({
        message: `Created skill "${skill.name}".`,
        skillId: skill.sId,
        skillName: skill.name,
        url: `${config.getAppUrl()}${getSkillBuilderRoute(
          workspace.sId,
          skill.sId
        )}`,
      });
    }
  );
}
