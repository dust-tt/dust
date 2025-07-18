import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { Transaction } from "sequelize";
import { describe, expect } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { setupAgentOwner } from "@app/pages/api/w/[wId]/assistant/agent_configurations/index.test";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

import { fetchTableDataSourceConfigurations, getCoreSearchArgs } from "./utils";

describe("MCP Internal Actions Server Utils", () => {
  describe("fetchAgentTableConfigurations", () => {
    itInTransaction(
      "should return error when table configuration belongs to different workspace",
      async (t: Transaction) => {
        const workspace = await WorkspaceFactory.basic();
        const otherWorkspace = await WorkspaceFactory.basic();
        await SpaceFactory.system(workspace, t);
        const globalSpace = await SpaceFactory.global(workspace, t);
        await GroupFactory.defaults(workspace);
        const { agentOwnerAuth: auth } = await setupAgentOwner(
          workspace,
          "admin",
          t
        );

        const otherSpace = await SpaceFactory.global(otherWorkspace, t);
        const otherFolder = await DataSourceViewFactory.folder(
          otherWorkspace,
          otherSpace,
          t
        );

        await InternalMCPServerInMemoryResource.makeNew(
          auth,
          {
            name: "search",
            useCase: null,
          },
          t
        );
        const mcpServerConfiguration =
          await AgentMCPServerConfigurationFactory.create(auth, globalSpace, t);

        // Create a table configuration in a different workspace
        const tableConfig = await AgentTablesQueryConfigurationTable.create(
          {
            workspaceId: otherWorkspace.id,
            tableId: "test_table",
            dataSourceId: otherFolder.dataSource.id,
            dataSourceViewId: otherFolder.id,
            mcpServerConfigurationId: mcpServerConfiguration.id,
          },
          { transaction: t }
        );

        const tableConfigId = makeSId("table_configuration", {
          id: tableConfig.id,
          workspaceId: otherWorkspace.id,
        });
        const tablesConfiguration = [
          {
            uri: `table_configuration://dust/w/${otherWorkspace.sId}/table_configurations/${tableConfigId}`,
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
          },
        ];

        const result = await fetchTableDataSourceConfigurations(
          auth,
          tablesConfiguration
        );
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain(
            "does not belong to workspace"
          );
        }
      }
    );

    itInTransaction(
      "should return error for invalid table configuration URI",
      async () => {
        const workspace = await WorkspaceFactory.basic();
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        const tablesConfiguration = [
          {
            uri: "invalid_uri",
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
          },
        ];

        const result = await fetchTableDataSourceConfigurations(
          auth,
          tablesConfiguration
        );
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain(
            "Invalid URI for a table configuration"
          );
        }
      }
    );

    itInTransaction(
      "should return table configurations when they belong to the workspace",
      async (t: Transaction) => {
        const workspace = await WorkspaceFactory.basic();
        await GroupFactory.defaults(workspace);
        const { agentOwnerAuth: auth } = await setupAgentOwner(
          workspace,
          "admin",
          t
        );

        await SpaceFactory.system(workspace, t);
        const space = await SpaceFactory.global(workspace, t);
        const folder = await DataSourceViewFactory.folder(workspace, space, t);
        await InternalMCPServerInMemoryResource.makeNew(
          auth,
          {
            name: "search",
            useCase: null,
          },
          t
        );
        const mcpServerConfiguration =
          await AgentMCPServerConfigurationFactory.create(auth, space, t);

        // Create a table configuration in the workspace
        const tableConfig = await AgentTablesQueryConfigurationTable.create(
          {
            workspaceId: workspace.id,
            tableId: "test_table",
            dataSourceId: folder.dataSource.id,
            dataSourceViewId: folder.id,
            mcpServerConfigurationId: mcpServerConfiguration.id,
          },
          { transaction: t }
        );

        // Also create a table configuration in a different workspace
        const otherWorkspace = await WorkspaceFactory.basic();
        const otherSpace = await SpaceFactory.global(otherWorkspace, t);
        const otherFolder = await DataSourceViewFactory.folder(
          otherWorkspace,
          otherSpace,
          t
        );
        await AgentTablesQueryConfigurationTable.create(
          {
            workspaceId: otherWorkspace.id,
            tableId: "test_table",
            dataSourceId: otherFolder.dataSource.id,
            dataSourceViewId: otherFolder.id,
            mcpServerConfigurationId: mcpServerConfiguration.id,
          },
          { transaction: t }
        );
        // End of creation of table configuration in a different workspace

        const tableConfigId = makeSId("table_configuration", {
          id: tableConfig.id,
          workspaceId: workspace.id,
        });
        const tablesConfiguration = [
          {
            uri: `table_configuration://dust/w/${workspace.sId}/table_configurations/${tableConfigId}`,
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
          },
        ];

        const result = await fetchTableDataSourceConfigurations(
          auth,
          tablesConfiguration
        );
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toHaveLength(1);
          expect(result.value[0].tableId).toBe(tableConfig.tableId);
          expect(result.value[0].workspaceId).toBe(workspace.sId);
        }
      }
    );

    itInTransaction("should handle dynamic table configurations", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const tablesConfiguration = [
        {
          uri: `table_configuration://dust/w/${workspace.sId}/data_source_views/dsv_12345/tables/table_name`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
        },
      ];

      const result = await fetchTableDataSourceConfigurations(
        auth,
        tablesConfiguration
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].tableId).toBe("table_name");
        expect(result.value[0].workspaceId).toBe(workspace.sId);
        expect(result.value[0].dataSourceViewId).toBe("dsv_12345");
      }
    });
  });

  describe("getCoreSearchArgs", () => {
    itInTransaction(
      "should return error when data source configuration belongs to different workspace",
      async (t: Transaction) => {
        const workspace = await WorkspaceFactory.basic();
        const otherWorkspace = await WorkspaceFactory.basic();
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        const otherSpace = await SpaceFactory.global(otherWorkspace, t);
        const otherFolder = await DataSourceViewFactory.folder(
          otherWorkspace,
          otherSpace,
          t
        );

        const dataSourceConfig = await AgentDataSourceConfiguration.create(
          {
            workspaceId: otherWorkspace.id,
            dataSourceId: otherFolder.dataSource.id,
            dataSourceViewId: otherFolder.id,
            tagsMode: null,
            tagsIn: null,
            tagsNotIn: null,
          },
          { transaction: t }
        );

        const dataSourceConfigId = makeSId("data_source_configuration", {
          id: dataSourceConfig.id,
          workspaceId: otherWorkspace.id,
        });
        const dataSourceConfiguration = {
          uri: `data_source_configuration://dust/w/${otherWorkspace.sId}/data_source_configurations/${dataSourceConfigId}`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        };

        const result = await getCoreSearchArgs(auth, dataSourceConfiguration);
        expect(result.isErr()).toBe(true);
      }
    );

    itInTransaction(
      "should return error for invalid data source configuration URI",
      async () => {
        const workspace = await WorkspaceFactory.basic();
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        const dataSourceConfiguration = {
          uri: "invalid_uri",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        };

        const result = await getCoreSearchArgs(auth, dataSourceConfiguration);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain(
            "Invalid URI for a data source configuration"
          );
        }
      }
    );

    itInTransaction(
      "should return core search args when data source configuration belongs to the workspace",
      async (t: Transaction) => {
        const workspace = await WorkspaceFactory.basic();
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        const space = await SpaceFactory.global(workspace, t);
        const folder = await DataSourceViewFactory.folder(workspace, space, t);

        const dataSourceConfig = await AgentDataSourceConfiguration.create(
          {
            workspaceId: workspace.id,
            dataSourceId: folder.dataSource.id,
            dataSourceViewId: folder.id,
            tagsMode: null,
            tagsIn: null,
            tagsNotIn: null,
          },
          { transaction: t }
        );

        // Also create a data source configuration in a different workspace
        const otherWorkspace = await WorkspaceFactory.basic();
        const otherSpace = await SpaceFactory.global(otherWorkspace, t);
        const otherFolder = await DataSourceViewFactory.folder(
          otherWorkspace,
          otherSpace,
          t
        );
        await AgentDataSourceConfiguration.create(
          {
            workspaceId: otherWorkspace.id,
            dataSourceId: otherFolder.dataSource.id,
            dataSourceViewId: otherFolder.id,
            tagsMode: null,
            tagsIn: null,
            tagsNotIn: null,
          },
          { transaction: t }
        );
        // End of creation of data source configuration in a different workspace

        const dataSourceConfigId = makeSId("data_source_configuration", {
          id: dataSourceConfig.id,
          workspaceId: workspace.id,
        });
        const dataSourceConfiguration = {
          uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_configurations/${dataSourceConfigId}`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        };

        const result = await getCoreSearchArgs(auth, dataSourceConfiguration);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.projectId).toBe(
            folder.dataSource.dustAPIProjectId
          );
          expect(result.value.dataSourceId).toBe(
            folder.dataSource.dustAPIDataSourceId
          );
          expect(result.value.filter.tags.in).toBeNull();
          expect(result.value.filter.tags.not).toBeNull();
          expect(result.value.dataSourceView).toBeDefined();
        }
      }
    );
  });
});
