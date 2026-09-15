import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const AGENT_AUTHORING_SERVER_NAME = "agent_authoring" as const;
export const CREATE_AGENT_TOOL_NAME = "create_agent" as const;
export const DELETE_AGENT_TOOL_NAME = "delete_agent" as const;

export const CREATE_AGENT_DESCRIPTION =
  "Create a new agent in this workspace: a named assistant with its own instructions. v1 " +
  "creates instructions-only agents, private to their creator, using the workspace's default " +
  "model.";

export const CREATE_AGENT_INPUT_SCHEMA = z.object({
  name: z
    .string()
    .describe("Unique, human-readable agent name (no leading '@')."),
  description: z
    .string()
    .describe(
      "Short description of what the agent does, shown to users browsing agents."
    ),
  instructions: z.string().describe("The agent's instructions, in markdown."),
});

export type CreateAgentArgs = z.infer<typeof CREATE_AGENT_INPUT_SCHEMA>;

export const DELETE_AGENT_DESCRIPTION =
  "Delete (archive) an existing agent in this workspace. This is irreversible through this tool: " +
  "the agent stops being usable and its automations are disabled. Only an editor of the agent, " +
  "or a workspace admin, can delete it.";

export const DELETE_AGENT_INPUT_SCHEMA = z.object({
  agentId: z.string().describe("The sId of the agent to delete."),
});

export type DeleteAgentArgs = z.infer<typeof DELETE_AGENT_INPUT_SCHEMA>;

export const AGENT_AUTHORING_TOOLS_METADATA = [
  {
    name: CREATE_AGENT_TOOL_NAME,
    description: CREATE_AGENT_DESCRIPTION,
    schema: CREATE_AGENT_INPUT_SCHEMA.shape,
    stake: "high",
    displayLabels: {
      running: "Creating agent",
      done: "Create agent",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: DELETE_AGENT_TOOL_NAME,
    description: DELETE_AGENT_DESCRIPTION,
    schema: DELETE_AGENT_INPUT_SCHEMA.shape,
    stake: "high",
    displayLabels: {
      running: "Deleting agent",
      done: "Delete agent",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const AGENT_AUTHORING_SERVER = {
  serverInfo: {
    name: AGENT_AUTHORING_SERVER_NAME,
    version: "1.0.0",
    description: "Create and delete workspace agents.",
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
  },
  tools: AGENT_AUTHORING_TOOLS_METADATA,
} as const satisfies ServerMetadata;
