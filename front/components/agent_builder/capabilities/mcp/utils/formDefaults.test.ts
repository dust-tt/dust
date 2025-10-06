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
        secretName: null,
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
        secretName: null,
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
        dataSourceConfigurable: "no",
        dataWarehouseConfigurable: "no",
        tableConfigurable: "no",
        childAgentConfigurable: "no",
        reasoningConfigurable: "no",
        timeFrameConfigurable: "no",
        jsonSchemaConfigurable: "no",
        dustAppConfigurable: "no",
        secretConfigurable: "no",
        stringConfigurations: {},
        numberConfigurations: {},
        booleanConfigurations: {},
        enumConfigurations: {},
        listConfigurations: {},
        defaults: {
          stringConfigurations: {},
          numberConfigurations: {},
          booleanConfigurations: {},
          enumConfigurations: {},
          listConfigurations: {},
        },
        configurable: "optional",
      });

      const result = getDefaultConfiguration(mockMCPServerView);

      expect(result.mcpServerViewId).toBe("test-server-123");
    });

    describe("boolean configurations", () => {
      it("should set boolean configurations to false by default", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          enumConfigurations: {},
          listConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
          },
          configurable: "optional",
          booleanConfigurations: {
            is_enabled: {
              description: "Whether the feature is enabled",
            },
            admin_mode: {
              description: "Admin mode setting",
            },
            "nested.deep.flag": {
              description: "A deeply nested boolean",
            },
          },
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
          booleanConfigurations: {
            feature_enabled: {
              description: "Feature enabled",
            },
            debug_mode: {
              description: "Debug mode",
            },
            auto_save: {
              description: "Auto save",
            }, // no explicit default
          },
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          enumConfigurations: {},
          listConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {
              feature_enabled: true,
              debug_mode: false,
            },
            enumConfigurations: {},
            listConfigurations: {},
          },
          configurable: "optional",
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
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          booleanConfigurations: {},
          enumConfigurations: {},
          listConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
          },
          configurable: "optional",
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({});
      });
    });

    describe("enum configurations", () => {
      it("should set enum configurations to first option", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          booleanConfigurations: {},
          listConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
          },
          configurable: "optional",
          enumConfigurations: {
            priority: {
              options: [
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ],
              description: "Priority level",
            },
            category: {
              options: [
                { value: "A", label: "Option A" },
                { value: "B", label: "Option B" },
                { value: "C", label: "Option C" },
              ],
              description: "Category selection",
            },
            "nested.enum": {
              options: [
                { value: "option1", label: "Option 1" },
                { value: "option2", label: "Option 2" },
              ],
              description: "Nested enum",
            },
          },
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
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          booleanConfigurations: {},
          listConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
          },
          configurable: "optional",
          enumConfigurations: {
            valid_enum: {
              options: [
                { value: "option1", label: "Option 1" },
                { value: "option2", label: "Option 2" },
              ],
              description: "Valid enum",
            },
            empty_enum: {
              options: [],
              description: "Empty enum",
            },
          },
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          valid_enum: "option1",
          // empty_enum should not be present
        });
      });

      it("should use explicit enum defaults when available", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          booleanConfigurations: {},
          listConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {
              priority: "medium",
            },
            listConfigurations: {},
          },
          configurable: "optional",
          enumConfigurations: {
            priority: {
              options: [
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ],
              description: "Priority level",
            },
            status: {
              options: [
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
                { value: "archived", label: "Archived" },
              ],
              description: "Status", // no explicit default, should use first
            },
          },
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
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          booleanConfigurations: {},
          enumConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
          },
          configurable: "optional",
          listConfigurations: {
            tags: {
              options: [
                { value: "tag1", label: "Tag 1" },
                { value: "tag2", label: "Tag 2" },
              ],
              description: "Available tags",
            },
            categories: {
              options: [
                { value: "cat1", label: "Category 1" },
                { value: "cat2", label: "Category 2" },
              ],
              description: "Available categories",
            },
            "nested.lists": {
              options: [{ value: "item1", label: "Item 1" }],
              description: "Nested list",
            },
          },
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

      it("should set explicit list defaults when available", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          booleanConfigurations: {},
          enumConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {
              tags: ["tag1"],
              "nested.lists": ["item1"],
            },
          },
          configurable: "optional",
          listConfigurations: {
            tags: {
              options: [
                { value: "tag1", label: "Tag 1" },
                { value: "tag2", label: "Tag 2" },
              ],
              description: "Available tags",
            },
            categories: {
              options: [
                { value: "cat1", label: "Category 1" },
                { value: "cat2", label: "Category 2" },
              ],
              description: "Available categories",
            },
            "nested.lists": {
              options: [{ value: "item1", label: "Item 1" }],
              description: "Nested list",
            },
          },
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          tags: ["tag1"],
          categories: [],
          nested: {
            lists: ["item1"],
          },
        });
      });
    });

    describe("string configurations", () => {
      it("should set defaults for string configurations when available", () => {
        mockGetMCPServerToolsConfigurations.mockReturnValue({
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          numberConfigurations: {},
          booleanConfigurations: {},
          enumConfigurations: {},
          listConfigurations: {},
          defaults: {
            stringConfigurations: {
              api_key: "default-key-123",
              endpoint_url: "https://api.example.com",
            },
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
          },
          configurable: "optional",
          stringConfigurations: {
            api_key: {
              description: "API Key",
            },
            endpoint_url: {
              description: "Endpoint URL",
            },
            user_name: { description: "User Name" }, // no default
          },
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
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          booleanConfigurations: {},
          enumConfigurations: {},
          listConfigurations: {},
          defaults: {
            stringConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
            numberConfigurations: {
              timeout: 30,
              max_retries: 3,
            },
          },
          configurable: "optional",
          numberConfigurations: {
            timeout: { description: "Timeout in seconds" },
            max_retries: { description: "Maximum retries" },
            port: { description: "Port number" }, // no default
          },
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
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          defaults: {
            stringConfigurations: {
              api_key: "secret-key",
            },
            numberConfigurations: {
              timeout: 30,
            },
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
          },
          stringConfigurations: {
            api_key: { description: "API Key" },
          },
          numberConfigurations: {
            timeout: { description: "Timeout" },
          },
          booleanConfigurations: {
            is_enabled: { description: "Enabled" },
          },
          enumConfigurations: {
            priority: {
              options: [
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ],
              description: "Priority",
            },
          },
          listConfigurations: {
            tags: {
              options: [{ value: "tag1", label: "Tag 1" }],
              description: "Tags",
            },
          },
          configurable: "optional",
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
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          defaults: {
            stringConfigurations: {
              "api.key": "dev-key-123",
              "database.connection.string": "mongodb://localhost:27017",
            },
            numberConfigurations: {
              "api.timeout": 5000,
              "server.port": 3000,
            },
            booleanConfigurations: {
              "features.auth.enabled": true,
            },
            enumConfigurations: {
              "logging.level": "info",
            },
            listConfigurations: {
              "features.experimental": ["feature1"],
            },
          },
          stringConfigurations: {
            "api.key": { description: "API Key" },
            "api.endpoint": { description: "API Endpoint" }, // no default
            "database.connection.string": {
              description: "DB Connection",
            },
          },
          numberConfigurations: {
            "api.timeout": { description: "API Timeout" },
            "database.pool.max": { description: "Max Pool Size" }, // no default
            "server.port": { description: "Server Port" },
          },
          booleanConfigurations: {
            "features.auth.enabled": {
              description: "Auth enabled",
            },
            "features.logging.debug": { description: "Debug logging" }, // no default (will use false)
          },
          enumConfigurations: {
            "logging.level": {
              options: [
                { value: "debug", label: "Debug" },
                { value: "info", label: "Info" },
                { value: "warn", label: "Warn" },
                { value: "error", label: "Error" },
              ],
              description: "Logging level",
            },
            environment: {
              options: [
                { value: "development", label: "Development" },
                { value: "staging", label: "Staging" },
                { value: "production", label: "Production" },
              ],
              description: "Environment", // no default (will use first)
            },
          },
          listConfigurations: {
            "features.experimental": {
              options: [
                { value: "feature1", label: "Feature 1" },
                { value: "feature2", label: "Feature 2" },
              ],
              description: "Experimental features",
            },
            "allowed.origins": {
              options: [
                { value: "localhost", label: "Localhost" },
                { value: "example.com", label: "Example" },
              ],
              description: "Allowed origins", // no default (will use empty array)
            },
          },
          configurable: "optional",
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
          dataSourceConfigurable: "no",
          dataWarehouseConfigurable: "no",
          tableConfigurable: "no",
          childAgentConfigurable: "no",
          reasoningConfigurable: "no",
          timeFrameConfigurable: "no",
          jsonSchemaConfigurable: "no",
          dustAppConfigurable: "no",
          secretConfigurable: "no",
          stringConfigurations: {},
          numberConfigurations: {},
          defaults: {
            stringConfigurations: {},
            numberConfigurations: {},
            booleanConfigurations: {},
            enumConfigurations: {},
            listConfigurations: {},
          },
          configurable: "optional",
          booleanConfigurations: {
            "level1.level2.level3.deep_flag": { description: "Deep flag" },
          },
          enumConfigurations: {
            "a.b.c.d.enum": {
              options: [
                { value: "x", label: "X" },
                { value: "y", label: "Y" },
              ],
              description: "Deeply nested enum",
            },
          },
          listConfigurations: {
            "config.advanced.options": {
              options: [{ value: "opt1", label: "Option 1" }],
              description: "Advanced options",
            },
          },
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
        secretName: null,
      });
    });
  });
});
