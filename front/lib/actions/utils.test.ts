import { beforeEach, describe, expect, it } from "vitest";

import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/mcp_actions";
import type { UserResource } from "@app/lib/resources/user_resource";
import { UserFactory } from "@app/tests/utils/UserFactory";

import { hasUserAlwaysApprovedTool, setUserAlwaysApprovedTool } from "./utils";

describe("Tool validation utilities", () => {
  let user: UserResource;

  beforeEach(async () => {
    user = await UserFactory.basic();
  });

  describe("setUserAlwaysApprovedTool", () => {
    it("should store tool approval in user metadata", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = `test-server${TOOL_NAME_SEPARATOR}test-tool`;

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      // Verify the metadata was stored correctly
      const metadata = await user.getMetadata(
        `toolsValidations:${mcpServerId}`
      );
      expect(metadata).toBeTruthy();
      expect(metadata!.value).toBe(functionCallName);
    });

    it("should handle multiple tool approvals for same server", async () => {
      const mcpServerId = "ims_1234";
      const mcpServerName = "multi-tool-server";
      const functionCallName1 = `${mcpServerName}${TOOL_NAME_SEPARATOR}tool-1`;
      const functionCallName2 = `${mcpServerName}${TOOL_NAME_SEPARATOR}tool-2`;

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: functionCallName1,
      });

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: functionCallName2,
      });

      const tools = await user.getMetadataAsArray(
        `toolsValidations:${mcpServerId}`
      );
      expect(tools).toContain(functionCallName1);
      expect(tools).toContain(functionCallName2);
      expect(tools).toHaveLength(2);
    });

    it("should not duplicate tool approvals", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = `duplicate-server${TOOL_NAME_SEPARATOR}duplicate-tool`;

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      const tools = await user.getMetadataAsArray(
        `toolsValidations:${mcpServerId}`
      );
      expect(tools).toEqual([functionCallName]);
    });

    it("should handle special characters in server ID and tool name", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = `server-with@special#chars${TOOL_NAME_SEPARATOR}tool-with@special#chars`;

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      const metadata = await user.getMetadata(
        `toolsValidations:${mcpServerId}`
      );
      expect(metadata).toBeTruthy();
      expect(metadata!.value).toBe(functionCallName);
    });

    it("should throw error if mcpServerId is empty", async () => {
      const mcpServerId = "";
      const functionCallName = "test-function";

      await expect(
        setUserAlwaysApprovedTool({
          user,
          mcpServerId,
          functionCallName,
        })
      ).rejects.toThrow("mcpServerId is required");
    });

    it("should throw error if functionCallName is empty", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = "";

      await expect(
        setUserAlwaysApprovedTool({
          user,
          mcpServerId,
          functionCallName,
        })
      ).rejects.toThrow("functionCallName is required");
    });
  });

  describe("hasUserAlwaysApprovedTool", () => {
    it("should return true when function call name is found in metadata", async () => {
      const mcpServerId = "test-server";
      const functionCallName = "test-function";

      // First add some tools to metadata
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "other-tool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "another-tool",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      expect(result).toBe(true);
    });

    it("should return true when wildcard is found in metadata", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = `test-server${TOOL_NAME_SEPARATOR}test-tool`;

      // Add wildcard approval
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "*",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      expect(result).toBe(true);
    });

    it("should return false when the function call name is not found and no wildcard", async () => {
      const mcpServerId = "ims_1234";
      const mcpServerName = "test-server";
      const functionCallName = `${mcpServerName}${TOOL_NAME_SEPARATOR}test-tool`;

      // Add some other tools but not the one we're looking for
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `${mcpServerName}${TOOL_NAME_SEPARATOR}other-tool`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `${mcpServerName}${TOOL_NAME_SEPARATOR}another-tool`,
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      expect(result).toBe(false);
    });

    it("should return false when metadata is empty", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = `test-server${TOOL_NAME_SEPARATOR}test-tool`;

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      expect(result).toBe(false);
    });

    it("should handle exact name match among similar names", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = `server${TOOL_NAME_SEPARATOR}tool`;

      // Add similar tool names
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `server${TOOL_NAME_SEPARATOR}tool-prefix`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `server${TOOL_NAME_SEPARATOR}prefix-tool`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName, // Exact match
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `server${TOOL_NAME_SEPARATOR}tool-suffix`,
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      expect(result).toBe(true);
    });

    it("should return false for partial matches without exact match", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = `server${TOOL_NAME_SEPARATOR}tool`;

      // Add similar tool names but no exact match
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `server${TOOL_NAME_SEPARATOR}tool-prefix`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `server${TOOL_NAME_SEPARATOR}prefix-tool`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `server${TOOL_NAME_SEPARATOR}my-tool-name`,
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      expect(result).toBe(false);
    });

    it("should handle special characters in name lookup", async () => {
      const mcpServerId = "ims_1234";
      const functionCallName = `server${TOOL_NAME_SEPARATOR}tool-with@special#chars`;

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `server${TOOL_NAME_SEPARATOR}regular-tool`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `server${TOOL_NAME_SEPARATOR}another-tool`,
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      expect(result).toBe(true);
    });

    it("should work with different server IDs independently", async () => {
      const mcpServerId1 = "ims_server_1";
      const mcpServerId2 = "ims_server_2";
      const serverName = "shared-server";
      const functionCallName = `${serverName}${TOOL_NAME_SEPARATOR}shared-tool`;

      // Approve function call for the first server only
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId: mcpServerId1,
        functionCallName,
      });

      const result1 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId: mcpServerId1,
        functionCallName,
      });

      const result2 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId: mcpServerId2,
        functionCallName,
      });

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it("should prioritize wildcard over specific tool names", async () => {
      const mcpServerId = "ims_1234";
      const serverName = "test-server";
      const specificFunctionCallName = `${serverName}${TOOL_NAME_SEPARATOR}specific-tool`;
      const otherFunctionCallName = `${serverName}${TOOL_NAME_SEPARATOR}other-tool`;

      // Add both wildcard and specific function call
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: otherFunctionCallName,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "*",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: specificFunctionCallName,
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: specificFunctionCallName,
      });

      expect(result).toBe(true);
    });

    it("should handle case sensitivity correctly", async () => {
      const mcpServerId = "ims_case_sensitive";
      const serverName = "test-server";
      const expectedFunctionCallName = `${serverName}${TOOL_NAME_SEPARATOR}MyTool`;

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `${serverName}${TOOL_NAME_SEPARATOR}mytool`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `${serverName}${TOOL_NAME_SEPARATOR}MYTOOL`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: expectedFunctionCallName, // Exact case match
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: expectedFunctionCallName,
      });

      expect(result).toBe(true);
    });

    it("should return false for case mismatch when exact match not found", async () => {
      const mcpServerId = "ims_case_mismatch";
      const serverName = "test-server";
      const expectedFunctionCallName = `${serverName}${TOOL_NAME_SEPARATOR}MyTool`;

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `${serverName}${TOOL_NAME_SEPARATOR}mytool`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `${serverName}${TOOL_NAME_SEPARATOR}MYTOOL`,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: `${serverName}${TOOL_NAME_SEPARATOR}myTool`,
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: expectedFunctionCallName,
      });

      expect(result).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("should work correctly when setting and then checking approval", async () => {
      const mcpServerId = "ims_integration";
      const serverName = "integration-server";
      const functionCallName = `${serverName}${TOOL_NAME_SEPARATOR}integration-tool`;

      // First, set the function call as approved
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      // Then check if it's approved
      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName,
      });

      expect(result).toBe(true);
    });

    it("should handle multiple tools for the same server", async () => {
      const mcpServerId = "ims_multi_tool";
      const serverName = "multi-tool-server";
      const functionCallName1 = `${serverName}${TOOL_NAME_SEPARATOR}tool-1`;
      const functionCallName2 = `${serverName}${TOOL_NAME_SEPARATOR}tool-2`;
      const functionCallName3 = `${serverName}${TOOL_NAME_SEPARATOR}tool-3`;

      // Set multiple function calls as approved
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: functionCallName1,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: functionCallName2,
      });

      // Check each function call
      const result1 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: functionCallName1,
      });
      const result2 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: functionCallName2,
      });
      const result3 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: functionCallName3,
      });

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(false);
    });

    it("should handle complex workflow with multiple servers and tools", async () => {
      const mcpServerId1 = "ims_alpha";
      const mcpServerId2 = "ims_beta";
      const serverName1 = "server-alpha";
      const serverName2 = "server-beta";
      const toolNames = ["read-file", "write-file", "execute-command"];
      const server1FunctionCallNames = toolNames.map(
        (tool) => `${serverName1}${TOOL_NAME_SEPARATOR}${tool}`
      );
      const server2FunctionCallNames = toolNames.map(
        (tool) => `${serverName2}${TOOL_NAME_SEPARATOR}${tool}`
      );

      // Approve all function calls for the first server
      for (const functionCallName of server1FunctionCallNames) {
        await setUserAlwaysApprovedTool({
          user,
          mcpServerId: mcpServerId1,
          functionCallName,
        });
      }

      // Approve only first function call for the second server
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId: mcpServerId2,
        functionCallName: server2FunctionCallNames[0],
      });

      // Add wildcard for the second server
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId: mcpServerId2,
        functionCallName: "*",
      });

      // Test first server - all function calls should be approved individually
      for (const functionCallName of server1FunctionCallNames) {
        const result = await hasUserAlwaysApprovedTool({
          user,
          mcpServerId: mcpServerId1,
          functionCallName,
        });
        expect(result).toBe(true);
      }

      // Test second server - all function calls should be approved due to wildcard
      for (const functionCallName of server2FunctionCallNames) {
        const result = await hasUserAlwaysApprovedTool({
          user,
          mcpServerId: mcpServerId2,
          functionCallName,
        });
        expect(result).toBe(true);
      }

      // Test unknown function call on the second server - should be approved due to wildcard
      const unknownFunctionCallName = `${serverName2}${TOOL_NAME_SEPARATOR}unknown-tool`;
      const unknownResult = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId: mcpServerId2,
        functionCallName: unknownFunctionCallName,
      });
      expect(unknownResult).toBe(true);

      // Test unknown server - should be false
      const unknownServerResult = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId: "ims_unknown_server",
        functionCallName: server1FunctionCallNames[0],
      });
      expect(unknownServerResult).toBe(false);
    });

    it("should maintain data integrity across multiple operations", async () => {
      const mcpServerId = "ims_1234";
      const mcpServerName = "integrity-test-server";
      const functionCallNames = [
        `${mcpServerName}${TOOL_NAME_SEPARATOR}tool-a`,
        `${mcpServerName}${TOOL_NAME_SEPARATOR}tool-b`,
        `${mcpServerName}${TOOL_NAME_SEPARATOR}tool-c`,
      ];

      // Add tools one by one and verify each addition
      for (let i = 0; i < functionCallNames.length; i++) {
        await setUserAlwaysApprovedTool({
          user,
          mcpServerId,
          functionCallName: functionCallNames[i],
        });

        // Verify all previously added tools are still there
        for (let j = 0; j <= i; j++) {
          const result = await hasUserAlwaysApprovedTool({
            user,
            mcpServerId,
            functionCallName: functionCallNames[j],
          });
          expect(result).toBe(true);
        }

        // Verify tools not yet added are not there
        for (let k = i + 1; k < functionCallNames.length; k++) {
          const result = await hasUserAlwaysApprovedTool({
            user,
            mcpServerId,
            functionCallName: functionCallNames[k],
          });
          expect(result).toBe(false);
        }
      }

      // Try to add duplicates and verify no changes
      for (const tool of functionCallNames) {
        await setUserAlwaysApprovedTool({
          user,
          mcpServerId,
          functionCallName: tool,
        });
      }

      // All function calls should still be approved exactly once
      const allFunctionCalls = await user.getMetadataAsArray(
        `toolsValidations:${mcpServerId}`
      );
      expect(allFunctionCalls).toHaveLength(functionCallNames.length);
      for (const name of functionCallNames) {
        expect(allFunctionCalls.filter((f) => f === name)).toHaveLength(1);
      }
    });
  });
});
