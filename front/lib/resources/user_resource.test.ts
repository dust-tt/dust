import { beforeEach, describe, expect, it } from "vitest";

import type { UserResource } from "@app/lib/resources/user_resource";
import { UserFactory } from "@app/tests/utils/UserFactory";

describe("UserResource", () => {
  let user: UserResource;

  beforeEach(async () => {
    user = await UserFactory.basic();
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
});
