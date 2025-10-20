import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MCPServerViewType } from "@app/lib/api/mcp";

import { getDefaultConfiguration } from "./formDefaults";

vi.mock("@app/lib/actions/mcp_internal_actions/input_configuration", () => ({
  getMCPServerRequirements: vi.fn(),
}));

import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";

const mockGetMCPServerRequirements = vi.mocked(getMCPServerRequirements);

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

    describe("boolean configurations", () => {
      it("should set boolean configurations to false by default", () => {
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [],
          requiredBooleans: [
            {
              key: "is_enabled",
              description: "Whether the feature is enabled",
              default: null,
            },
            {
              key: "admin_mode",
              description: "Admin mode setting",
              default: null,
            },
            {
              key: "nested.deep.flag",
              description: "A deeply nested boolean",
              default: null,
            },
          ],
          requiredEnums: {},
          requiredLists: {},
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [],
          requiredBooleans: [
            {
              key: "feature_enabled",
              description: "Feature enabled",
              default: true,
            },
            {
              key: "debug_mode",
              description: "Debug mode",
              default: false,
            },
            {
              key: "auto_save",
              description: "Auto save",
              default: null,
            },
          ],
          requiredEnums: {},
          requiredLists: {},
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          feature_enabled: true, // explicit default
          debug_mode: false, // explicit default
          auto_save: false, // fallback default
        });
      });

      it("should handle empty boolean configurations", () => {
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [],
          requiredBooleans: [],
          requiredEnums: {},
          requiredLists: {},
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({});
      });
    });

    describe("enum configurations", () => {
      it("should set enum configurations to the first option", () => {
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [],
          requiredBooleans: [],
          requiredEnums: {
            priority: {
              options: [
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ],
              description: "Priority level",
              default: null,
            },
            category: {
              options: [
                { value: "A", label: "Option A" },
                { value: "B", label: "Option B" },
                { value: "C", label: "Option C" },
              ],
              description: "Category selection",
              default: null,
            },
            "nested.enum": {
              options: [
                { value: "option1", label: "Option 1" },
                { value: "option2", label: "Option 2" },
              ],
              description: "Nested enum",
              default: null,
            },
          },
          requiredLists: {},
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [],
          requiredBooleans: [],
          requiredEnums: {
            valid_enum: {
              options: [
                { value: "option1", label: "Option 1" },
                { value: "option2", label: "Option 2" },
              ],
              description: "Valid enum",
              default: null,
            },
            empty_enum: {
              options: [],
              description: "Empty enum",
              default: null,
            },
          },
          requiredLists: {},
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
        });

        const result = getDefaultConfiguration(mockMCPServerView);

        expect(result.additionalConfiguration).toEqual({
          valid_enum: "option1",
          // empty_enum should not be present
        });
      });

      it("should use explicit enum defaults when available", () => {
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [],
          requiredBooleans: [],
          requiredEnums: {
            priority: {
              options: [
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ],
              description: "Priority level",
              default: "medium", // explicit default
            },
            status: {
              options: [
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
                { value: "archived", label: "Archived" },
              ],
              description: "Status",
              default: null,
            },
          },
          requiredLists: {},
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [],
          requiredBooleans: [],
          requiredEnums: {},
          requiredLists: {
            tags: {
              options: [
                { value: "tag1", label: "Tag 1" },
                { value: "tag2", label: "Tag 2" },
              ],
              description: "Available tags",
              default: null,
            },
            categories: {
              options: [
                { value: "cat1", label: "Category 1" },
                { value: "cat2", label: "Category 2" },
              ],
              description: "Available categories",
              default: null,
            },
            "nested.lists": {
              options: [{ value: "item1", label: "Item 1" }],
              description: "Nested list",
              default: null,
            },
          },
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [
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
            {
              key: "user_name",
              description: "User Name",
              default: null,
            },
          ],
          requiredNumbers: [],
          requiredBooleans: [],
          requiredEnums: {},
          requiredLists: {},
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [
            { key: "timeout", description: "Timeout in seconds", default: 30 },
            { key: "max_retries", description: "Maximum retries", default: 3 },
            { key: "port", description: "Port number", default: null },
          ],
          requiredBooleans: [],
          requiredEnums: {},
          requiredLists: {},
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [
            { key: "api_key", description: "API Key", default: "secret-key" },
          ],
          requiredNumbers: [
            { key: "timeout", description: "Timeout", default: 30 },
          ],
          requiredBooleans: [
            { key: "is_enabled", description: "Enabled", default: null },
          ],
          requiredEnums: {
            priority: {
              options: [
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ],
              description: "Priority",
              default: null,
            },
          },
          requiredLists: {
            tags: {
              options: [{ value: "tag1", label: "Tag 1" }],
              description: "Tags",
              default: null,
            },
          },
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [
            {
              key: "api.key",
              description: "API Key",
              default: "dev-key-123",
            },
            {
              key: "api.endpoint",
              description: "API Endpoint",
              default: null,
            },
            {
              key: "database.connection.string",
              description: "DB Connection",
              default: "mongodb://localhost:27017",
            },
          ],
          requiredNumbers: [
            {
              key: "api.timeout",
              description: "API Timeout",
              default: 5000,
            },
            {
              key: "database.pool.max",
              description: "Max Pool Size",
              default: null,
            },
            {
              key: "server.port",
              description: "Server Port",
              default: 3000,
            },
          ],
          requiredBooleans: [
            {
              key: "features.auth.enabled",
              description: "Auth enabled",
              default: true,
            },
            {
              key: "features.logging.debug",
              description: "Debug logging",
              default: null,
            },
          ],
          requiredEnums: {
            "logging.level": {
              options: [
                { value: "debug", label: "Debug" },
                { value: "info", label: "Info" },
                { value: "warn", label: "Warn" },
                { value: "error", label: "Error" },
              ],
              description: "Logging level",
              default: "info",
            },
            environment: {
              options: [
                { value: "development", label: "Development" },
                { value: "staging", label: "Staging" },
                { value: "production", label: "Production" },
              ],
              description: "Environment",
              default: null,
            },
          },
          requiredLists: {
            "features.experimental": {
              options: [
                { value: "feature1", label: "Feature 1" },
                { value: "feature2", label: "Feature 2" },
              ],
              description: "Experimental features",
              default: "feature1",
            },
            "allowed.origins": {
              options: [
                { value: "localhost", label: "Localhost" },
                { value: "example.com", label: "Example" },
              ],
              description: "Allowed origins",
              default: null,
            },
          },
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
        mockGetMCPServerRequirements.mockReturnValue({
          requiresDataSourceConfiguration: false,
          requiresDataWarehouseConfiguration: false,
          requiresTableConfiguration: false,
          requiresChildAgentConfiguration: false,
          requiresReasoningConfiguration: false,
          mayRequireTimeFrameConfiguration: false,
          mayRequireJsonSchemaConfiguration: false,
          requiredStrings: [],
          requiredNumbers: [],
          requiredBooleans: [
            {
              key: "level1.level2.level3.deep_flag",
              description: "Deep flag",
              default: null,
            },
          ],
          requiredEnums: {
            "a.b.c.d.enum": {
              options: [
                { value: "x", label: "X" },
                { value: "y", label: "Y" },
              ],
              description: "Deeply nested enum",
              default: null,
            },
          },
          requiredLists: {
            "config.advanced.options": {
              options: [{ value: "opt1", label: "Option 1" }],
              description: "Advanced options",
              default: null,
            },
          },
          requiresDustAppConfiguration: false,
          requiresSecretConfiguration: false,
          noRequirement: true,
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
});
