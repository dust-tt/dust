import {
  getInternalMCPServerNameFromSId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";

interface ExtractedTable {
  tableId: string;
}

interface ExtractedChildAgent {
  agentConfigurationId: string;
}

type ExtractedTool = Record<string, unknown>;

interface ExtractedAgent {
  sId: string;
  version: number;
  status: string;
  scope: string;
  name: string;
  description: string;
  instructions: string | null;
  tools: ExtractedTool[];
}

interface ExportResult {
  workspaceSId: string;
  workspaceName: string;
  exportedAt: string;
  agentCount: number;
  agents: ExtractedAgent[];
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
    output: {
      type: "string",
      default: "",
      description:
        "Output file path (optional, defaults to stdout). Use .json extension.",
    },
    minInstructionsLength: {
      type: "number",
      default: 0,
      description:
        "Minimum instructions length to include an agent (default: 0, no filter)",
    },
  },
  async ({ wId, status, output, minInstructionsLength }, logger) => {
    // Find the workspace
    const workspace = await WorkspaceModel.findOne({
      where: { sId: wId },
    });

    if (!workspace) {
      throw new Error(`Workspace not found: ${wId}`);
    }

    logger.info({ workspaceId: workspace.id, wId }, "Found workspace");

    // Build agent query conditions
    const agentWhereClause: Record<string, unknown> = {
      workspaceId: workspace.id,
    };

    if (status !== "all") {
      agentWhereClause.status = status;
    }

    // Fetch all agent configurations for this workspace
    const agents = await AgentConfigurationModel.findAll({
      where: agentWhereClause,
      include: [
        {
          model: AgentMCPServerConfigurationModel,
          as: "mcpServerConfigurations",
          include: [
            {
              model: MCPServerViewModel,
              as: "mcpServerView",
              include: [
                {
                  model: RemoteMCPServerModel,
                  as: "remoteMCPServer",
                  required: false,
                },
              ],
            },
          ],
        },
      ],
      order: [
        ["name", "ASC"],
        ["version", "DESC"],
      ],
    });

    logger.info({ agentCount: agents.length }, "Found agents");

    // Collect all MCP server configuration IDs
    const mcpConfigIds: number[] = [];
    for (const agent of agents) {
      const mcpConfigs = agent.mcpServerConfigurations ?? [];
      for (const mcpConfig of mcpConfigs) {
        mcpConfigIds.push(mcpConfig.id);
      }
    }

    // Fetch tables configurations separately
    const tablesConfigs = await AgentTablesQueryConfigurationTableModel.findAll(
      {
        where: {
          mcpServerConfigurationId: mcpConfigIds,
        },
      }
    );

    // Fetch child agent configurations separately
    const childAgentConfigs = await AgentChildAgentConfigurationModel.findAll({
      where: {
        mcpServerConfigurationId: mcpConfigIds,
      },
    });

    // Build lookup maps
    const tablesConfigsByMcpId = new Map<
      number,
      AgentTablesQueryConfigurationTableModel[]
    >();
    for (const tableConfig of tablesConfigs) {
      const mcpId = tableConfig.mcpServerConfigurationId;
      const existing = tablesConfigsByMcpId.get(mcpId) ?? [];
      existing.push(tableConfig);
      tablesConfigsByMcpId.set(mcpId, existing);
    }

    const childAgentConfigsByMcpId = new Map<
      number,
      AgentChildAgentConfigurationModel[]
    >();
    for (const childConfig of childAgentConfigs) {
      const mcpId = childConfig.mcpServerConfigurationId;
      const existing = childAgentConfigsByMcpId.get(mcpId) ?? [];
      existing.push(childConfig);
      childAgentConfigsByMcpId.set(mcpId, existing);
    }

    // Transform agents to export format
    const extractedAgents: ExtractedAgent[] = agents.map((agent) => {
      const mcpConfigs = agent.mcpServerConfigurations ?? [];

      const tools: ExtractedTool[] = mcpConfigs.map((mcpConfig) => {
        const mcpServerView = mcpConfig.mcpServerView;
        const remoteMCPServer = mcpServerView?.remoteMCPServer;

        // Get internal server info if applicable
        let internalServerName: string | null = null;
        let internalServerDescription: string | null = null;

        if (mcpConfig.internalMCPServerId) {
          internalServerName = getInternalMCPServerNameFromSId(
            mcpConfig.internalMCPServerId
          );
          if (
            internalServerName &&
            internalServerName in INTERNAL_MCP_SERVERS
          ) {
            const serverDef =
              INTERNAL_MCP_SERVERS[
                internalServerName as keyof typeof INTERNAL_MCP_SERVERS
              ];
            internalServerDescription = serverDef.serverInfo.description;
          }
        }

        // Extract tables configuration
        const tblConfigs = tablesConfigsByMcpId.get(mcpConfig.id) ?? [];
        const tables: ExtractedTable[] = tblConfigs.map((tableConfig) => ({
          tableId: tableConfig.tableId,
        }));

        // Extract child agents configuration
        const childConfigs = childAgentConfigsByMcpId.get(mcpConfig.id) ?? [];
        const childAgents: ExtractedChildAgent[] = childConfigs.map(
          (childConfig) => ({
            agentConfigurationId: childConfig.agentConfigurationId,
          })
        );

        // Build tool object, omitting null/empty fields
        const tool: Record<string, unknown> = {
          sId: mcpConfig.sId,
          type: mcpServerView?.serverType ?? "internal",
        };

        if (mcpConfig.name) {
          tool.name = mcpConfig.name;
        }
        if (mcpConfig.internalMCPServerId) {
          tool.internalMCPServerId = mcpConfig.internalMCPServerId;
        }
        if (internalServerName) {
          tool.internalServerName = internalServerName;
        }
        if (internalServerDescription) {
          tool.internalServerDescription = internalServerDescription;
        }
        if (remoteMCPServer?.url) {
          tool.remoteMCPServerUrl = remoteMCPServer.url;
        }
        if (remoteMCPServer?.cachedName) {
          tool.remoteMCPServerName = remoteMCPServer.cachedName;
        }
        if (remoteMCPServer?.cachedDescription) {
          tool.remoteMCPServerDescription = remoteMCPServer.cachedDescription;
        }
        if (remoteMCPServer?.cachedTools?.length) {
          tool.remoteMCPServerCachedTools = remoteMCPServer.cachedTools;
        }
        if (mcpConfig.timeFrame) {
          tool.timeFrame = mcpConfig.timeFrame;
        }
        if (
          mcpConfig.additionalConfiguration &&
          Object.keys(mcpConfig.additionalConfiguration).length > 0
        ) {
          tool.additionalConfiguration = mcpConfig.additionalConfiguration;
        }
        if (mcpConfig.jsonSchema) {
          tool.jsonSchema = mcpConfig.jsonSchema;
        }
        if (mcpConfig.singleToolDescriptionOverride) {
          tool.descriptionOverride = mcpConfig.singleToolDescriptionOverride;
        }
        if (tables.length > 0) {
          tool.tables = tables;
        }
        if (childAgents.length > 0) {
          tool.childAgents = childAgents;
        }

        return tool;
      });

      return {
        sId: agent.sId,
        version: agent.version,
        status: agent.status,
        scope: agent.scope,
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        tools,
      };
    });

    // Filter agents by minimum instructions length if specified
    const filteredAgents =
      minInstructionsLength > 0
        ? extractedAgents.filter(
            (agent) =>
              agent.instructions &&
              agent.instructions.length >= minInstructionsLength
          )
        : extractedAgents;

    const result: ExportResult = {
      workspaceSId: wId,
      workspaceName: workspace.name,
      exportedAt: new Date().toISOString(),
      agentCount: filteredAgents.length,
      agents: filteredAgents,
    };

    const jsonOutput = JSON.stringify(result, null, 2);

    if (output) {
      const fs = await import("fs/promises");
      await fs.writeFile(output, jsonOutput, "utf-8");
      logger.info({ outputPath: output }, "Export written to file");
    } else {
      console.log(jsonOutput);
    }

    logger.info(
      {
        agentCount: filteredAgents.length,
        totalAgents: extractedAgents.length,
        workspaceSId: wId,
      },
      "Export completed"
    );
  }
);
