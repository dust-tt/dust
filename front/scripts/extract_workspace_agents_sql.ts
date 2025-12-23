import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
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
  tools: string | ToolInfo[] | null;
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

function parseTools(tools: string | ToolInfo[] | null): ToolInfo[] {
  if (!tools) {
    return [];
  }
  // If it's already an array (Sequelize may auto-parse JSONB), return it
  if (Array.isArray(tools)) {
    return tools;
  }
  // Otherwise parse the JSON string
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

function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  // Escape quotes by doubling them, and wrap in quotes if contains comma, quote, or newline
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(agents: ParsedAgent[]): string {
  const headers = [
    "workspaceName",
    "agentSid",
    "agentName",
    "description",
    "instructions",
    "instructionsLength",
    "tools",
    "tableIds",
    "childAgents",
  ];

  const headerLine = headers.join(",");
  const dataLines = agents.map((agent) =>
    headers.map((h) => escapeCSVField(agent[h as keyof ParsedAgent])).join(",")
  );

  return [headerLine, ...dataLines].join("\n");
}

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId to extract agents from",
    },
    status: {
      type: "string",
      default: "active",
      description:
        "Agent status filter (active, archived, draft, or 'all' for all statuses)",
    },
    minInstructionsLength: {
      type: "number",
      default: 0,
      description:
        "Minimum instructions length to include an agent (default: 0, no filter)",
    },
    output: {
      type: "string",
      default: "",
      description:
        "Output file path (optional, defaults to stdout). Use .csv extension.",
    },
  },
  async ({ wId, status, minInstructionsLength, output }, logger) => {
    const statusFilter = status === "all" ? "" : `AND ac.status = :status`;

    const query = `
      SELECT
          w.name AS workspace_name,
          ac."sId" AS agent_sid,
          ac.name AS agent_name,
          ac.description,
          ac.instructions,
          LENGTH(ac.instructions) AS instructions_length,
          jsonb_agg(DISTINCT jsonb_build_object(
              'sId', mcp."sId",
              'name', mcp.name,
              'type', msv."serverType",
              'internalMCPServerId', mcp."internalMCPServerId",
              'remoteMCPServerUrl', rms.url,
              'remoteMCPServerName', rms."cachedName",
              'remoteMCPServerDescription', rms."cachedDescription",
              'timeFrame', mcp."timeFrame",
              'additionalConfiguration', mcp."additionalConfiguration",
              'descriptionOverride', mcp."singleToolDescriptionOverride"
          )) FILTER (WHERE mcp."sId" IS NOT NULL) AS tools,
          array_agg(DISTINCT tq."tableId") FILTER (WHERE tq."tableId" IS NOT NULL) AS table_ids,
          array_agg(DISTINCT cac."agentConfigurationId") FILTER (WHERE cac."agentConfigurationId" IS NOT NULL) AS child_agents
      FROM workspaces w
      JOIN agent_configurations ac ON ac."workspaceId" = w.id
      LEFT JOIN agent_mcp_server_configurations mcp ON mcp."agentConfigurationId" = ac.id
      LEFT JOIN mcp_server_views msv ON msv.id = mcp."mcpServerViewId"
      LEFT JOIN remote_mcp_servers rms ON rms.id = msv."remoteMCPServerId"
      LEFT JOIN agent_tables_query_configuration_tables tq ON tq."mcpServerConfigurationId" = mcp.id
      LEFT JOIN agent_child_agent_configurations cac ON cac."mcpServerConfigurationId" = mcp.id
      WHERE w."sId" = :wId
        ${statusFilter}
        AND (LENGTH(ac.instructions) >= :minInstructionsLength OR :minInstructionsLength = 0)
      GROUP BY w.name, ac."sId", ac.name, ac.description, ac.instructions
      ORDER BY ac.name;
    `;

    const results = await frontSequelize.query<AgentRowRaw>(query, {
      replacements: { wId, status, minInstructionsLength },
      type: QueryTypes.SELECT,
    });

    logger.info({ agentCount: results.length }, "Found agents");

    // Parse raw rows into typed JS objects
    const agents = results.map(parseAgentRow);

    const csvOutput = toCSV(agents);

    if (output) {
      const fs = await import("fs/promises");
      await fs.writeFile(output, csvOutput, "utf-8");
      logger.info({ outputPath: output }, "Export written to file");
    } else {
      console.log(csvOutput);
    }

    logger.info(
      {
        agentCount: results.length,
        workspaceSId: wId,
      },
      "Export completed"
    );
  }
);
