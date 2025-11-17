import { describe, expect, it } from "vitest";

import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";

import { getSpaceIdToActionsMap } from "./get_spaceid_to_actions_map";

const createMockMCPAction = (
  id: string,
  name: string,
  mcpServerViewId?: string | null,
  dataSourceConfigurations?: any,
  tablesConfigurations?: any
): AgentBuilderAction => ({
  id,
  type: "MCP",
  name,
  description: `Description for ${name}`,
  configuration: {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    mcpServerViewId: mcpServerViewId || "",
    dataSourceConfigurations: dataSourceConfigurations || null,
    tablesConfigurations: tablesConfigurations || null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
    jsonSchema: null,
    _jsonSchemaString: null,
    secretName: null,
  },
  configurationRequired: true,
});

const createMockMCPServerView = (
  sId: string,
  spaceId: string,
  name: string,
  availability: MCPServerAvailability = "manual"
): MCPServerViewType => ({
  id: 1,
  sId,
  name,
  description: `Description for ${name}`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  spaceId,
  serverType: "internal",
  server: {
    sId: `server-${sId}`,
    name: `Server ${name}`,
    version: "1.0.0",
    description: `Server description for ${name}`,
    icon: "ActionServerIcon",
    authorization: null,
    tools: [],
    availability,
    allowMultipleInstances: true,
    documentationUrl: null,
  },
  oAuthUseCase: null,
  editedByUser: null,
});

const createMockDataSourceView = (spaceId: string, name: string) => ({
  sId: `dsv-${name}`,
  name,
  spaceId,
  // Add other required properties as needed
});

const createMockDataSourceConfiguration = (spaceId: string, name: string) => ({
  dataSourceView: createMockDataSourceView(spaceId, name),
  selectedResources: [],
  isSelectAll: false,
  tagsFilter: null,
});

