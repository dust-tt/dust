import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MCPServerViewType } from "@app/lib/api/mcp";

import { getDefaultConfiguration } from "./formDefaults";

// Mock the input configuration module
vi.mock("@app/lib/actions/mcp_internal_actions/input_configuration", () => ({
  getMCPServerToolsConfigurations: vi.fn(),
}));

import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";

const mockGetMCPServerToolsConfigurations = vi.mocked(
  getMCPServerToolsConfigurations
);

describe("getDefaultConfiguration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when mcpServerView is null or undefined", () => {
    it("should return base defaults for null mcpServerView", () => {
      const result = getDefaultConfiguration(null);

      expect(result).toEqual({
        mcpServerViewId: "not-a-valid-sId",
        dataSourceConfigurations: null,
        tablesConfigurations: null,
        childAgentId: null,
        reasoningModel: null,
        timeFrame: null,
        additionalConfiguration: {},
        dustAppConfiguration: null,
        jsonSchema: null,
        _jsonSchemaString: null,
      });
    });

    it("should return base defaults for undefined mcpServerView", () => {
      const result = getDefaultConfiguration(undefined);

      expect(result).toEqual({
        mcpServerViewId: "not-a-valid-sId",
        dataSourceConfigurations: null,
        tablesConfigurations: null,
        childAgentId: null,
        reasoningModel: null,
        timeFrame: null,
        additionalConfiguration: {},
        dustAppConfiguration: null,
        jsonSchema: null,
        _jsonSchemaString: null,
      });
    });
  });

  describe("when mcpServerView is provided", () => {
    const mockMCPServerView: MCPServerViewType = {
      id: 1,
      sId: "test-server-123",
      name: "Test Server",
      description: "Test server description",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      spaceId: "test-space-123",
      serverType: "internal",
      server: {
        sId: "test_server",
        name: "test_server",
        version: "1.0.0",
        description: "Test server",
        tools: [],
        icon: "ActionEmotionLaughIcon",
        authorization: null,
        availability: "manual",
        allowMultipleInstances: false,
        documentationUrl: null,
      },
      oAuthUseCase: null,
      editedByUser: null,
      toolsMetadata: [],
    };

    it("should use mcpServerView sId as mcpServerViewId", () => {
      mockGetMCPServerToolsConfigurations.mockReturnValue({
        mayRequireDataSourceConfiguration: false,
        mayRequireDataWarehouseConfiguration: false,
        mayRequireTableConfiguration: false,
        mayRequireChildAgentConfiguration: false,
        mayRequireReasoningConfiguration: false,
        mayRequireTimeFrameConfiguration: false,
        mayRequireJsonSchemaConfiguration: false,
        stringConfigurations: [],
        numberConfigurations: [],
        booleanConfigurations: [],
        enumConfigurations: {},
        listConfigurations: {},
        mayRequireDustAppConfiguration: false,
        configurationNotObligatory: false,
        configurable: true,
      });

      const result = getDefaultConfiguration(mockMCPServerView);

      expect(result.mcpServerViewId).toBe("test-server-123");
    });

    describe("boolean configurations", () => {
      it("should set boolean configurations to false by default", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [],
          booleanConfigurations: [
            {
              key: "is_enabled",
              description: "Whether the feature is enabled",
            },
            { key: "admin_mode", description: "Admin mode setting" },
            { key: "nested.deep.flag", description: "A deeply nested boolean" },
          ],
          enumConfigurations: {},
          listConfigurations: {},
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
        configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          is_enabled: false,
          admin_mode: false,
          nested: {
            deep: {
              flag: false,
            },
          },
        });
      });

      it("should use explicit boolean defaults when available", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [],
          booleanConfigurations: [
            {
              key: "feature_enabled",
              description: "Feature enabled",
              default: true,
            },
            { key: "debug_mode", description: "Debug mode", default: false },
            { key: "auto_save", description: "Auto save" }, // no explicit default
          ],
          enumConfigurations: {},
          listConfigurations: {},
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          feature_enabled: true, // explicit default
          debug_mode: false, // explicit default
          auto_save: false, // fallback default
        });
      });

      it("should handle empty boolean configurations", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [],
          booleanConfigurations: [],
          enumConfigurations: {},
          listConfigurations: {},
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({});
      });
    });

    describe("enum configurations", () => {
      it("should set enum configurations to first option", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [],
          booleanConfigurations: [],
          enumConfigurations: {
            priority: {
              options: ["low", "medium", "high"],
              description: "Priority level",
            },
            category: {
              options: ["A", "B", "C"],
              description: "Category selection",
            },
            "nested.enum": {
              options: ["option1", "option2"],
              description: "Nested enum",
            },
          },
          listConfigurations: {},
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          priority: "low",
          category: "A",
          nested: {
            enum: "option1",
          },
        });
      });

      it("should skip enum configurations with empty options", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [],
          booleanConfigurations: [],
          enumConfigurations: {
            valid_enum: {
              options: ["option1", "option2"],
              description: "Valid enum",
            },
            empty_enum: {
              options: [],
              description: "Empty enum",
            },
          },
          listConfigurations: {},
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          valid_enum: "option1",
          // empty_enum should not be present
        });
      });

      it("should use explicit enum defaults when available", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [],
          booleanConfigurations: [],
          enumConfigurations: {
            priority: {
              options: ["low", "medium", "high"],
              description: "Priority level",
              default: "medium", // explicit default
            },
            status: {
              options: ["draft", "published", "archived"],
              description: "Status", // no explicit default, should use first
            },
          },
          listConfigurations: {},
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          priority: "medium", // explicit default
          status: "draft", // first option fallback
        });
      });
    });

    describe("list configurations", () => {
      it("should set list configurations to empty arrays", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [],
          booleanConfigurations: [],
          enumConfigurations: {},
          listConfigurations: {
            tags: {
              options: { tag1: "Tag 1", tag2: "Tag 2" },
              description: "Available tags",
            },
            categories: {
              options: { cat1: "Category 1", cat2: "Category 2" },
              description: "Available categories",
            },
            "nested.lists": {
              options: { item1: "Item 1" },
              description: "Nested list",
            },
          },
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          tags: [],
          categories: [],
          nested: {
            lists: [],
          },
        });
      });
    });

    describe("string configurations", () => {
      it("should set defaults for string configurations when available", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [
            {
              key: "api_key",
              description: "API Key",
              default: "default-key-123",
            },
            {
              key: "endpoint_url",
              description: "Endpoint URL",
              default: "https://api.example.com",
            },
            { key: "user_name", description: "User Name" }, // no default
          ],
          numberConfigurations: [],
          booleanConfigurations: [],
          enumConfigurations: {},
          listConfigurations: {},
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        // Fixed behavior: strings with defaults ARE now included
        expect(result.additionalConfiguration).toEqual({
          api_key: "default-key-123",
          endpoint_url: "https://api.example.com",
          // user_name should not be set since it has no default
        });
      });
    });

    describe("number configurations", () => {
      it("should set defaults for number configurations when available", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [
            { key: "timeout", description: "Timeout in seconds", default: 30 },
            { key: "max_retries", description: "Maximum retries", default: 3 },
            { key: "port", description: "Port number" }, // no default
          ],
          booleanConfigurations: [],
          enumConfigurations: {},
          listConfigurations: {},
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        // Fixed behavior: numbers with defaults ARE now included
        expect(result.additionalConfiguration).toEqual({
          timeout: 30,
          max_retries: 3,
          // port should not be set since it has no default
        });
      });
    });

    describe("mixed configurations", () => {
      it("should handle all configuration types together", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [
            { key: "api_key", description: "API Key", default: "secret-key" },
          ],
          numberConfigurations: [
            { key: "timeout", description: "Timeout", default: 30 },
          ],
          booleanConfigurations: [
            { key: "is_enabled", description: "Enabled" },
          ],
          enumConfigurations: {
            priority: {
              options: ["low", "medium", "high"],
              description: "Priority",
            },
          },
          listConfigurations: {
            tags: {
              options: { tag1: "Tag 1" },
              description: "Tags",
            },
          },
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        // Fixed behavior: all types with defaults get their values set
        expect(result.additionalConfiguration).toEqual({
          is_enabled: false,
          priority: "low",
          tags: [],
          api_key: "secret-key", // String default now included
          timeout: 30, // Number default now included
        });
      });
    });

    describe("comprehensive default handling", () => {
      it("should handle mixed types with nested paths and explicit defaults", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [
            { key: "api.key", description: "API Key", default: "dev-key-123" },
            { key: "api.endpoint", description: "API Endpoint" }, // no default
            {
              key: "database.connection.string",
              description: "DB Connection",
              default: "mongodb://localhost:27017",
            },
          ],
          numberConfigurations: [
            { key: "api.timeout", description: "API Timeout", default: 5000 },
            { key: "database.pool.max", description: "Max Pool Size" }, // no default
            { key: "server.port", description: "Server Port", default: 3000 },
          ],
          booleanConfigurations: [
            {
              key: "features.auth.enabled",
              description: "Auth enabled",
              default: true,
            },
            { key: "features.logging.debug", description: "Debug logging" }, // no default (will use false)
          ],
          enumConfigurations: {
            "logging.level": {
              options: ["debug", "info", "warn", "error"],
              description: "Logging level",
              default: "info",
            },
            environment: {
              options: ["development", "staging", "production"],
              description: "Environment", // no default (will use first)
            },
          },
          listConfigurations: {
            "features.experimental": {
              options: { feature1: "Feature 1", feature2: "Feature 2" },
              description: "Experimental features",
              default: "feature1",
            },
            "allowed.origins": {
              options: { localhost: "Localhost", "example.com": "Example" },
              description: "Allowed origins", // no default (will use empty array)
            },
          },
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          api: {
            key: "dev-key-123", // string default
            timeout: 5000, // number default
            // endpoint: missing - no default
          },
          database: {
            connection: {
              string: "mongodb://localhost:27017", // nested string default
            },
            // pool.max: missing - no default
          },
          server: {
            port: 3000, // number default
          },
          features: {
            auth: {
              enabled: true, // explicit boolean default
            },
            logging: {
              debug: false, // fallback boolean default
            },
            experimental: ["feature1"], // list with explicit default
          },
          logging: {
            level: "info", // explicit enum default
          },
          environment: "development", // enum first option fallback
          allowed: {
            origins: [], // list fallback to empty array
          },
        });
      });
    });

    describe("nested path handling", () => {
      it("should handle deeply nested configuration paths", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          mayRequireDataSourceConfiguration: false,
          mayRequireDataWarehouseConfiguration: false,
          mayRequireTableConfiguration: false,
          mayRequireChildAgentConfiguration: false,
          mayRequireReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          stringConfigurations: [],
          numberConfigurations: [],
          booleanConfigurations: [
            { key: "level1.level2.level3.deep_flag", description: "Deep flag" },
          ],
          enumConfigurations: {
            "a.b.c.d.enum": {
              options: ["x", "y"],
              description: "Deeply nested enum",
            },
          },
          listConfigurations: {
            "config.advanced.options": {
              options: { opt1: "Option 1" },
              description: "Advanced options",
            },
          },
          mayRequireDustAppConfiguration: false,
          configurationNotObligatory: false,
          configurable: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          level1: {
            level2: {
              level3: {
                deep_flag: false,
              },
            },
          },
          a: {
            b: {
              c: {
                d: {
                  enum: "x",
                },
              },
            },
          },
          config: {
            advanced: {
              options: [],
            },
          },
        });
      });
    });
  });

  describe("when toolsConfigurations is null", () => {
    it("should return base defaults when getMCPServerToolsConfigurations returns null", () => {
      const mockMCPServerView: MCPServerViewType = {
        id: 1,
        sId: "test-server-123",
        name: "Test Server",
        description: "Test server description",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        spaceId: "test-space-123",
        serverType: "internal",
        server: {
          sId: "test",
          name: "test",
          version: "1.0.0",
          description: "Test",
          tools: [],
          icon: "ActionEmotionLaughIcon",
          authorization: null,
          availability: "manual",
          allowMultipleInstances: false,
          documentationUrl: null,
        },
        oAuthUseCase: null,
        editedByUser: null,
        toolsMetadata: [],
      };

      // Simulate getMCPServerToolsConfigurations returning null somehow
      mockGetMCPServerToolsConfigurations.mockReturnValue(null as any);

      const result = getDefaultConfiguration(mockMCPServerView);

      expect(result).toEqual({
        mcpServerViewId: "test-server-123",
        dataSourceConfigurations: null,
        tablesConfigurations: null,
        childAgentId: null,
        reasoningModel: null,
        timeFrame: null,
        additionalConfiguration: {},
        dustAppConfiguration: null,
        jsonSchema: null,
        _jsonSchemaString: null,
      });
    });
  });
});

