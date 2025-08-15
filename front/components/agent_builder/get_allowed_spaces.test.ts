import { describe, expect, it } from "vitest";

import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { AssistantBuilderMCPOrVizState } from "@app/components/assistant_builder/types";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SpaceType } from "@app/types";

import { getAllowedSpaces, getSpaceIdToActionsMap } from "./get_allowed_spaces";

// Mock data for testing
const createMockSpace = (
  sId: string,
  name: string,
  kind: SpaceType["kind"] = "regular"
): SpaceType => ({
  sId,
  name,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  kind,
  groupIds: [],
  isRestricted: false,
  managementMode: "manual",
});

const createMockAction = (
  id: string,
  name: string
): AssistantBuilderMCPOrVizState => ({
  id,
  type: "DATA_VISUALIZATION",
  configuration: {},
  name,
  description: `Description for ${name}`,
  noConfigurationRequired: true,
});

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
  },
  noConfigurationRequired: false,
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

describe("getAllowedSpaces", () => {
  const space1 = createMockSpace("space1", "Space 1");
  const space2 = createMockSpace("space2", "Space 2");
  const space3 = createMockSpace("space3", "Space 3");
  const companySpace = createMockSpace("company", "Company Space", "global");
  const spaces = [space1, space2, space3, companySpace];

  const action1 = createMockAction("action1", "Action 1");
  const action2 = createMockAction("action2", "Action 2");
  const action3 = createMockAction("action3", "Action 3");

  describe("when spaceIdToActions is empty", () => {
    it("should return all spaces including company space", () => {
      const result = getAllowedSpaces({
        spaces,
        spaceIdToActions: {},
      });

      expect(result).toHaveLength(spaces.length);
      expect(result).toEqual(expect.arrayContaining(spaces));
      expect(result).toContain(companySpace);
    });

    it("should return all spaces including company space even when an action is provided", () => {
      const result = getAllowedSpaces({
        action: action1,
        spaces,
        spaceIdToActions: {},
      });

      expect(result).toHaveLength(spaces.length);
      expect(result).toEqual(expect.arrayContaining(spaces));
      expect(result).toContain(companySpace);
    });
  });

  describe("when spaceIdToActions is not empty", () => {
    it("should return only spaces that are used by other actions plus company space", () => {
      const spaceIdToActions = {
        space1: [action1],
        space2: [action2],
      };

      const result = getAllowedSpaces({
        spaces,
        spaceIdToActions,
      });

      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([space1, space2, companySpace])
      );
      expect(result).not.toContain(space3);
      expect(result).toContain(companySpace); // Company space should always be included
    });

    it("should exclude the current action when determining used spaces", () => {
      const spaceIdToActions = {
        space1: [action1, action2], // action1 and action2 both use space1
        space2: [action1], // action1 also uses space2
      };

      // When the current action is action1, it should not be considered as "using" the spaces
      const result = getAllowedSpaces({
        action: action1,
        spaces,
        spaceIdToActions,
      });

      // Since action1 is the current action, only action2 is considered as using space1
      // action1 is not considered as using space2 (since it's the current action)
      // Company space should always be included
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([space1, companySpace]));
      expect(result).not.toContain(space2);
      expect(result).not.toContain(space3);
      expect(result).toContain(companySpace);
    });

    it("should return all spaces when current action is the only one using spaces", () => {
      const spaceIdToActions = {
        space1: [action1],
        space2: [action1],
      };

      // When action1 is the current action and it's the only action using spaces
      const result = getAllowedSpaces({
        action: action1,
        spaces,
        spaceIdToActions,
      });

      // Since action1 is excluded, no other actions are using spaces, so all spaces should be allowed
      expect(result).toHaveLength(spaces.length);
      expect(result).toEqual(expect.arrayContaining(spaces));
      expect(result).toContain(companySpace);
    });

    it("should handle multiple actions per space correctly", () => {
      const spaceIdToActions = {
        space1: [action1, action2, action3], // Multiple actions using space1
        space2: [action2], // Only action2 using space2
      };

      const result = getAllowedSpaces({
        action: action1, // Current action is action1
        spaces,
        spaceIdToActions,
      });

      // action1 is excluded, so space1 is still used by action2 and action3
      // space2 is used by action2
      // Company space should always be included
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([space1, space2, companySpace])
      );
      expect(result).not.toContain(space3);
      expect(result).toContain(companySpace);
    });

    it("should return all spaces when no spaces are used by other actions", () => {
      const spaceIdToActions = {
        space1: [action1],
      };

      const result = getAllowedSpaces({
        action: action1, // Current action is the only one using space1
        spaces,
        spaceIdToActions,
      });

      // Since action1 is excluded and no other actions use any spaces,
      // no spaces are "used by other actions", so all spaces should be returned
      expect(result).toHaveLength(spaces.length);
      expect(result).toEqual(expect.arrayContaining(spaces));
      expect(result).toContain(companySpace);
    });

    it("should handle spaces not present in spaceIdToActions", () => {
      const spaceIdToActions = {
        space1: [action1],
        // space2 and space3 are not in spaceIdToActions
      };

      const result = getAllowedSpaces({
        spaces,
        spaceIdToActions,
      });

      // Only space1 has actions, so only space1 and company space should be returned
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([space1, companySpace]));
      expect(result).toContain(companySpace);
    });

    it("should handle empty arrays in spaceIdToActions", () => {
      const spaceIdToActions = {
        space1: [], // Empty array
        space2: [action1],
      };

      const result = getAllowedSpaces({
        spaces,
        spaceIdToActions,
      });

      // Only space2 has actions, so only space2 and company space should be returned
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([space2, companySpace]));
      expect(result).toContain(companySpace);
    });
  });

  describe("company space behavior", () => {
    it("should always include company space even when no other spaces are used", () => {
      const spaceIdToActions = {
        // No spaces are used by actions
      };

      const result = getAllowedSpaces({
        spaces: [companySpace], // Only company space in the list
        spaceIdToActions,
      });

      expect(result).toHaveLength(1);
      expect(result).toEqual(expect.arrayContaining([companySpace]));
      expect(result).toContain(companySpace);
    });

    it("should include company space even when other spaces are restricted", () => {
      const spaceIdToActions = {
        space1: [action1], // Only space1 is used, so normally only space1 would be allowed
      };

      const result = getAllowedSpaces({
        spaces,
        spaceIdToActions,
      });

      // Should include space1 (used by actions) and company space (always allowed)
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([space1, companySpace]));
      expect(result).toContain(companySpace);
      expect(result).not.toContain(space2);
      expect(result).not.toContain(space3);
    });

    it("should include company space when it's used by actions", () => {
      const spaceIdToActions = {
        company: [action1], // Company space is used by action1
        space1: [action2], // space1 is used by action2
      };

      const result = getAllowedSpaces({
        action: action1, // Current action is action1
        spaces,
        spaceIdToActions,
      });

      // Should include space1 (used by other actions) and company space (always allowed)
      // Company space usage by action1 should be ignored since action1 is current action
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([space1, companySpace]));
      expect(result).toContain(companySpace);
    });

    it("should include correct spaces regardless of order", () => {
      const spaceIdToActions = {
        space2: [action1],
        space1: [action2],
      };

      const result = getAllowedSpaces({
        spaces,
        spaceIdToActions,
      });

      // Should include space1, space2, and company space (order doesn't matter)
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([space1, space2, companySpace])
      );
      expect(result).toContain(space1);
      expect(result).toContain(space2);
      expect(result).toContain(companySpace);
      expect(result).not.toContain(space3);
    });

    it("should not count company space usage when determining space restrictions", () => {
      const spaceIdToActions = {
        company: [action1], // Only company space is used by action1
        // No other spaces are used by actions
      };

      const result = getAllowedSpaces({
        spaces,
        spaceIdToActions,
      });

      // Since only company space is used (and company space doesn't count as "used" for restrictions),
      // all spaces should be returned (as if no spaces were used by actions)
      expect(result).toHaveLength(spaces.length);
      expect(result).toEqual(expect.arrayContaining(spaces));
      expect(result).toContain(space1);
      expect(result).toContain(space2);
      expect(result).toContain(space3);
      expect(result).toContain(companySpace);
    });

    it("should not count company space usage when mixed with regular space usage", () => {
      const spaceIdToActions = {
        company: [action1], // Company space used by action1
        space1: [action2], // Regular space used by action2
      };

      const result = getAllowedSpaces({
        spaces,
        spaceIdToActions,
      });

      // Should include space1 (used by action2) and company space (always allowed)
      // Company space usage by action1 should not affect the restriction logic
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([space1, companySpace]));
      expect(result).toContain(space1);
      expect(result).toContain(companySpace);
      expect(result).not.toContain(space2);
      expect(result).not.toContain(space3);
    });

    it("should handle current action using company space correctly", () => {
      const spaceIdToActions = {
        company: [action1, action2], // Both actions use company space
        space1: [action2], // action2 also uses space1
      };

      const result = getAllowedSpaces({
        action: action1, // Current action is action1
        spaces,
        spaceIdToActions,
      });

      // action1 is excluded from consideration
      // action2 uses both company space and space1
      // Since company space usage doesn't count for restrictions, only space1 should be considered "used"
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([space1, companySpace]));
      expect(result).toContain(space1);
      expect(result).toContain(companySpace);
      expect(result).not.toContain(space2);
      expect(result).not.toContain(space3);
    });
  });

  describe("edge cases", () => {
    it("should handle empty spaces array", () => {
      const result = getAllowedSpaces({
        spaces: [],
        spaceIdToActions: {},
      });

      expect(result).toEqual([]);
    });

    it("should handle empty spaces array with company space", () => {
      const result = getAllowedSpaces({
        spaces: [companySpace],
        spaceIdToActions: {},
      });

      expect(result).toHaveLength(1);
      expect(result).toEqual(expect.arrayContaining([companySpace]));
    });

    it("should handle undefined action", () => {
      const spaceIdToActions = {
        space1: [action1],
      };

      const result = getAllowedSpaces({
        action: undefined,
        spaces,
        spaceIdToActions,
      });

      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([space1, companySpace]));
      expect(result).toContain(companySpace);
    });
  });
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

  describe("DATA_VISUALIZATION actions", () => {
    it("should not map DATA_VISUALIZATION actions to any space", () => {
      const vizAction = createMockAction("viz1", "Viz Action");
      const result = getSpaceIdToActionsMap([vizAction], []);
      expect(result).toEqual({});
    });

    it("should ignore DATA_VISUALIZATION actions when mixed with MCP actions", () => {
      const vizAction = createMockAction("viz1", "Viz Action");
      const mcpAction = createMockMCPAction("mcp1", "MCP Action", "server1");
      const result = getSpaceIdToActionsMap(
        [vizAction, mcpAction],
        [mcpServerView1]
      );
      expect(result).toEqual({
        space1: [mcpAction],
      });
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

    it("should handle mixed action types and configurations", () => {
      const vizAction = createMockAction("viz1", "Viz Action");
      const dataSourceConfigs = {
        config1: createMockDataSourceConfiguration("space2", "datasource1"),
      };
      const mcpAction1 = createMockMCPAction("mcp1", "MCP Action 1", "server1");
      const mcpAction2 = createMockMCPAction(
        "mcp2",
        "MCP Action 2",
        undefined,
        dataSourceConfigs
      );

      const result = getSpaceIdToActionsMap(
        [vizAction, mcpAction1, mcpAction2],
        [mcpServerView1]
      );
      expect(result).toEqual({
        space1: [mcpAction1],
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
