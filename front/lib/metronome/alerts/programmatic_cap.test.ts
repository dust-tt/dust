import { isProgrammaticCapAlertUniquenessKeyAnyWorkspace } from "@app/lib/metronome/alerts/programmatic_cap";
import { describe, expect, it } from "vitest";

describe("isProgrammaticCapAlertUniquenessKeyAnyWorkspace", () => {
  it("matches all four programmatic-cap variants regardless of workspace", () => {
    for (const key of [
      "programmatic-cap-any_wks",
      "programmatic-cap-warning-any_wks",
      "programmatic-cap-low-any_wks",
      "programmatic-cap-critical-any_wks",
    ]) {
      expect(isProgrammaticCapAlertUniquenessKeyAnyWorkspace(key)).toBe(true);
    }
  });

  it("does not match unrelated alert keys", () => {
    for (const key of [
      "per-user-cap-any_wks-usr_123",
      "workspace-balance-threshold-any_wks",
      "payg-cap-any_wks",
      "default-low-contract-credit-and-commit-balance-zero-awu-pooled",
    ]) {
      expect(isProgrammaticCapAlertUniquenessKeyAnyWorkspace(key)).toBe(false);
    }
  });
});