describe("getSpaceIdToActionsMap", () => {
  const mcpServerView1 = createMockMCPServerView(
    "server1",
    "space1",
    "Server 1"
  );
  const mcpServerView2 = createMockMCPServerView(
    "server2",
    "space2",
    "Server 2"
  );
  const mcpServerView3 = createMockMCPServerView(
    "server3",
    "space3",
    "Server 3",
    "auto"
  );

  describe("when actions array is empty", () => {
    it("should return empty object", () => {
      const result = getSpaceIdToActionsMap([], []);
      expect(result).toEqual({});
    });
  });

  describe("MCP actions with mcpServerViewId", () => {
    it("should map MCP action to space based on mcpServerView", () => {
      const mcpAction = createMockMCPAction("mcp1", "MCP Action", "server1");
      const result = getSpaceIdToActionsMap([mcpAction], [mcpServerView1]);
      expect(result).toEqual({
        space1: [mcpAction],
      });
    });

    it("should handle multiple MCP actions with different server views", () => {
      const mcpAction1 = createMockMCPAction("mcp1", "MCP Action 1", "server1");
      const mcpAction2 = createMockMCPAction("mcp2", "MCP Action 2", "server2");
      const result = getSpaceIdToActionsMap(
        [mcpAction1, mcpAction2],
        [mcpServerView1, mcpServerView2]
      );
      expect(result).toEqual({
        space1: [mcpAction1],
        space2: [mcpAction2],
      });
    });

    it("should handle multiple MCP actions using the same server view", () => {
      const mcpAction1 = createMockMCPAction("mcp1", "MCP Action 1", "server1");
      const mcpAction2 = createMockMCPAction("mcp2", "MCP Action 2", "server1");
      const result = getSpaceIdToActionsMap(
        [mcpAction1, mcpAction2],
        [mcpServerView1]
      );
      expect(result).toEqual({
        space1: [mcpAction1, mcpAction2],
      });
    });

    it("should not map MCP action when mcpServerView is not found", () => {
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        "nonexistent"
      );
      const result = getSpaceIdToActionsMap([mcpAction], [mcpServerView1]);
      expect(result).toEqual({});
    });

    it("should handle MCP action with null mcpServerViewId", () => {
      const mcpAction = createMockMCPAction("mcp1", "MCP Action", undefined);
      const result = getSpaceIdToActionsMap([mcpAction], [mcpServerView1]);
      expect(result).toEqual({});
    });

    it("should handle MCP action with undefined mcpServerViewId", () => {
      const mcpAction = createMockMCPAction("mcp1", "MCP Action");
      const result = getSpaceIdToActionsMap([mcpAction], [mcpServerView1]);
      expect(result).toEqual({});
    });

    it("should not map default availability MCP servers", () => {
      const mcpAction = createMockMCPAction("mcp1", "MCP Action", "server3");
      const result = getSpaceIdToActionsMap([mcpAction], [mcpServerView3]);
      expect(result).toEqual({});
    });
  });

  describe("MCP actions with dataSourceConfigurations", () => {
    it("should map MCP action to space based on dataSourceConfigurations", () => {
      const dataSourceConfigs = {
        config1: createMockDataSourceConfiguration("space1", "datasource1"),
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        undefined,
        dataSourceConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({
        space1: [mcpAction],
      });
    });

    it("should handle multiple dataSourceConfigurations in different spaces", () => {
      const dataSourceConfigs = {
        config1: createMockDataSourceConfiguration("space1", "datasource1"),
        config2: createMockDataSourceConfiguration("space2", "datasource2"),
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        undefined,
        dataSourceConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({
        space1: [mcpAction],
        space2: [mcpAction],
      });
    });

    it("should handle null configurations in dataSourceConfigurations", () => {
      const dataSourceConfigs = {
        config1: createMockDataSourceConfiguration("space1", "datasource1"),
        config2: null,
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        undefined,
        dataSourceConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({
        space1: [mcpAction],
      });
    });

    it("should handle null dataSourceConfigurations", () => {
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        undefined,
        null
      );
      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({});
    });
  });

  describe("MCP actions with tablesConfigurations", () => {
    it("should map MCP action to space based on tablesConfigurations", () => {
      const tablesConfigs = {
        table1: createMockDataSourceConfiguration("space1", "table1"),
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        undefined,
        null,
        tablesConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({
        space1: [mcpAction],
      });
    });

    it("should handle multiple tablesConfigurations in different spaces", () => {
      const tablesConfigs = {
        table1: createMockDataSourceConfiguration("space1", "table1"),
        table2: createMockDataSourceConfiguration("space2", "table2"),
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        undefined,
        null,
        tablesConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({
        space1: [mcpAction],
        space2: [mcpAction],
      });
    });

    it("should handle null configurations in tablesConfigurations", () => {
      const tablesConfigs = {
        table1: createMockDataSourceConfiguration("space1", "table1"),
        table2: null,
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        undefined,
        null,
        tablesConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({
        space1: [mcpAction],
      });
    });
  });

  describe("complex MCP action configurations", () => {
    it("should handle MCP action with both mcpServerViewId and dataSourceConfigurations", () => {
      const dataSourceConfigs = {
        config1: createMockDataSourceConfiguration("space2", "datasource1"),
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        "server1",
        dataSourceConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], [mcpServerView1]);
      expect(result).toEqual({
        space1: [mcpAction], // From mcpServerView
        space2: [mcpAction], // From dataSourceConfigurations
      });
    });

    it("should handle MCP action with mcpServerViewId, dataSourceConfigurations, and tablesConfigurations", () => {
      const dataSourceConfigs = {
        config1: createMockDataSourceConfiguration("space2", "datasource1"),
      };
      const tablesConfigs = {
        table1: createMockDataSourceConfiguration("space3", "table1"),
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        "server1",
        dataSourceConfigs,
        tablesConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], [mcpServerView1]);
      expect(result).toEqual({
        space1: [mcpAction], // From mcpServerView
        space2: [mcpAction], // From dataSourceConfigurations
        space3: [mcpAction], // From tablesConfigurations
      });
    });

    it("should handle same space used in multiple configurations", () => {
      const dataSourceConfigs = {
        config1: createMockDataSourceConfiguration("space1", "datasource1"),
      };
      const tablesConfigs = {
        table1: createMockDataSourceConfiguration("space1", "table1"),
      };
      const mcpAction = createMockMCPAction(
        "mcp1",
        "MCP Action",
        "server1",
        dataSourceConfigs,
        tablesConfigs
      );
      const result = getSpaceIdToActionsMap([mcpAction], [mcpServerView1]);
      expect(result).toEqual({
        space1: [mcpAction], // Should only appear once despite being used in multiple configs
      });
    });
  });

  describe("multiple actions and complex scenarios", () => {
    it("should handle multiple actions using overlapping spaces", () => {
      const dataSourceConfigs1 = {
        config1: createMockDataSourceConfiguration("space1", "datasource1"),
      };
      const dataSourceConfigs2 = {
        config2: createMockDataSourceConfiguration("space1", "datasource2"),
        config3: createMockDataSourceConfiguration("space2", "datasource3"),
      };

      const mcpAction1 = createMockMCPAction(
        "mcp1",
        "MCP Action 1",
        undefined,
        dataSourceConfigs1
      );
      const mcpAction2 = createMockMCPAction(
        "mcp2",
        "MCP Action 2",
        undefined,
        dataSourceConfigs2
      );

      const result = getSpaceIdToActionsMap([mcpAction1, mcpAction2], []);
      expect(result).toEqual({
        space1: [mcpAction1, mcpAction2],
        space2: [mcpAction2],
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty mcpServerViews array", () => {
      const mcpAction = createMockMCPAction("mcp1", "MCP Action", "server1");
      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({});
    });

    it("should handle actions with empty configurations", () => {
      const mcpAction = createMockMCPAction("mcp1", "MCP Action");
      if (mcpAction.configuration) {
        mcpAction.configuration.dataSourceConfigurations = {};
        mcpAction.configuration.tablesConfigurations = {};
      }

      const result = getSpaceIdToActionsMap([mcpAction], []);
      expect(result).toEqual({});
    });
  });
});
