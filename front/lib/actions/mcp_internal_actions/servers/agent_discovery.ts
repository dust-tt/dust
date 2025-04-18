import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentConfigurationType,
  AgentsGetViewType,
  LightAgentConfigurationType,
} from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "agent_discovery",
  authorization: null,
  version: "1.0.0",
  description: "Show all available agents for the current user.",
  icon: "RobotIcon",
};

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "list_agents",
    "List all available agents for the current user.",
    async () => {
      const agents = await getAgentConfigurations({
        auth,
        agentsGetView: "list",
        variant: "light",
      });

      const content = agents.map((agent) => ({
        name: agent.name,
        description: agent.description,
        sId: agent.sId,
      }));

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify(content, null, 2),
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;

const getAgentConfigurations = async <V extends "light" | "full">(params: {
  auth: Authenticator;
  agentsGetView: AgentsGetViewType;
  agentPrefix?: string;
  variant: V;
  limit?: number;
  dangerouslySkipPermissionFiltering?: boolean;
}): Promise<
  V extends "light" ? LightAgentConfigurationType[] : AgentConfigurationType[]
> => {
  console.log("getAgentConfigurations", params);
  throw new Error("Not implemented");
};
