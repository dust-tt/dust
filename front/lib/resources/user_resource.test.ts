import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("UserResource", () => {
  let user: UserResource;
  let workspace: WorkspaceType;
  let auth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    user = await UserFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  describe("getMetadataAsArray", () => {
    it("should return empty array when metadata does not exist", async () => {
      const result = await user.getMetadataAsArray("nonexistent-key");
      expect(result).toEqual([]);
    });

    it("should return array with single value when metadata contains one item", async () => {
      const key = "test-key";
      const value = "single-value";

      await user.setMetadata(key, value);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual([value]);
    });

    it("should return array with multiple values when metadata contains comma-separated items", async () => {
      const key = "test-key";
      const values = ["value1", "value2", "value3"];
      const commaSeparatedValue = values.join(",");

      await user.setMetadata(key, commaSeparatedValue);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual(values);
    });

    it("should handle empty string values in array", async () => {
      const key = "test-key";
      const values = ["value1", "", "value3"];
      const commaSeparatedValue = values.join(",");

      await user.setMetadata(key, commaSeparatedValue);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual(values);
    });

    it("should handle values with spaces", async () => {
      const key = "test-key";
      const values = ["value with spaces", "another value", "third"];
      const commaSeparatedValue = values.join(",");

      await user.setMetadata(key, commaSeparatedValue);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual(values);
    });

    it("should handle single empty string", async () => {
      const key = "test-key";
      const value = "";

      await user.setMetadata(key, value);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual([""]);
    });
  });

  describe("upsertMetadataArray", () => {
    it("should create new metadata when key does not exist", async () => {
      const key = "new-key";
      const value = "first-value";

      await user.upsertMetadataArray(key, value);

      const metadata = await user.getMetadata(key);
      expect(metadata).toBeTruthy();
      expect(metadata!.value).toBe(value);
      expect(metadata!.key).toBe(key);
      expect(metadata!.userId).toBe(user.id);
    });

    it("should add value to existing metadata array", async () => {
      const key = "existing-key";
      const initialValue = "initial-value";
      const newValue = "new-value";

      // Create initial metadata
      await user.setMetadata(key, initialValue);

      // Add new value
      await user.upsertMetadataArray(key, newValue);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual([initialValue, newValue]);
    });

    it("should not add duplicate values", async () => {
      const key = "duplicate-key";
      const value = "duplicate-value";

      // Add value twice
      await user.upsertMetadataArray(key, value);
      await user.upsertMetadataArray(key, value);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual([value]);
    });

    it("should handle adding to existing comma-separated values", async () => {
      const key = "multi-key";
      const initialValues = ["value1", "value2"];
      const newValue = "value3";

      // Set initial comma-separated values
      await user.setMetadata(key, initialValues.join(","));

      // Add new value
      await user.upsertMetadataArray(key, newValue);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual([...initialValues, newValue]);
    });

    it("should not add duplicate to existing comma-separated values", async () => {
      const key = "multi-duplicate-key";
      const initialValues = ["value1", "value2", "value3"];
      const duplicateValue = "value2";

      // Set initial comma-separated values
      await user.setMetadata(key, initialValues.join(","));

      // Try to add duplicate value
      await user.upsertMetadataArray(key, duplicateValue);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual(initialValues);
    });

    it("should handle empty string values", async () => {
      const key = "empty-key";
      const emptyValue = "";

      await user.upsertMetadataArray(key, emptyValue);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual([emptyValue]);
    });

    it("should handle values with commas by preserving them", async () => {
      const key = "comma-key";
      const valueWithComma = "value,with,commas";

      await user.upsertMetadataArray(key, valueWithComma);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual([valueWithComma]);
    });

    it("should handle adding empty string to existing values", async () => {
      const key = "mixed-key";
      const initialValue = "initial";
      const emptyValue = "";

      await user.setMetadata(key, initialValue);
      await user.upsertMetadataArray(key, emptyValue);

      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual([initialValue, emptyValue]);
    });
  });

  describe("integration tests", () => {
    it("should work correctly with multiple operations on same key", async () => {
      const key = "integration-key";
      const values = ["first", "second", "third"];

      // Add values one by one
      for (const value of values) {
        await user.upsertMetadataArray(key, value);
      }

      // Verify all values are present
      const result = await user.getMetadataAsArray(key);
      expect(result).toEqual(values);

      // Try adding duplicate
      await user.upsertMetadataArray(key, values[1]);

      // Should still have same values (no duplicate)
      const resultAfterDuplicate = await user.getMetadataAsArray(key);
      expect(resultAfterDuplicate).toEqual(values);

      // Add new value
      const newValue = "fourth";
      await user.upsertMetadataArray(key, newValue);

      const finalResult = await user.getMetadataAsArray(key);
      expect(finalResult).toEqual([...values, newValue]);
    });

    it("should handle multiple different keys independently", async () => {
      const key1 = "key1";
      const key2 = "key2";
      const values1 = ["a", "b"];
      const values2 = ["x", "y", "z"];

      // Add values to different keys
      for (const value of values1) {
        await user.upsertMetadataArray(key1, value);
      }

      for (const value of values2) {
        await user.upsertMetadataArray(key2, value);
      }

      // Verify keys are independent
      const result1 = await user.getMetadataAsArray(key1);
      const result2 = await user.getMetadataAsArray(key2);

      expect(result1).toEqual(values1);
      expect(result2).toEqual(values2);
    });
  });

  describe("basic metadata operations", () => {
    describe("setMetadata and getMetadata", () => {
      it("should create new metadata", async () => {
        const key = "test-key";
        const value = "test-value";

        await user.setMetadata(key, value);

        const metadata = await user.getMetadata(key);
        expect(metadata).not.toBeNull();
        expect(metadata!.key).toBe(key);
        expect(metadata!.value).toBe(value);
        expect(metadata!.userId).toBe(user.id);
      });

      it("should update existing metadata", async () => {
        const key = "update-key";
        const initialValue = "initial";
        const updatedValue = "updated";

        await user.setMetadata(key, initialValue);
        await user.setMetadata(key, updatedValue);

        const metadata = await user.getMetadata(key);
        expect(metadata!.value).toBe(updatedValue);
      });

      it("should return null for non-existent key", async () => {
        const metadata = await user.getMetadata("non-existent-key");
        expect(metadata).toBeNull();
      });
    });

    describe("deleteMetadata", () => {
      it("should delete metadata by key", async () => {
        const key = "delete-key";
        await user.setMetadata(key, "value");

        await user.deleteMetadata({ key });

        const metadata = await user.getMetadata(key);
        expect(metadata).toBeNull();
      });

      it("should not affect other keys when deleting", async () => {
        const key1 = "key-to-delete";
        const key2 = "key-to-keep";

        await user.setMetadata(key1, "value1");
        await user.setMetadata(key2, "value2");

        await user.deleteMetadata({ key: key1 });

        expect(await user.getMetadata(key1)).toBeNull();
        expect(await user.getMetadata(key2)).not.toBeNull();
      });
    });

    describe("deleteAllMetadata", () => {
      it("should delete all metadata for user", async () => {
        await user.setMetadata("key1", "value1");
        await user.setMetadata("key2", "value2");
        await user.setMetadata("key3", "value3");

        await user.deleteAllMetadata(auth);

        expect(await user.getMetadata("key1")).toBeNull();
        expect(await user.getMetadata("key2")).toBeNull();
        expect(await user.getMetadata("key3")).toBeNull();
      });
    });
  });

  describe("tool approvals", () => {
    let workspace: WorkspaceType;
    let auth: Authenticator;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });
      auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    });

    describe("createToolApproval and hasApprovedTool", () => {
      it("should create low-stake tool approval", async () => {
        const mcpServerId = "server-123";
        const toolName = "test-tool";

        await user.createToolApproval(auth, { mcpServerId, toolName });

        const hasApproval = await user.hasApprovedTool(auth, {
          mcpServerId,
          toolName,
        });
        expect(hasApproval).toBe(true);
      });

      it("should return false for non-existent approval", async () => {
        const hasApproval = await user.hasApprovedTool(auth, {
          mcpServerId: "unknown-server",
          toolName: "unknown-tool",
        });
        expect(hasApproval).toBe(false);
      });

      it("should create medium-stake tool approval with agentId", async () => {
        const mcpServerId = "server-456";
        const toolName = "agent-tool";
        const agentId = "agent-123";

        await user.createToolApproval(auth, {
          mcpServerId,
          toolName,
          agentId,
        });

        const hasApproval = await user.hasApprovedTool(auth, {
          mcpServerId,
          toolName,
          agentId,
        });
        expect(hasApproval).toBe(true);
      });

      it("should differentiate approvals by agentId", async () => {
        const mcpServerId = "server-789";
        const toolName = "scoped-tool";

        await user.createToolApproval(auth, {
          mcpServerId,
          toolName,
          agentId: "agent-a",
        });

        const hasApprovalA = await user.hasApprovedTool(auth, {
          mcpServerId,
          toolName,
          agentId: "agent-a",
        });
        const hasApprovalB = await user.hasApprovedTool(auth, {
          mcpServerId,
          toolName,
          agentId: "agent-b",
        });

        expect(hasApprovalA).toBe(true);
        expect(hasApprovalB).toBe(false);
      });

      it("should create approval with argsAndValues", async () => {
        const mcpServerId = "server-args";
        const toolName = "args-tool";
        const argsAndValues = { param1: "value1", param2: "value2" };

        await user.createToolApproval(auth, {
          mcpServerId,
          toolName,
          argsAndValues,
        });

        const hasApproval = await user.hasApprovedTool(auth, {
          mcpServerId,
          toolName,
          argsAndValues,
        });
        expect(hasApproval).toBe(true);
      });

      it("should sort argsAndValues keys for consistent matching", async () => {
        const mcpServerId = "server-sort";
        const toolName = "sort-tool";

        // Create with keys in one order
        await user.createToolApproval(auth, {
          mcpServerId,
          toolName,
          argsAndValues: { z: "1", a: "2" },
        });

        // Check with keys in different order
        const hasApproval = await user.hasApprovedTool(auth, {
          mcpServerId,
          toolName,
          argsAndValues: { a: "2", z: "1" },
        });
        expect(hasApproval).toBe(true);
      });

      it("should not create duplicate approvals", async () => {
        const mcpServerId = "server-dup";
        const toolName = "dup-tool";

        await user.createToolApproval(auth, { mcpServerId, toolName });
        await user.createToolApproval(auth, { mcpServerId, toolName });

        const hasApproval = await user.hasApprovedTool(auth, {
          mcpServerId,
          toolName,
        });
        expect(hasApproval).toBe(true);
      });
    });
  });
});
