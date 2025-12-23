import { makeScript } from "@app/scripts/helpers";

interface ToolInfo {
  sId: string | null;
  name: string | null;
  type: string | null;
  internalMCPServerId: string | null;
  remoteMCPServerUrl: string | null;
  remoteMCPServerName: string | null;
  remoteMCPServerDescription: string | null;
  timeFrame: unknown | null;
  additionalConfiguration: unknown | null;
  descriptionOverride: string | null;
}

interface AgentRowRaw {
  workspace_name: string;
  agent_sid: string;
  agent_name: string;
  description: string | null;
  instructions: string | null;
  instructions_length: number | null;
  tools: string | null;
  table_ids: string[] | null;
  child_agents: string[] | null;
}

interface ParsedAgent {
  workspaceName: string;
  agentSid: string;
  agentName: string;
  description: string | null;
  instructions: string | null;
  instructionsLength: number | null;
  tools: ToolInfo[];
  tableIds: string[];
  childAgents: string[];
}

function parseTools(tools: string | null): ToolInfo[] {
  if (!tools) {
    return [];
  }
  try {
    return JSON.parse(tools) as ToolInfo[];
  } catch {
    return [];
  }
}

function parseAgentRow(row: AgentRowRaw): ParsedAgent {
  return {
    workspaceName: row.workspace_name,
    agentSid: row.agent_sid,
    agentName: row.agent_name,
    description: row.description,
    instructions: row.instructions,
    instructionsLength: row.instructions_length,
    tools: parseTools(row.tools),
    tableIds: row.table_ids ?? [],
    childAgents: row.child_agents ?? [],
  };
}

export function parseAgentsJSON(jsonContent: string): ParsedAgent[] {
  const rawAgents = JSON.parse(jsonContent) as AgentRowRaw[];
  return rawAgents.map(parseAgentRow);
}

makeScript(
  {
    input: {
      type: "string",
      demandOption: true,
      description: "Input JSON file path",
    },
    output: {
      type: "string",
      default: "",
      description:
        "Output file path (optional, defaults to stdout). Use .json extension.",
    },
  },
  async ({ input, output }, logger) => {
    const fs = await import("fs/promises");

    const jsonContent = await fs.readFile(input, "utf-8");
    const agents = parseAgentsJSON(jsonContent);

    logger.info({ agentCount: agents.length }, "Parsed agents from JSON");

    const jsonOutput = JSON.stringify(agents, null, 2);

    if (output) {
      await fs.writeFile(output, jsonOutput, "utf-8");
      logger.info({ outputPath: output }, "Output written to file");
    } else {
      console.log(jsonOutput);
    }

    logger.info({ agentCount: agents.length }, "Parse completed");
  }
);
