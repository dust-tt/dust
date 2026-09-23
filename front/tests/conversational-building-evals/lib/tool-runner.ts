import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
  DESCRIBE_AGENT_TOOL_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_AGENT_CREATION_TOOL_NAME,
  SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME,
  SUGGEST_SKILL_AVAILABILITY_TOOL_NAME,
  SUGGEST_SKILL_DELETION_TOOL_NAME,
  SUGGEST_SKILL_EDITORS_TOOL_NAME,
  SUGGEST_SKILL_NAME_TOOL_NAME,
  SUGGEST_SKILL_UPDATE_TOOL_NAME,
  SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { TOOLS as BUILDING_TOOLS } from "@app/lib/api/actions/servers/building_agents_and_skills/tools";
import {
  GET_AGENT_DETAILS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import { TOOLS as WORKSPACE_MANAGEMENT_TOOLS } from "@app/lib/api/actions/servers/workspace_management/tools";
import type { Authenticator } from "@app/lib/auth";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// The model sees tools under their prefixed name (`<server>__<tool>`), exactly as the agent loop
// registers them and as the skill instructions reference them.
export const TOOL = {
  describeSkill: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    DESCRIBE_SKILL_TOOL_NAME
  ),
  describeAgent: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    DESCRIBE_AGENT_TOOL_NAME
  ),
  suggestSkillUpdate: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    SUGGEST_SKILL_UPDATE_TOOL_NAME
  ),
  suggestSkillEditors: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    SUGGEST_SKILL_EDITORS_TOOL_NAME
  ),
  suggestSkillDeletion: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    SUGGEST_SKILL_DELETION_TOOL_NAME
  ),
  suggestSkillName: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    SUGGEST_SKILL_NAME_TOOL_NAME
  ),
  suggestSkillAvailability: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    SUGGEST_SKILL_AVAILABILITY_TOOL_NAME
  ),
  suggestSkillUserFacingDescription: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME
  ),
  suggestAgentCreation: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    SUGGEST_AGENT_CREATION_TOOL_NAME
  ),
  suggestAgentInstructionsChange: getPrefixedToolName(
    BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
  ),
  getAgentDetails: getPrefixedToolName(
    WORKSPACE_MANAGEMENT_SERVER_NAME,
    GET_AGENT_DETAILS_TOOL_NAME
  ),
} as const;

type AnyToolDefinition =
  | (typeof BUILDING_TOOLS)[number]
  | (typeof WORKSPACE_MANAGEMENT_TOOLS)[number];

// The two servers the conversational-building skill equips. `stake: "high"` tools are left out:
// production asks the user before running them, and there is no user to answer during an eval.
const TOOL_DEFINITIONS = new Map<string, AnyToolDefinition>([
  ...BUILDING_TOOLS.map((tool): [string, AnyToolDefinition] => [
    getPrefixedToolName(BUILDING_AGENTS_AND_SKILLS_SERVER_NAME, tool.name),
    tool,
  ]),
  ...WORKSPACE_MANAGEMENT_TOOLS.filter((tool) => tool.stake !== "high").map(
    (tool): [string, AnyToolDefinition] => [
      getPrefixedToolName(WORKSPACE_MANAGEMENT_SERVER_NAME, tool.name),
      tool,
    ]
  ),
]);

export function getToolSpecifications(): AgentActionSpecification[] {
  return [...TOOL_DEFINITIONS.entries()].map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: zodToJsonSchema(z.object(tool.schema)) as JSONSchema,
  }));
}

/**
 * Exploratory calls read state and never end a run; every `suggest_*` tool records a suggestion
 * and is a candidate final call.
 */
export function isExploratoryToolName(name: string): boolean {
  const tool = TOOL_DEFINITIONS.get(name);
  return tool !== undefined && !tool.name.startsWith("suggest_");
}

// The handlers only read `auth` from the extra (see the servers' unit tests, which build the
// same partial). `runContext` is absent because there is no agent loop here.
function makeExtra(auth: Authenticator): ToolHandlerExtra {
  const extra: Pick<
    ToolHandlerExtra,
    "auth" | "requestId" | "sendNotification" | "sendRequest" | "signal"
  > = {
    auth,
    requestId: "eval-request",
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request during the eval.");
    },
    signal: new AbortController().signal,
  };
  return extra as ToolHandlerExtra;
}

/**
 * Runs a tool call for real against the scenario's workspace, through the production handler,
 * and renders the result the way the model would receive it: text content blocks joined, or the
 * error message.
 */
export async function runTool(
  auth: Authenticator,
  toolName: string,
  toolArguments: Record<string, unknown>
): Promise<string> {
  const tool = TOOL_DEFINITIONS.get(toolName);
  if (!tool) {
    throw new Error(`Unknown tool "${toolName}".`);
  }

  // `registerTool` validates arguments against the schema before calling the handler; calling
  // the handler directly skips that step, so it is replayed here.
  const parsed = z.object(tool.schema).safeParse(toolArguments);
  if (!parsed.success) {
    return `Error: invalid arguments: ${parsed.error.message}`;
  }

  // Each handler is typed on its own schema; dispatching over the union needs the erased call.
  const handler = tool.handler as (
    args: Record<string, unknown>,
    extra: ToolHandlerExtra
  ) => ReturnType<AnyToolDefinition["handler"]>;
  const result = await handler(parsed.data, makeExtra(auth));

  if (result.isErr()) {
    return `Error: ${result.error.message}`;
  }

  return result.value
    .map((item) => (item.type === "text" ? item.text : JSON.stringify(item)))
    .join("\n");
}
