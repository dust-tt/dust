import { beforeEach, describe, expect, it } from "vitest";

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
      const mcpServerId = "test-server";
      const toolName = "test-tool";

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: toolName,
      });

      // Verify the metadata was stored correctly
      const metadata = await user.getMetadata(
        `toolsValidations:${mcpServerId}`
      );
      expect(metadata).toBeTruthy();
      expect(metadata!.value).toBe(toolName);
    });

    it("should handle multiple tool approvals for same server", async () => {
      const mcpServerId = "multi-tool-server";
      const tool1 = "tool-1";
      const tool2 = "tool-2";

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: tool1,
      });

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: tool2,
      });

      const tools = await user.getMetadataAsArray(
        `toolsValidations:${mcpServerId}`
      );
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
      expect(tools).toHaveLength(2);
    });

    it("should not duplicate tool approvals", async () => {
      const mcpServerId = "duplicate-server";
      const toolName = "duplicate-tool";

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: toolName,
      });

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: toolName,
      });

      const tools = await user.getMetadataAsArray(
        `toolsValidations:${mcpServerId}`
      );
      expect(tools).toEqual([toolName]);
    });

    it("should handle special characters in server ID and tool name", async () => {
      const mcpServerId = "server-with@special#chars";
      const toolName = "tool-with@special#chars";

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: toolName,
      });

      const metadata = await user.getMetadata(
        `toolsValidations:${mcpServerId}`
      );
      expect(metadata).toBeTruthy();
      expect(metadata!.value).toBe(toolName);
    });

    it("should throw error if mcpServerId is empty", async () => {
      const mcpServerId = "";
      const toolName = "test-tool";

      await expect(
        setUserAlwaysApprovedTool({
          user,
          mcpServerId,
          functionCallName: toolName,
        })
      ).rejects.toThrow("mcpServerId is required");
    });

    it("should throw error if toolName is empty", async () => {
      const mcpServerId = "test-server";
      const toolName = "";

      await expect(
        setUserAlwaysApprovedTool({
          user,
          mcpServerId,
          functionCallName: toolName,
        })
      ).rejects.toThrow("toolName is required");
    });
  });

  describe("hasUserAlwaysApprovedTool", () => {
    it("should return true when tool name is found in metadata", async () => {
      const mcpServerId = "test-server";
      const toolName = "test-tool";

      // First add some tools to metadata
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "other-tool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: toolName,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "another-tool",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(true);
    });

    it("should return true when wildcard is found in metadata", async () => {
      const mcpServerId = "test-server";
      const toolName = "test-tool";

      // Add wildcard approval
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "*",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(true);
    });

    it("should return false when tool name is not found and no wildcard", async () => {
      const mcpServerId = "test-server";
      const toolName = "test-tool";

      // Add some other tools but not the one we're looking for
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "other-tool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "another-tool",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(false);
    });

    it("should return false when metadata is empty", async () => {
      const mcpServerId = "test-server";
      const toolName = "test-tool";

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(false);
    });

    it("should handle exact tool name match among similar names", async () => {
      const mcpServerId = "test-server";
      const toolName = "tool";

      // Add similar tool names
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "tool-prefix",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "prefix-tool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "tool", // Exact match
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "tool-suffix",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(true);
    });

    it("should return false for partial matches without exact match", async () => {
      const mcpServerId = "test-server";
      const toolName = "tool";

      // Add similar tool names but no exact match
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "tool-prefix",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "prefix-tool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "my-tool-name",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(false);
    });

    it("should handle special characters in tool name lookup", async () => {
      const mcpServerId = "test-server";
      const toolName = "tool@with#special$chars";

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "regular-tool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: toolName,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "another-tool",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(true);
    });

    it("should work with different server IDs independently", async () => {
      const server1 = "server-1";
      const server2 = "server-2";
      const toolName = "shared-tool";

      // Approve tool for server1 only
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId: server1,
        functionCallName: toolName,
      });

      const result1 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId: server1,
        toolName,
      });

      const result2 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId: server2,
        toolName,
      });

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it("should prioritize wildcard over specific tool names", async () => {
      const mcpServerId = "test-server";
      const toolName = "specific-tool";

      // Add both wildcard and specific tool
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "other-tool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "*",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: toolName,
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(true);
    });

    it("should handle case sensitivity correctly", async () => {
      const mcpServerId = "test-server";
      const toolName = "MyTool";

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "mytool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "MYTOOL",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "MyTool", // Exact case match
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(true);
    });

    it("should return false for case mismatch when exact match not found", async () => {
      const mcpServerId = "test-server";
      const toolName = "MyTool";

      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "mytool",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "MYTOOL",
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: "myTool",
      });

      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("should work correctly when setting and then checking approval", async () => {
      const mcpServerId = "integration-server";
      const toolName = "integration-tool";

      // First, set the tool as approved
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: toolName,
      });

      // Then check if it's approved
      const result = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName,
      });

      expect(result).toBe(true);
    });

    it("should handle multiple tools for the same server", async () => {
      const mcpServerId = "multi-tool-server";
      const tool1 = "tool-1";
      const tool2 = "tool-2";
      const tool3 = "tool-3";

      // Set multiple tools as approved
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: tool1,
      });
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId,
        functionCallName: tool2,
      });

      // Check each tool
      const result1 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName: tool1,
      });
      const result2 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName: tool2,
      });
      const result3 = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId,
        toolName: tool3,
      });

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(false);
    });

    it("should handle complex workflow with multiple servers and tools", async () => {
      const server1 = "server-alpha";
      const server2 = "server-beta";
      const tools = ["read-file", "write-file", "execute-command"];

      // Approve all tools for server1
      for (const tool of tools) {
        await setUserAlwaysApprovedTool({
          user,
          mcpServerId: server1,
          functionCallName: tool,
        });
      }

      // Approve only first tool for server2
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId: server2,
        functionCallName: tools[0],
      });

      // Add wildcard for server2
      await setUserAlwaysApprovedTool({
        user,
        mcpServerId: server2,
        functionCallName: "*",
      });

      // Test server1 - all tools should be approved individually
      for (const tool of tools) {
        const result = await hasUserAlwaysApprovedTool({
          user,
          mcpServerId: server1,
          toolName: tool,
        });
        expect(result).toBe(true);
      }

      // Test server2 - all tools should be approved due to wildcard
      for (const tool of tools) {
        const result = await hasUserAlwaysApprovedTool({
          user,
          mcpServerId: server2,
          toolName: tool,
        });
        expect(result).toBe(true);
      }

      // Test unknown tool on server2 - should be approved due to wildcard
      const unknownResult = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId: server2,
        toolName: "unknown-tool",
      });
      expect(unknownResult).toBe(true);

      // Test unknown server - should be false
      const unknownServerResult = await hasUserAlwaysApprovedTool({
        user,
        mcpServerId: "unknown-server",
        toolName: tools[0],
      });
      expect(unknownServerResult).toBe(false);
    });

    it("should maintain data integrity across multiple operations", async () => {
      const mcpServerId = "integrity-test-server";
      const tools = ["tool-a", "tool-b", "tool-c"];

      // Add tools one by one and verify each addition
      for (let i = 0; i < tools.length; i++) {
        await setUserAlwaysApprovedTool({
          user,
          mcpServerId,
          functionCallName: tools[i],
        });

        // Verify all previously added tools are still there
        for (let j = 0; j <= i; j++) {
          const result = await hasUserAlwaysApprovedTool({
            user,
            mcpServerId,
            toolName: tools[j],
          });
          expect(result).toBe(true);
        }

        // Verify tools not yet added are not there
        for (let k = i + 1; k < tools.length; k++) {
          const result = await hasUserAlwaysApprovedTool({
            user,
            mcpServerId,
            toolName: tools[k],
          });
          expect(result).toBe(false);
        }
      }

      // Try to add duplicates and verify no changes
      for (const tool of tools) {
        await setUserAlwaysApprovedTool({
          user,
          mcpServerId,
          functionCallName: tool,
        });
      }

      // All tools should still be approved exactly once
      const allTools = await user.getMetadataAsArray(
        `toolsValidations:${mcpServerId}`
      );
      expect(allTools).toHaveLength(tools.length);
      for (const tool of tools) {
        expect(allTools.filter((t) => t === tool)).toHaveLength(1);
      }
    });
  });
});
