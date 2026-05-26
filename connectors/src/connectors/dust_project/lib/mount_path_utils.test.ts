import { PROJECT_CONTEXT_FOLDER_ID } from "@connectors/connectors/dust_project/lib/constants";
import {
  buildMountDirectoryParents,
  getMountDirectoryParentPrefixes,
  getMountDirectoryPrefixes,
  getMountDirInternalId,
  inferMountFileParents,
  parseProjectScopedPath,
} from "@connectors/connectors/dust_project/lib/mount_path_utils";
import { describe, expect, it } from "vitest";

const PROJECT_ID = "spc_test123";

describe("parseProjectScopedPath", () => {
  it("strips the project scope prefix", () => {
    expect(parseProjectScopedPath("project/reports/q1/summary.pdf")).toBe(
      "reports/q1/summary.pdf"
    );
  });

  it("returns null for non-project paths", () => {
    expect(parseProjectScopedPath("conversation/file.pdf")).toBeNull();
  });
});

describe("getMountDirInternalId", () => {
  it("generates a stable id for the same input", () => {
    const id1 = getMountDirInternalId(PROJECT_ID, "reports/q1");
    const id2 = getMountDirInternalId(PROJECT_ID, "reports/q1");
    expect(id1).toBe(id2);
    expect(id1.startsWith("dpd_")).toBe(true);
  });

  it("returns different ids for different paths", () => {
    const id1 = getMountDirInternalId(PROJECT_ID, "reports");
    const id2 = getMountDirInternalId(PROJECT_ID, "reports/q1");
    expect(id1).not.toBe(id2);
  });
});

describe("buildMountDirectoryParents", () => {
  it("returns the context folder for root-level files", () => {
    expect(buildMountDirectoryParents(PROJECT_ID, "summary.pdf")).toEqual({
      parentInternalId: PROJECT_CONTEXT_FOLDER_ID,
      parents: [PROJECT_CONTEXT_FOLDER_ID],
    });
  });

  it("builds nested directory parents for nested files", () => {
    const { parentInternalId, parents } = buildMountDirectoryParents(
      PROJECT_ID,
      "reports/q1/summary.pdf"
    );

    expect(parentInternalId).toBe(
      getMountDirInternalId(PROJECT_ID, "reports/q1")
    );
    expect(parents).toEqual([
      getMountDirInternalId(PROJECT_ID, "reports/q1"),
      getMountDirInternalId(PROJECT_ID, "reports"),
      PROJECT_CONTEXT_FOLDER_ID,
    ]);
  });

  it("builds parents for nested directories", () => {
    const { parentInternalId, parents } = buildMountDirectoryParents(
      PROJECT_ID,
      "reports/q1"
    );

    expect(parentInternalId).toBe(getMountDirInternalId(PROJECT_ID, "reports"));
    expect(parents).toEqual([
      getMountDirInternalId(PROJECT_ID, "reports"),
      PROJECT_CONTEXT_FOLDER_ID,
    ]);
  });
});

describe("inferMountFileParents", () => {
  it("includes the document id first in the parent chain", () => {
    const documentId = "fil_abc";
    const { parents } = inferMountFileParents({
      projectId: PROJECT_ID,
      pathWithinMount: "reports/q1/summary.pdf",
      documentId,
    });

    expect(parents[0]).toBe(documentId);
    expect(parents.at(-1)).toBe(PROJECT_CONTEXT_FOLDER_ID);
  });
});

describe("directory prefix helpers", () => {
  it("returns directory prefixes for nested files", () => {
    expect(getMountDirectoryPrefixes("reports/q1/summary.pdf")).toEqual([
      "reports",
      "reports/q1",
    ]);
  });

  it("returns parent prefixes for nested directories", () => {
    expect(getMountDirectoryParentPrefixes("reports/q1")).toEqual(["reports"]);
  });
});
