import {
  getWorkspaceUsageRetentionErrorMessage,
  getWorkspaceUsageRetentionStartDate,
} from "@app/lib/workspace_usage_retention";
import { describe, expect, it } from "vitest";

describe("workspace_usage_retention", () => {
  describe("getWorkspaceUsageRetentionStartDate", () => {
    it("should compute the first supported day from the retention period", () => {
      const retentionStartDate = getWorkspaceUsageRetentionStartDate({
        now: new Date(2026, 2, 18, 12, 0, 0),
        retentionDays: 60,
      });

      expect(retentionStartDate).toEqual(new Date(2026, 0, 18, 0, 0, 0, 0));
    });
  });

  describe("getWorkspaceUsageRetentionErrorMessage", () => {
    it("should return null when the workspace has no conversation retention", () => {
      const errorMessage = getWorkspaceUsageRetentionErrorMessage({
        startDate: new Date(2026, 0, 1, 0, 0, 0),
        retentionDays: null,
        now: new Date(2026, 2, 18, 12, 0, 0),
      });

      expect(errorMessage).toBeNull();
    });

    it("should return null when the requested period is within retention", () => {
      const errorMessage = getWorkspaceUsageRetentionErrorMessage({
        startDate: new Date(2026, 0, 18, 0, 0, 0),
        retentionDays: 60,
        now: new Date(2026, 2, 18, 12, 0, 0),
      });

      expect(errorMessage).toBeNull();
    });

    it("should return an explicit error when the requested period is older than retention", () => {
      const errorMessage = getWorkspaceUsageRetentionErrorMessage({
        startDate: new Date(2026, 0, 1, 0, 0, 0),
        retentionDays: 60,
        now: new Date(2026, 2, 18, 12, 0, 0),
      });

      expect(errorMessage).toBe(
        "This workspace has a 60-day conversation retention policy. " +
          "Detailed activity reports and the related usage API rely on live " +
          "conversation data and would be incomplete for periods starting before 2026-01-18."
      );
    });
  });
});
