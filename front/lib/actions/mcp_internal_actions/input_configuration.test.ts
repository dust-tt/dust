import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import type { ServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { augmentInputsWithConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { ConfigurableToolInputJSONSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { WorkspaceType } from "@app/types";

// Mock workspace for testing
const mockWorkspace: WorkspaceType = {
  id: 1,
  sId: "test-workspace",
  name: "Test Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  metadata: {},
};

// Helper function to create a basic MCP tool configuration
function createBasicMCPConfiguration(
  overrides: Partial<ServerSideMCPToolConfigurationType> = {}
): ServerSideMCPToolConfigurationType {
  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: "test_server",
    description: "Test server",
    dataSources: null,
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: "test-view-id",
    dustAppConfiguration: null,
    internalMCPServerId: null,
    inputSchema: {
      type: "object",
      properties: {},
    },
    availability: "manual",
    permission: "never_ask",
    toolServerId: "test-tool-server-id",
    retryPolicy: "no_retry",
    originalName: "test_tool",
    mcpServerName: "test_server",
    ...overrides,
  };
}

describe("augmentInputsWithConfiguration", () => {
  describe("basic functionality", () => {
    it("should return original inputs when no schema properties exist", () => {
      const rawInputs = { someParam: "value" };
      const config = createBasicMCPConfiguration({
        inputSchema: {
          type: "object",
          properties: {},
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual(rawInputs);
    });

    it("should return original inputs when no missing required properties", () => {
      const rawInputs = { requiredParam: "provided" };
      const config = createBasicMCPConfiguration({
        inputSchema: {
          type: "object",
          properties: {
            requiredParam: { type: "string" },
          },
          required: ["requiredParam"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual(rawInputs);
    });
  });

  describe("DATA_SOURCE mime type", () => {
    it("should augment inputs with data source configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        dataSources: [
          {
            workspaceId: mockWorkspace.sId,
            sId: "ds-123",
            dataSourceViewId: "view-123",
            filter: {
              tags: { in: ["test"], not: [], mode: "auto" },
              parents: { in: [], not: [] },
            },
          },
        ],
        inputSchema: {
          type: "object",
          properties: {
            dataSource:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
              ],
          },
          required: ["dataSource"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        dataSource: [
          {
            uri: `data_source_configuration://dust/w/${mockWorkspace.sId}/data_source_configurations/ds-123`,
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
          },
        ],
      });
    });

    it("should handle data source with filter instead of sId", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        dataSources: [
          {
            workspaceId: mockWorkspace.sId,
            sId: undefined,
            dataSourceViewId: "view-123",
            filter: {
              tags: { in: ["test"], not: [], mode: "auto" },
              parents: { in: [], not: [] },
            },
          },
        ],
        inputSchema: {
          type: "object",
          properties: {
            dataSource:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
              ],
          },
          required: ["dataSource"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      const expectedFilter = encodeURIComponent(
        JSON.stringify({
          tags: { in: ["test"], not: [], mode: "auto" },
          parents: { in: [], not: [] },
        })
      );
      expect(result).toEqual({
        dataSource: [
          {
            uri: `data_source_configuration://dust/w/${mockWorkspace.sId}/data_source_views/view-123/filter/${expectedFilter}`,
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
          },
        ],
      });
    });
  });

  describe("TABLE mime type", () => {
    it("should augment inputs with table configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        tables: [
          {
            workspaceId: mockWorkspace.sId,
            sId: "table-123",
            dataSourceViewId: "view-123",
            tableId: "table-id-123",
          },
        ],
        inputSchema: {
          type: "object",
          properties: {
            table:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE
              ],
          },
          required: ["table"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        table: [
          {
            uri: `table_configuration://dust/w/${mockWorkspace.sId}/table_configurations/table-123`,
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
          },
        ],
      });
    });
  });

  describe("AGENT mime type", () => {
    it("should augment inputs with agent configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        childAgentId: "agent-123",
        inputSchema: {
          type: "object",
          properties: {
            agent:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT
              ],
          },
          required: ["agent"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        agent: {
          uri: `agent://dust/w/${mockWorkspace.sId}/agents/agent-123`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
        },
      });
    });

    it("should throw error when childAgentId is missing", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        childAgentId: null,
        inputSchema: {
          type: "object",
          properties: {
            agent:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT
              ],
          },
          required: ["agent"],
        },
      });

      expect(() => {
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: config,
        });
      }).toThrow("Unreachable: child agent configuration without an sId.");
    });
  });

  describe("REASONING_MODEL mime type", () => {
    it("should augment inputs with reasoning model configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        reasoningModel: {
          modelId: "gpt-4o",
          providerId: "openai",
          temperature: 0.7,
          reasoningEffort: "medium",
        },
        inputSchema: {
          type: "object",
          properties: {
            model:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL
              ],
          },
          required: ["model"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        model: {
          modelId: "gpt-4o",
          providerId: "openai",
          temperature: 0.7,
          reasoningEffort: "medium",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL,
        },
      });
    });
  });

  describe("NULLABLE_TIME_FRAME mime type", () => {
    it("should augment inputs with time frame configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        timeFrame: {
          duration: 7,
          unit: "day",
        },
        inputSchema: {
          type: "object",
          properties: {
            timeFrame:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME
              ],
          },
          required: ["timeFrame"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        timeFrame: {
          duration: 7,
          unit: "day",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME,
        },
      });
    });

    it("should return null when timeFrame is not configured", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        timeFrame: null,
        inputSchema: {
          type: "object",
          properties: {
            timeFrame: {
              oneOf: [
                { type: "null" },
                {
                  type: "object",
                  properties: {
                    duration: { type: "number" },
                    unit: { type: "string" },
                    mimeType: {
                      type: "string",
                      const: INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME,
                    },
                  },
                  required: ["duration", "unit", "mimeType"],
                },
              ],
            },
          },
          required: ["timeFrame"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        timeFrame: null,
      });
    });
  });

  describe("JSON_SCHEMA mime type", () => {
    it("should augment inputs with JSON schema configuration", () => {
      // FAILS
      const rawInputs = {};
      const jsonSchema = {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
        },
        required: ["name"],
      };
      const config = createBasicMCPConfiguration({
        jsonSchema,
        inputSchema: {
          type: "object",
          properties: {
            schema:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA
              ],
          },
          required: ["schema"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        schema: {
          ...jsonSchema,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
        },
      });
    });

    it("should return null when jsonSchema is not configured", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        jsonSchema: null,
        inputSchema: {
          type: "object",
          properties: {
            schema: {
              oneOf: [
                { type: "null" },
                {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    mimeType: {
                      type: "string",
                      const: INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
                    },
                  },
                  required: ["type", "mimeType"],
                },
              ],
            },
          },
          required: ["schema"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        schema: null,
      });
    });
  });

  describe("primitive types", () => {
    it("should augment inputs with string configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          stringParam: "test-value",
        },
        inputSchema: {
          type: "object",
          properties: {
            stringParam: {
              type: "object",
              properties: {
                value: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
                },
              },
              required: ["value", "mimeType"],
            },
          },
          required: ["stringParam"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        stringParam: {
          value: "test-value",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
        },
      });
    });

    it("should augment inputs with number configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          numberParam: 42,
        },
        inputSchema: {
          type: "object",
          properties: {
            numberParam: {
              type: "object",
              properties: {
                value: { type: "number" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
                },
              },
              required: ["value", "mimeType"],
            },
          },
          required: ["numberParam"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        numberParam: {
          value: 42,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
        },
      });
    });

    it("should augment inputs with boolean configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          booleanParam: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            booleanParam: {
              type: "object",
              properties: {
                value: { type: "boolean" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
                },
              },
              required: ["value", "mimeType"],
            },
          },
          required: ["booleanParam"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        booleanParam: {
          value: true,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
        },
      });
    });

    it("should augment inputs with enum configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          enumParam: "option1",
        },
        inputSchema: {
          type: "object",
          properties: {
            enumParam: {
              type: "object",
              properties: {
                value: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
                },
              },
              required: ["value", "mimeType"],
            },
          },
          required: ["enumParam"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        enumParam: {
          value: "option1",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
        },
      });
    });

    it("should augment inputs with list configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          listParam: ["item1", "item2", "item3"],
        },
        inputSchema: {
          type: "object",
          properties: {
            listParam: {
              type: "object",
              properties: {
                options: { type: "object" },
                values: {
                  type: "array",
                  items: { type: "string" },
                },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.LIST,
                },
              },
              required: ["options", "values", "mimeType"],
            },
          },
          required: ["listParam"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        listParam: {
          values: ["item1", "item2", "item3"],
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.LIST,
        },
      });
    });
  });

  describe("DUST_APP mime type", () => {
    it("should augment inputs with Dust app configuration", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        dustAppConfiguration: {
          id: 1,
          sId: "app-123",
          type: "dust_app_run_configuration",
          name: "Test App",
          description: "Test app description",
          appWorkspaceId: mockWorkspace.sId,
          appId: "app-123",
        },
        inputSchema: {
          type: "object",
          properties: {
            dustApp: {
              type: "object",
              properties: {
                appId: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP,
                },
              },
              required: ["appId", "mimeType"],
            },
          },
          required: ["dustApp"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        dustApp: {
          appId: "app-123",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP,
        },
      });
    });

    it("should throw error when dustAppConfiguration is missing", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        dustAppConfiguration: null,
        inputSchema: {
          type: "object",
          properties: {
            dustApp: {
              type: "object",
              properties: {
                appId: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP,
                },
              },
              required: ["appId", "mimeType"],
            },
          },
          required: ["dustApp"],
        },
      });

      expect(() => {
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: config,
        });
      }).toThrow("Invalid Dust App configuration");
    });
  });

  describe("error handling", () => {
    it("should throw error for invalid string type", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          stringParam: 123, // Invalid type
        },
        inputSchema: {
          type: "object",
          properties: {
            stringParam: {
              type: "object",
              properties: {
                value: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
                },
              },
              required: ["value", "mimeType"],
            },
          },
          required: ["stringParam"],
        },
      });

      expect(() => {
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: config,
        });
      }).toThrow("Expected string value for key stringParam, got number");
    });

    it("should throw error for invalid number type", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          numberParam: "not-a-number",
        },
        inputSchema: {
          type: "object",
          properties: {
            numberParam: {
              type: "object",
              properties: {
                value: { type: "number" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
                },
              },
              required: ["value", "mimeType"],
            },
          },
          required: ["numberParam"],
        },
      });

      expect(() => {
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: config,
        });
      }).toThrow("Expected number value for key numberParam, got string");
    });

    it("should throw error for invalid list type", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          listParam: "not-an-array",
        },
        inputSchema: {
          type: "object",
          properties: {
            listParam: {
              type: "object",
              properties: {
                options: { type: "object" },
                values: {
                  type: "array",
                  items: { type: "string" },
                },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.LIST,
                },
              },
              required: ["options", "values", "mimeType"],
            },
          },
          required: ["listParam"],
        },
      });

      expect(() => {
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: config,
        });
      }).toThrow(
        "Expected array of string values for key listParam, got string"
      );
    });
  });

  describe("nested objects and complex schemas", () => {
    it("should handle nested objects with configurable properties", () => {
      const rawInputs = { nested: {} };
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          "nested.stringParam": "nested-value",
        },
        inputSchema: {
          type: "object",
          properties: {
            nested: {
              type: "object",
              properties: {
                stringParam:
                  ConfigurableToolInputJSONSchemas[
                    INTERNAL_MIME_TYPES.TOOL_INPUT.STRING
                  ],
              },
              required: ["stringParam"],
            },
          },
          required: ["nested"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        nested: {
          stringParam: {
            value: "nested-value",
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
          },
        },
      });
    });

    it("should handle multiple missing properties", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          stringParam: "string-value",
          numberParam: 42,
        },
        dataSources: [
          {
            workspaceId: mockWorkspace.sId,
            sId: "ds-123",
            dataSourceViewId: "view-123",
            filter: {
              tags: { in: ["test"], not: [], mode: "auto" },
              parents: { in: [], not: [] },
            },
          },
        ],
        inputSchema: {
          type: "object",
          properties: {
            stringParam:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.STRING
              ],
            numberParam:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER
              ],
            dataSource:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
              ],
          },
          required: ["stringParam", "numberParam", "dataSource"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        stringParam: {
          value: "string-value",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
        },
        numberParam: {
          value: 42,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
        },
        dataSource: [
          {
            uri: `data_source_configuration://dust/w/${mockWorkspace.sId}/data_source_configurations/ds-123`,
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
          },
        ],
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty data sources array", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        dataSources: [],
        inputSchema: {
          type: "object",
          properties: {
            dataSource:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
              ],
          },
          required: ["dataSource"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        dataSource: [],
      });
    });

    it("should handle null data sources", () => {
      const rawInputs = {};
      const config = createBasicMCPConfiguration({
        dataSources: null,
        inputSchema: {
          type: "object",
          properties: {
            dataSource:
              ConfigurableToolInputJSONSchemas[
                INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
              ],
          },
          required: ["dataSource"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        dataSource: [],
      });
    });

    it("should preserve existing inputs and only add missing ones", () => {
      const rawInputs = {
        existingParam: "existing-value",
        partiallyProvided: "user-provided",
      };
      const config = createBasicMCPConfiguration({
        additionalConfiguration: {
          stringParam: "config-value",
        },
        inputSchema: {
          type: "object",
          properties: {
            existingParam: { type: "string" },
            partiallyProvided: { type: "string" },
            stringParam: {
              type: "object",
              properties: {
                value: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
                },
              },
              required: ["value", "mimeType"],
            },
          },
          required: ["existingParam", "partiallyProvided", "stringParam"],
        },
      });

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: config,
      });

      expect(result).toEqual({
        existingParam: "existing-value",
        partiallyProvided: "user-provided",
        stringParam: {
          value: "config-value",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
        },
      });
    });
  });
});
