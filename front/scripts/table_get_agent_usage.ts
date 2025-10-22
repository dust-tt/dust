import { Op } from "sequelize";

import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace ID",
    },
    dataSourceId: {
      type: "string",
      demandOption: true,
      description: "DataSource ID",
    },
    tableId: {
      type: "string",
      demandOption: true,
      description: "Table ID to get agent usage from",
    },
  },
  async ({ wId, dataSourceId, tableId }, logger) => {
    // Find the workspace
    const workspace = await WorkspaceResource.fetchById(wId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
    if (!dataSource) {
      throw new Error("Data source not found");
    }
    const owner = auth.getNonNullableWorkspace();

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    const tableRes = await coreAPI.getTable({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId,
    });

    if (tableRes.isErr()) {
      throw new Error(`Error fetching table: ${tableRes.error.message}`);
    }

    // console.log(tableRes.value.table);
    // console.log(tableRes.value.table.parents);

    // Find all data source search
    const dsConfigs = await AgentDataSourceConfiguration.findAll({
      where: {
        dataSourceId: dataSource.id,
        workspaceId: owner.id,
        parentsIn: {
          [Op.overlap]: tableRes.value.table.parents,
        },
      },
      include: [
        {
          model: AgentMCPServerConfiguration,
          as: "agent_mcp_server_configuration",
          required: true,
          include: [
            {
              model: AgentConfiguration,
              as: "agent_configuration",
              required: true,
              where: {
                status: "active",
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    });

    const dsAgents: any = {};
    const dsEditors = await getAgentsEditors(
      auth,
      dsConfigs.map(
        (cfg: any) => cfg.agent_mcp_server_configuration.agent_configuration
      )
    );
    dsConfigs.forEach((cfg: any) => {
      const agentId =
        cfg.agent_mcp_server_configuration.agent_configuration.sId;
      if (!dsAgents[agentId]) {
        dsAgents[agentId] = {
          sId: cfg.agent_mcp_server_configuration.agent_configuration.sId,
          name: cfg.agent_mcp_server_configuration.agent_configuration.name,
          editors: (dsEditors[agentId] || []).map((e) => e.email),
          depths: cfg.parentsIn
            .map((p: any) => {
              return tableRes.value.table.parents.indexOf(p);
            })
            .filter((d: any) => d !== -1),
        };
      }
    });
    Object.values(dsAgents).forEach((agent: any) => {
      logger.info(
        {
          tableId,
          type: "search",
          agent: {
            sId: agent.sId,
            name: agent.name,
            editors: agent.editors,
            depths: agent.depths,
          },
        },
        "SEARCH"
      );
      console.log(
        `${tableId},search,${agent.sId},${agent.name},${agent.editors.join("|")},${agent.depths.join("|")}`
      );
    });

    // Find all table query tool
    const tableConfigs = await AgentTablesQueryConfigurationTable.findAll({
      where: {
        dataSourceId: dataSource.id,
        workspaceId: owner.id,
        tableId: tableRes.value.table.table_id,
      },
      include: [
        {
          model: AgentMCPServerConfiguration,
          as: "agent_mcp_server_configuration",
          required: true,
          include: [
            {
              model: AgentConfiguration,
              as: "agent_configuration",
              required: true,
              where: {
                status: "active",
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    });

    const tableAgents: any = {};
    const tableEditors = await getAgentsEditors(
      auth,
      dsConfigs.map(
        (cfg: any) => cfg.agent_mcp_server_configuration.agent_configuration
      )
    );
    tableConfigs.forEach((cfg: any) => {
      const agentId =
        cfg.agent_mcp_server_configuration.agent_configuration.sId;
      if (!tableAgents[agentId]) {
        tableAgents[agentId] = {
          sId: cfg.agent_mcp_server_configuration.agent_configuration.sId,
          name: cfg.agent_mcp_server_configuration.agent_configuration.name,
          editors: (tableEditors[agentId] || []).map((e) => e.email),
        };
      }
    });

    Object.values(tableAgents).forEach((agent: any) => {
      logger.info(
        {
          tableId,
          type: "table",
          agent: {
            sId: agent.sId,
            name: agent.name,
            editors: agent.editors,
          },
        },
        "TABLE"
      );
      console.log(
        `${tableId},table,${agent.sId},${agent.name},${agent.editors.join("|")}`
      );
    });
  }
);