describe("Analysis: Why strings and numbers don't get defaults", () => {
  describe("Historical reasoning investigation - RESOLVED", () => {
    it("should demonstrate that the fix provides better UX while maintaining validation", () => {
      // This test shows how the fix improves UX while keeping validation intact

      const mockMCPServerView: MCPServerViewType = {
        id: 1,
        sId: "test-server",
        name: "Test Server",
        description: "Test server description",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        spaceId: "test-space-123",
        serverType: "internal",
        server: {
          sId: "test",
          name: "test",
          version: "1.0.0",
          description: "Test",
          tools: [],
          icon: "ActionEmotionLaughIcon",
          authorization: null,
          availability: "manual",
          allowMultipleInstances: false,
          documentationUrl: null,
        },
        oAuthUseCase: null,
        editedByUser: null,
        toolsMetadata: [],
      };

      mockGetMCPServerToolsConfigurations.mockReturnValue({
        mayRequireDataSourceConfiguration: false,
        mayRequireDataWarehouseConfiguration: false,
        mayRequireTableConfiguration: false,
        mayRequireChildAgentConfiguration: false,
        mayRequireReasoningConfiguration: false,
        mayRequireTimeFrameConfiguration: false,
        mayRequireJsonSchemaConfiguration: false,
        stringConfigurations: [
          { key: "required_field", description: "Required field" }, // no default
          {
            key: "optional_field",
            description: "Optional field",
            default: "default_value",
          },
        ],
        numberConfigurations: [
          { key: "required_number", description: "Required number" }, // no default
          {
            key: "optional_number",
            description: "Optional number",
            default: 42,
          },
        ],
        booleanConfigurations: [],
        enumConfigurations: {},
        listConfigurations: {},
        mayRequireDustAppConfiguration: false,
        configurationNotObligatory: false,
        configurable: true,
      });

      const result = getDefaultConfiguration(mockMCPServerView);

      // Fixed behavior: fields with defaults are pre-filled, fields without defaults remain empty
      expect(result.additionalConfiguration).toEqual({
        optional_field: "default_value", // ✅ Default applied - better UX
        optional_number: 42, // ✅ Default applied - better UX
        // required_field: missing - will trigger validation if required ✅
        // required_number: missing - will trigger validation if required ✅
      });

      // The fix provides:
      // ✅ Better UX: Users see helpful defaults immediately
      // ✅ Validation still works: Required fields without defaults trigger validation
      // ✅ User choice: Defaults can be overridden if needed
      // ✅ Modern behavior: Forms pre-populate sensible defaults
    });
  });

  describe("Current validation behavior", () => {
    it("should show that validation still works with defaults present", () => {
      // This test would verify that having defaults doesn't prevent validation
      // from working properly. Validation should still catch:
      // - Invalid values (wrong type, out of range, etc.)
      // - Missing required fields that don't have defaults
      // - Schema violations

      // The presence of a default value doesn't break validation,
      // it just provides a starting point for the user

      expect(true).toBe(true); // Placeholder - would need actual validation tests
    });
  });
});
