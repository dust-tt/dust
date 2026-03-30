import { describe, expect, it } from "vitest";

import { getCodeDirInternalId, getCodeFileInternalId } from "./utils";

describe("getCodeDirInternalId", () => {
  // These expected values are computed with sha256 and serve as regression
  // tests. If the hash function is replaced, these tests will fail, signaling
  // that all persisted directory IDs would become inconsistent with the data
  // stored in the database.

  it("generates a stable id for a nested directory path", () => {
    expect(getCodeDirInternalId(12345678, "src/lib")).toBe(
      "github-code-12345678-dir-c1be78f82e917860"
    );
  });

  it("generates a stable id for a top-level directory", () => {
    expect(getCodeDirInternalId(12345678, "src")).toBe(
      "github-code-12345678-dir-bbf5fe09dd6c616c"
    );
  });

  it("includes the repo id in the result", () => {
    const id = getCodeDirInternalId(99999, "src");
    expect(id.startsWith("github-code-99999-dir-")).toBe(true);
  });

  it("returns different ids for different repo ids", () => {
    const id1 = getCodeDirInternalId(111, "src");
    const id2 = getCodeDirInternalId(222, "src");
    expect(id1).not.toBe(id2);
  });

  it("returns different ids for different paths", () => {
    const id1 = getCodeDirInternalId(12345678, "src/a");
    const id2 = getCodeDirInternalId(12345678, "src/b");
    expect(id1).not.toBe(id2);
  });

  it("returns the same id for the same input on repeated calls", () => {
    const id1 = getCodeDirInternalId(12345678, "src/lib");
    const id2 = getCodeDirInternalId(12345678, "src/lib");
    expect(id1).toBe(id2);
  });
});

describe("getCodeFileInternalId", () => {
  // These expected values are computed with sha256 and serve as regression
  // tests. If the hash function is replaced, these tests will fail, signaling
  // that all persisted file IDs would become inconsistent with the data stored
  // in the database.

  it("generates a stable id for a nested file path", () => {
    expect(getCodeFileInternalId(12345678, "src/index.ts")).toBe(
      "github-code-12345678-file-1ef397b50b4c8a4c"
    );
  });

  it("generates a stable id for a root-level file", () => {
    expect(getCodeFileInternalId(12345678, "README.md")).toBe(
      "github-code-12345678-file-34b2cc935e7f9daf"
    );
  });

  it("includes the repo id in the result", () => {
    const id = getCodeFileInternalId(99999, "src/index.ts");
    expect(id.startsWith("github-code-99999-file-")).toBe(true);
  });

  it("returns different ids for different file paths", () => {
    const id1 = getCodeFileInternalId(12345678, "src/a.ts");
    const id2 = getCodeFileInternalId(12345678, "src/b.ts");
    expect(id1).not.toBe(id2);
  });

  it("returns different ids for different repo ids", () => {
    const id1 = getCodeFileInternalId(111, "src/index.ts");
    const id2 = getCodeFileInternalId(222, "src/index.ts");
    expect(id1).not.toBe(id2);
  });

  it("returns the same id for the same input on repeated calls", () => {
    const id1 = getCodeFileInternalId(12345678, "src/index.ts");
    const id2 = getCodeFileInternalId(12345678, "src/index.ts");
    expect(id1).toBe(id2);
  });
});
