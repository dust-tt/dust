import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { beforeEach, describe, expect, it } from "vitest";

import type { PlatformMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types";

import { generateConfiguredInput } from "./input_schemas";

// Mock the action configuration
const mockActionConfiguration: PlatformMCPToolConfigurationType = {
  id: 1,
  sId: "action123",
  type: "mcp_configuration",
  name: "Test Action",
  description: "Test Description",
  inputSchema: {},
  mcpServerViewId: "server123",
  dataSources: [],
  tables: [],
  childAgentId: null,
  isDefault: false,
  additionalConfiguration: {
    stringKey: "string value",
    numberKey: 42,
    booleanKey: true,
  },
};

describe("Input Schemas", () => {
  let mockWorkspace: WorkspaceType;

  beforeEach(async () => {
    mockWorkspace = await WorkspaceFactory.basic();
  });
  describe("generateConfiguredInput", () => {
    it("should return the correct string value from additionalConfiguration", async () => {
      const result = generateConfiguredInput({
        owner: mockWorkspace,
        actionConfiguration: mockActionConfiguration,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.STRING,
        keyPath: ["parent", "child", "stringKey"],
      });

      expect(result).toBe("string value");
    });

    it("should return the correct number value from additionalConfiguration", async () => {
      const result = generateConfiguredInput({
        owner: mockWorkspace,
        actionConfiguration: mockActionConfiguration,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.NUMBER,
        keyPath: ["parent", "child", "numberKey"],
      });

      expect(result).toBe(42);
    });

    it("should return the correct boolean value from additionalConfiguration", async () => {
      const result = generateConfiguredInput({
        owner: mockWorkspace,
        actionConfiguration: mockActionConfiguration,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN,
        keyPath: ["parent", "child", "booleanKey"],
      });

      expect(result).toBe(true);
    });

    it("should return default values for null values in additionalConfiguration", async () => {
      const stringResult = generateConfiguredInput({
        owner: mockWorkspace,
        actionConfiguration: mockActionConfiguration,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.STRING,
        keyPath: ["parent", "child"],
      });

      expect(stringResult).toBe("");

      const numberResult = generateConfiguredInput({
        owner: mockWorkspace,
        actionConfiguration: mockActionConfiguration,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.NUMBER,
        keyPath: ["parent", "child"],
      });

      expect(numberResult).toBe(0);

      const booleanResult = generateConfiguredInput({
        owner: mockWorkspace,
        actionConfiguration: mockActionConfiguration,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN,
        keyPath: ["parent", "child"],
      });

      expect(booleanResult).toBe(false);
    });

    it("should throw an error for missing key path", async () => {
      expect(() =>
        generateConfiguredInput({
          owner: mockWorkspace,
          actionConfiguration: mockActionConfiguration,
          mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.STRING,
          keyPath: [],
        })
      ).toThrow("Key path is required for STRING configuration");
    });

    it("should throw an error for incorrect value type", async () => {
      const wrongActionConfig = {
        ...mockActionConfiguration,
        additionalConfiguration: {
          ...mockActionConfiguration.additionalConfiguration,
          stringKey: 123, // Wrong type, should be string
        },
      };

      expect(() =>
        generateConfiguredInput({
          owner: mockWorkspace,
          actionConfiguration:
            wrongActionConfig as PlatformMCPToolConfigurationType,
          mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.STRING,
          keyPath: ["parent", "child", "stringKey"],
        })
      ).toThrow("Expected string value for key stringKey, got number");
    });
  });
});
