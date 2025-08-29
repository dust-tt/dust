import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { beforeEach, describe, expect, it } from "vitest";

import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { augmentInputsWithConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { WorkspaceType } from "@app/types";

describe("augmentInputsWithConfiguration", () => {
  let mockWorkspace: WorkspaceType;
  let baseActionConfiguration: MCPToolConfigurationType;

  beforeEach(() => {
    mockWorkspace = {
      id: 1,
      sId: "test-workspace-123",
      name: "Test Workspace",
      description: "A test workspace",
      allowedDomain: null,
      dustAPIProjectId: "test-project-123",
    } as WorkspaceType;

    baseActionConfiguration = {
      type: "mcp_configuration",
      name: "test-tool",
      description: "A test tool",
      toolServerId: "test-server",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      availability: "unrestricted",
      originalName: "test-tool",
      mcpServerName: "test-server",
    } as MCPToolConfigurationType;
  });

  describe("basic functionality", () => {
    it("should return rawInputs unchanged when inputSchema has no properties", () => {
      const rawInputs = { existingProp: "value" };
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result).toEqual(rawInputs);
      expect(result).not.toBe(rawInputs); // Should be a copy
    });

    it("should return rawInputs unchanged when no required properties are missing", () => {
      const rawInputs = { existingProp: "value" };
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            existingProp: { type: "string" },
          },
          required: ["existingProp"],
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result).toEqual(rawInputs);
    });

    it("should preserve existing properties while adding missing ones", () => {
      const rawInputs = { existingProp: "existing-value" };
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            existingProp: { type: "string" },
            missingProp: {
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
          required: ["existingProp", "missingProp"],
        },
        additionalConfiguration: {
          missingProp: "configured-value",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result).toEqual({
        existingProp: "existing-value",
        missingProp: {
          value: "configured-value",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
        },
      });
    });
  });

  describe("data source configuration", () => {
    it("should augment missing data source configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            dataSources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  uri: { type: "string" },
                  mimeType: {
                    type: "string",
                    const: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
                  },
                },
                required: ["uri", "mimeType"],
              },
            },
          },
          required: ["dataSources"],
        },
        dataSources: [
          {
            workspaceId: mockWorkspace.sId,
            sId: "data-source-123",
            dataSourceViewId: "view-123",
            filter: { tags: ["test"] },
          },
        ],
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.dataSources).toEqual([
        {
          uri: `data_source_configuration://dust/w/${mockWorkspace.sId}/data_source_configurations/data-source-123`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        },
      ]);
    });

    it("should handle data source configuration without sId", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            dataSources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  uri: { type: "string" },
                  mimeType: {
                    type: "string",
                    const: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
                  },
                },
                required: ["uri", "mimeType"],
              },
            },
          },
          required: ["dataSources"],
        },
        dataSources: [
          {
            workspaceId: mockWorkspace.sId,
            dataSourceViewId: "view-123",
            filter: { tags: ["test"] },
          },
        ],
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.dataSources).toEqual([
        {
          uri: `data_source_configuration://dust/w/${mockWorkspace.sId}/data_source_views/view-123/filter/${encodeURIComponent(
            JSON.stringify({ tags: ["test"] })
          )}`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        },
      ]);
    });
  });

  describe("data warehouse configuration", () => {
    it("should augment missing data warehouse configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            dataWarehouse: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  uri: { type: "string" },
                  mimeType: {
                    type: "string",
                    const: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE,
                  },
                },
                required: ["uri", "mimeType"],
              },
            },
          },
          required: ["dataWarehouse"],
        },
        dataSources: [
          {
            workspaceId: mockWorkspace.sId,
            sId: "warehouse-123",
            dataSourceViewId: "view-123",
            filter: { tags: ["warehouse"] },
          },
        ],
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.dataWarehouse).toEqual([
        {
          uri: `data_source_configuration://dust/w/${mockWorkspace.sId}/data_source_configurations/warehouse-123`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE,
        },
      ]);
    });
  });

  describe("table configuration", () => {
    it("should augment missing table configuration with sId", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            tables: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  uri: { type: "string" },
                  mimeType: {
                    type: "string",
                    const: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
                  },
                },
                required: ["uri", "mimeType"],
              },
            },
          },
          required: ["tables"],
        },
        tables: [
          {
            workspaceId: mockWorkspace.sId,
            sId: "table-config-123",
            dataSourceViewId: "view-123",
            tableId: "table-123",
          },
        ],
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.tables).toEqual([
        {
          uri: `table_configuration://dust/w/${mockWorkspace.sId}/table_configurations/table-config-123`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
        },
      ]);
    });

    it("should augment missing table configuration without sId", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            tables: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  uri: { type: "string" },
                  mimeType: {
                    type: "string",
                    const: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
                  },
                },
                required: ["uri", "mimeType"],
              },
            },
          },
          required: ["tables"],
        },
        tables: [
          {
            workspaceId: mockWorkspace.sId,
            dataSourceViewId: "view-123",
            tableId: "table-123",
          },
        ],
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.tables).toEqual([
        {
          uri: `table_configuration://dust/w/${mockWorkspace.sId}/data_source_views/view-123/tables/table-123`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
        },
      ]);
    });
  });

  describe("agent configuration", () => {
    it("should augment missing agent configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            agent: {
              type: "object",
              properties: {
                uri: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
                },
              },
              required: ["uri", "mimeType"],
            },
          },
          required: ["agent"],
        },
        childAgentId: "agent-123",
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.agent).toEqual({
        uri: `agent://dust/w/${mockWorkspace.sId}/agents/agent-123`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
      });
    });
  });

  describe("reasoning model configuration", () => {
    it("should augment missing reasoning model configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            reasoningModel: {
              type: "object",
              properties: {
                modelId: { type: "string" },
                providerId: { type: "string" },
                temperature: { type: "number", nullable: true },
                reasoningEffort: { type: "string", nullable: true },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL,
                },
              },
              required: ["modelId", "providerId", "mimeType"],
            },
          },
          required: ["reasoningModel"],
        },
        reasoningModel: {
          modelId: "gpt-4",
          providerId: "openai",
          temperature: 0.7,
          reasoningEffort: "medium",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.reasoningModel).toEqual({
        modelId: "gpt-4",
        providerId: "openai",
        temperature: 0.7,
        reasoningEffort: "medium",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL,
      });
    });
  });

  describe("time frame configuration", () => {
    it("should augment missing time frame configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            timeFrame: {
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
          },
          required: ["timeFrame"],
        },
        timeFrame: {
          duration: 7,
          unit: "days",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.timeFrame).toEqual({
        duration: 7,
        unit: "days",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME,
      });
    });

    it("should return null when time frame is not configured", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            timeFrame: {
              type: "object",
              nullable: true,
              properties: {
                duration: { type: "number" },
                unit: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME,
                },
              },
            },
          },
          required: ["timeFrame"],
        },
        // timeFrame not set
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.timeFrame).toBeNull();
    });
  });

  describe("JSON schema configuration", () => {
    it("should augment missing JSON schema configuration", () => {
      const rawInputs = {};
      const validJsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      };

      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            jsonSchema: {
              type: "object",
              properties: {
                schema: { type: "object" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
                },
              },
              required: ["schema", "mimeType"],
            },
          },
          required: ["jsonSchema"],
        },
        jsonSchema: validJsonSchema,
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.jsonSchema).toEqual({
        schema: validJsonSchema,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
      });
    });

    it("should return null when JSON schema is not configured", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            jsonSchema: {
              type: "object",
              nullable: true,
              properties: {
                schema: { type: "object" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
                },
              },
            },
          },
          required: ["jsonSchema"],
        },
        // jsonSchema not set
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.jsonSchema).toBeNull();
    });
  });

  describe("primitive type configurations", () => {
    it("should augment missing string configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
        additionalConfiguration: {
          stringParam: "test-string-value",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.stringParam).toEqual({
        value: "test-string-value",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
      });
    });

    it("should augment missing number configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
        additionalConfiguration: {
          numberParam: 42,
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.numberParam).toEqual({
        value: 42,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
      });
    });

    it("should augment missing boolean configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
        additionalConfiguration: {
          booleanParam: true,
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.booleanParam).toEqual({
        value: true,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
      });
    });

    it("should augment missing enum configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            enumParam: {
              type: "object",
              properties: {
                value: {
                  type: "string",
                  enum: ["option1", "option2", "option3"],
                },
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
        additionalConfiguration: {
          enumParam: "option2",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.enumParam).toEqual({
        value: "option2",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
      });
    });

    it("should augment missing list configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            listParam: {
              type: "object",
              properties: {
                values: {
                  type: "array",
                  items: { type: "string" },
                },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.LIST,
                },
              },
              required: ["values", "mimeType"],
            },
          },
          required: ["listParam"],
        },
        additionalConfiguration: {
          listParam: ["item1", "item2", "item3"],
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.listParam).toEqual({
        values: ["item1", "item2", "item3"],
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.LIST,
      });
    });
  });

  describe("dust app configuration", () => {
    it("should augment missing dust app configuration", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
        dustAppConfiguration: {
          appId: "dust-app-123",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.dustApp).toEqual({
        appId: "dust-app-123",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP,
      });
    });
  });

  describe("nested and complex schemas", () => {
    it("should handle nested object properties", () => {
      const rawInputs = { outer: {} };
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            outer: {
              type: "object",
              properties: {
                inner: {
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
              required: ["inner"],
            },
          },
          required: ["outer"],
        },
        additionalConfiguration: {
          "outer.inner": "nested-value",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.outer.inner).toEqual({
        value: "nested-value",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
      });
    });

    it("should handle multiple missing properties", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
            agent: {
              type: "object",
              properties: {
                uri: { type: "string" },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
                },
              },
              required: ["uri", "mimeType"],
            },
          },
          required: ["stringParam", "numberParam", "agent"],
        },
        additionalConfiguration: {
          stringParam: "test-value",
          numberParam: 123,
        },
        childAgentId: "agent-456",
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result).toEqual({
        stringParam: {
          value: "test-value",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
        },
        numberParam: {
          value: 123,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
        },
        agent: {
          uri: `agent://dust/w/${mockWorkspace.sId}/agents/agent-456`,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
        },
      });
    });
  });

  describe("schema references", () => {
    it("should follow $ref references in schemas", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            referencedParam: {
              $ref: "#/$defs/StringConfig",
            },
          },
          required: ["referencedParam"],
          $defs: {
            StringConfig: {
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
        },
        additionalConfiguration: {
          referencedParam: "referenced-value",
        },
      };

      const result = augmentInputsWithConfiguration({
        owner: mockWorkspace,
        rawInputs,
        actionConfiguration: actionConfig,
      });

      expect(result.referencedParam).toEqual({
        value: "referenced-value",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
      });
    });
  });

  describe("error handling", () => {
    it("should throw error when string value is not a string", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
        additionalConfiguration: {
          stringParam: 123, // Wrong type
        },
      };

      expect(() =>
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: actionConfig,
        })
      ).toThrow("Expected string value for key stringParam, got number");
    });

    it("should throw error when number value is not a number", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
        additionalConfiguration: {
          numberParam: "not-a-number",
        },
      };

      expect(() =>
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: actionConfig,
        })
      ).toThrow("Expected number value for key numberParam, got string");
    });

    it("should throw error when boolean value is not a boolean", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
        additionalConfiguration: {
          booleanParam: "not-a-boolean",
        },
      };

      expect(() =>
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: actionConfig,
        })
      ).toThrow("Expected boolean value for key booleanParam, got string");
    });

    it("should throw error when list value is not an array of strings", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
        inputSchema: {
          type: "object",
          properties: {
            listParam: {
              type: "object",
              properties: {
                values: {
                  type: "array",
                  items: { type: "string" },
                },
                mimeType: {
                  type: "string",
                  const: INTERNAL_MIME_TYPES.TOOL_INPUT.LIST,
                },
              },
              required: ["values", "mimeType"],
            },
          },
          required: ["listParam"],
        },
        additionalConfiguration: {
          listParam: [1, 2, 3], // Wrong type - should be strings
        },
      };

      expect(() =>
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: actionConfig,
        })
      ).toThrow(
        "Expected array of string values for key listParam, got object for mime type"
      );
    });

    it("should throw error when dust app configuration is missing appId", () => {
      const rawInputs = {};
      const actionConfig = {
        ...baseActionConfiguration,
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
        // dustAppConfiguration missing or invalid
      };

      expect(() =>
        augmentInputsWithConfiguration({
          owner: mockWorkspace,
          rawInputs,
          actionConfiguration: actionConfig,
        })
      ).toThrow("Invalid Dust App configuration");
    });
  });
});
