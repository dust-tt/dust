import { isValidConversationsRetentionDays } from "@app/lib/data_retention";
import { describe, expect, it } from "vitest";

describe("data_retention", () => {
  describe("isValidConversationsRetentionDays", () => {
    it("should reject values below the minimum retention", () => {
      expect(isValidConversationsRetentionDays(59)).toBe(false);
    });

    it("should accept values at the minimum retention", () => {
      expect(isValidConversationsRetentionDays(60)).toBe(true);
    });
  });
});
