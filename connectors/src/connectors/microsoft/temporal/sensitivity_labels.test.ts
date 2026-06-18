import {
  computeDisallowedLabels,
  shouldSyncFileBasedOnSensitivityLabels,
} from "@connectors/connectors/microsoft/temporal/file";
import { describe, expect, it } from "vitest";

describe("shouldSyncFileBasedOnSensitivityLabels", () => {
  it("allows all files when no labels are configured", () => {
    expect(
      shouldSyncFileBasedOnSensitivityLabels({
        fields: { _IpLabelId: "blocked-guid" },
        allowedLabels: [],
      })
    ).toBe(true);
  });

  it("allows a file whose label is in the allowed list", () => {
    expect(
      shouldSyncFileBasedOnSensitivityLabels({
        fields: { _IpLabelId: "allowed-guid" },
        allowedLabels: ["allowed-guid", "other-guid"],
      })
    ).toBe(true);
  });

  it("blocks a file whose label is not in the allowed list", () => {
    expect(
      shouldSyncFileBasedOnSensitivityLabels({
        fields: { _IpLabelId: "blocked-guid" },
        allowedLabels: ["allowed-guid"],
      })
    ).toBe(false);
  });

  it("allows an unlabeled file even when the allowed list is non-empty", () => {
    expect(
      shouldSyncFileBasedOnSensitivityLabels({
        fields: {},
        allowedLabels: ["some-guid"],
      })
    ).toBe(true);
  });

  it("allows a file whose label was removed (null/undefined/empty fields)", () => {
    // The label-removed → unlabeled → re-include case driving the now-allowed pass.
    for (const fields of [null, undefined, { _IpLabelId: "" }]) {
      expect(
        shouldSyncFileBasedOnSensitivityLabels({
          fields,
          allowedLabels: ["some-guid"],
        })
      ).toBe(true);
    }
  });
});

// The set driving the now-excluded Search pass: tenant labels minus allowed.
describe("computeDisallowedLabels", () => {
  it("returns tenant labels not in the allowed set", () => {
    expect(
      computeDisallowedLabels({
        tenantLabels: ["guid-a", "guid-b", "guid-c"],
        allowedLabels: ["guid-a"],
      })
    ).toEqual(["guid-b", "guid-c"]);
  });

  it("returns empty when every tenant label is allowed", () => {
    expect(
      computeDisallowedLabels({
        tenantLabels: ["guid-a", "guid-b"],
        allowedLabels: ["guid-a", "guid-b"],
      })
    ).toEqual([]);
  });

  it("returns empty when filtering is disabled (no allowed labels)", () => {
    // With filtering off we must not exclude anything, even if the tenant has labels.
    expect(
      computeDisallowedLabels({
        tenantLabels: ["guid-a", "guid-b"],
        allowedLabels: [],
      })
    ).toEqual([]);
  });
});
