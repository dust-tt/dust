import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { setupAgentOwner } from "@app/pages/api/w/[wId]/assistant/agent_configurations/index.test";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import { fetchTableDataSourceConfigurations, getCoreSearchArgs } from "./utils";

describe("MCP Internal Actions Server Utils", () => {
  describe("fetchAgentTableConfigurations", () => {
    it("should return error when table configuration belongs to different workspace", async () => {
      const workspace = await WorkspaceFactory.basic();
      const otherWorkspace = await WorkspaceFactory.basic();
      await SpaceFactory.system(workspace);
      const globalSpace = await SpaceFactory.global(workspace);
      await GroupFactory.defaults(workspace);
      const { agentOwnerAuth: auth } = await setupAgentOwner(
        workspace,
        "admin"
      );

      const otherSpace = await SpaceFactory.global(otherWorkspace);
      const otherFolder = await DataSourceViewFactory.folder(
        otherWorkspace,
        otherSpace
      );

      await InternalMCPServerInMemoryResource.makeNew(auth, {
        name: "search",
        useCase: null,
      });
      const mcpServerConfiguration =
        await AgentMCPServerConfigurationFactory.create(auth, globalSpace);

      // Create a table configuration in a different workspace
      const tableConfig = await AgentTablesQueryConfigurationTableModel.create({
        workspaceId: otherWorkspace.id,
        tableId: "test_table",
        dataSourceId: otherFolder.dataSource.id,
        dataSourceViewId: otherFolder.id,
        mcpServerConfigurationId: mcpServerConfiguration.id,
      });

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
        expect(result.error.message).toContain("does not belong to workspace");
      }
    });

    it("should return error for invalid table configuration URI", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

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
    });

    it("should return table configurations when they belong to the workspace", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const { agentOwnerAuth: auth } = await setupAgentOwner(
        workspace,
        "admin"
      );

      await SpaceFactory.system(workspace);
      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);
      await InternalMCPServerInMemoryResource.makeNew(auth, {
        name: "search",
        useCase: null,
      });
      const mcpServerConfiguration =
        await AgentMCPServerConfigurationFactory.create(auth, space);

      // Create a table configuration in the workspace
      const tableConfig = await AgentTablesQueryConfigurationTableModel.create({
        workspaceId: workspace.id,
        tableId: "test_table",
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        mcpServerConfigurationId: mcpServerConfiguration.id,
      });

      // Also create a table configuration in a different workspace
      const otherWorkspace = await WorkspaceFactory.basic();
      const otherSpace = await SpaceFactory.global(otherWorkspace);
      const otherFolder = await DataSourceViewFactory.folder(
        otherWorkspace,
        otherSpace
      );
      await AgentTablesQueryConfigurationTableModel.create({
        workspaceId: otherWorkspace.id,
        tableId: "test_table",
        dataSourceId: otherFolder.dataSource.id,
        dataSourceViewId: otherFolder.id,
        mcpServerConfigurationId: mcpServerConfiguration.id,
      });
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
    });

    it("should handle dynamic table configurations", async () => {
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
    it("should return error when data source configuration belongs to different workspace", async () => {
      const workspace = await WorkspaceFactory.basic();
      const otherWorkspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const otherSpace = await SpaceFactory.global(otherWorkspace);
      const otherFolder = await DataSourceViewFactory.folder(
        otherWorkspace,
        otherSpace
      );

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: otherWorkspace.id,
        dataSourceId: otherFolder.dataSource.id,
        dataSourceViewId: otherFolder.id,
        tagsMode: null,
        tagsIn: null,
        tagsNotIn: null,
      });

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
    });

    it("should return error for invalid data source configuration URI", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const dataSourceConfiguration = {
        uri: "invalid_uri",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      };

      const result = await getCoreSearchArgs(auth, dataSourceConfiguration);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          "Failed to fetch data source configurations."
        );
      }
    });

    it("should return core search args when data source configuration belongs to the workspace", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: null,
        tagsIn: null,
        tagsNotIn: null,
      });

      // Also create a data source configuration in a different workspace
      const otherWorkspace = await WorkspaceFactory.basic();
      const otherSpace = await SpaceFactory.global(otherWorkspace);
      const otherFolder = await DataSourceViewFactory.folder(
        otherWorkspace,
        otherSpace
      );
      await AgentDataSourceConfigurationModel.create({
        workspaceId: otherWorkspace.id,
        dataSourceId: otherFolder.dataSource.id,
        dataSourceViewId: otherFolder.id,
        tagsMode: null,
        tagsIn: null,
        tagsNotIn: null,
      });
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
        expect(result.value.projectId).toBe(folder.dataSource.dustAPIProjectId);
        expect(result.value.dataSourceId).toBe(
          folder.dataSource.dustAPIDataSourceId
        );
        expect(result.value.filter.tags.in).toBeNull();
        expect(result.value.filter.tags.not).toBeNull();
        expect(result.value.dataSourceView).toBeDefined();
      }
    });

    it("should carry over tagsIn filter from AgentDataSourceConfigurationModel", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: "custom",
        tagsIn: ["tag1", "tag2", "tag3"],
        tagsNotIn: [],
        parentsIn: null,
        parentsNotIn: null,
      });

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
        expect(result.value.filter.tags.in).toEqual(["tag1", "tag2", "tag3"]);
        expect(result.value.filter.tags.not).toEqual([]);
        expect(result.value.filter.parents.in).toBeNull();
        expect(result.value.filter.parents.not).toBeNull();
      }
    });

    it("should carry over tagsNotIn filter from AgentDataSourceConfigurationModel", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: "custom",
        tagsIn: [],
        tagsNotIn: ["excluded-tag1", "excluded-tag2"],
        parentsIn: null,
        parentsNotIn: null,
      });

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
        expect(result.value.filter.tags.in).toEqual([]);
        expect(result.value.filter.tags.not).toEqual([
          "excluded-tag1",
          "excluded-tag2",
        ]);
        expect(result.value.filter.parents.in).toBeNull();
        expect(result.value.filter.parents.not).toBeNull();
      }
    });

    it("should carry over both tagsIn and tagsNotIn filters from AgentDataSourceConfigurationModel", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: "custom",
        tagsIn: ["included-tag1", "included-tag2"],
        tagsNotIn: ["excluded-tag1", "excluded-tag2"],
        parentsIn: null,
        parentsNotIn: null,
      });

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
        expect(result.value.filter.tags.in).toEqual([
          "included-tag1",
          "included-tag2",
        ]);
        expect(result.value.filter.tags.not).toEqual([
          "excluded-tag1",
          "excluded-tag2",
        ]);
        expect(result.value.filter.parents.in).toBeNull();
        expect(result.value.filter.parents.not).toBeNull();
      }
    });

    it("should carry over tags with auto mode from AgentDataSourceConfigurationModel", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: "auto",
        tagsIn: ["auto-tag1", "auto-tag2"],
        tagsNotIn: ["auto-excluded"],
        parentsIn: null,
        parentsNotIn: null,
      });

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
        expect(result.value.filter.tags.in).toEqual(["auto-tag1", "auto-tag2"]);
        expect(result.value.filter.tags.not).toEqual(["auto-excluded"]);
      }
    });

    it("should carry over parentsIn filter from AgentDataSourceConfigurationModel", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: null,
        tagsIn: null,
        tagsNotIn: null,
        parentsIn: ["parent1", "parent2"],
        parentsNotIn: null,
      });

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
        expect(result.value.filter.tags.in).toBeNull();
        expect(result.value.filter.tags.not).toBeNull();
        expect(result.value.filter.parents.in).toEqual(["parent1", "parent2"]);
        expect(result.value.filter.parents.not).toEqual([]);
      }
    });

    it("should carry over parentsNotIn filter from AgentDataSourceConfigurationModel", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: null,
        tagsIn: null,
        tagsNotIn: null,
        parentsIn: null,
        parentsNotIn: ["excluded-parent1", "excluded-parent2"],
      });

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
        expect(result.value.filter.tags.in).toBeNull();
        expect(result.value.filter.tags.not).toBeNull();
        expect(result.value.filter.parents.in).toEqual([]);
        expect(result.value.filter.parents.not).toEqual([
          "excluded-parent1",
          "excluded-parent2",
        ]);
      }
    });

    it("should carry over both parentsIn and parentsNotIn filters from AgentDataSourceConfigurationModel", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: null,
        tagsIn: null,
        tagsNotIn: null,
        parentsIn: ["parent1", "parent2"],
        parentsNotIn: ["excluded-parent1"],
      });

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
        expect(result.value.filter.tags.in).toBeNull();
        expect(result.value.filter.tags.not).toBeNull();
        expect(result.value.filter.parents.in).toEqual(["parent1", "parent2"]);
        expect(result.value.filter.parents.not).toEqual(["excluded-parent1"]);
      }
    });

    it("should carry over both tags and parents filters from AgentDataSourceConfigurationModel", async () => {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const space = await SpaceFactory.global(workspace);
      const folder = await DataSourceViewFactory.folder(workspace, space);

      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: "custom",
        tagsIn: ["tag1", "tag2"],
        tagsNotIn: ["excluded-tag"],
        parentsIn: ["parent1"],
        parentsNotIn: ["excluded-parent"],
      });

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
        expect(result.value.filter.tags.in).toEqual(["tag1", "tag2"]);
        expect(result.value.filter.tags.not).toEqual(["excluded-tag"]);
        expect(result.value.filter.parents.in).toEqual(["parent1"]);
        expect(result.value.filter.parents.not).toEqual(["excluded-parent"]);
      }
    });

    it("should return error when data source view is not readable by the authenticator", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);

      // Create a restricted space (not accessible by default to regular users)
      const restrictedSpace = await SpaceFactory.regular(workspace);

      // Create a data source view in the restricted space using admin auth
      const folder = await DataSourceViewFactory.folder(
        workspace,
        restrictedSpace
      );

      // Create a regular user (not admin) who won't have access to the restricted space
      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        regularUser.sId,
        workspace.sId
      );

      // Create a data source configuration pointing to the view in the restricted space
      const dataSourceConfig = await AgentDataSourceConfigurationModel.create({
        workspaceId: workspace.id,
        dataSourceId: folder.dataSource.id,
        dataSourceViewId: folder.id,
        tagsMode: null,
        tagsIn: null,
        tagsNotIn: null,
        parentsIn: null,
        parentsNotIn: null,
      });

      const dataSourceConfigId = makeSId("data_source_configuration", {
        id: dataSourceConfig.id,
        workspaceId: workspace.id,
      });
      const dataSourceConfiguration = {
        uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_configurations/${dataSourceConfigId}`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      };

      // Try to get core search args with the regular user's auth
      // This should fail because the user cannot read the data source view
      const result = await getCoreSearchArgs(userAuth, dataSourceConfiguration);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        // The error gets wrapped in a generic message, but the underlying issue
        // is that the data source view is not readable by the user
        expect(result.error.message).toContain(
          "Failed to fetch data source configurations"
        );
      }
    });
  });
});
