import {
  ensureFileSize,
  resolveFileContentType,
  resolveMaxFileSizes,
} from "@app/types/files";
import { describe, expect, it } from "vitest";

describe("resolveMaxFileSizes", () => {
  it("raises the delimited limit only for sandbox conversations", () => {
    expect(
      resolveMaxFileSizes({
        hasSandboxTools: true,
        useCase: "conversation",
      }).delimited
    ).toBe(350 * 1024 * 1024);

    expect(
      resolveMaxFileSizes({
        hasSandboxTools: false,
        useCase: "conversation",
      }).delimited
    ).toBe(50 * 1024 * 1024);

    expect(
      resolveMaxFileSizes({
        hasSandboxTools: true,
        useCase: "upsert_table",
      }).delimited
    ).toBe(50 * 1024 * 1024);
  });

  it("enforces the resolved per-file limit", () => {
    expect(
      ensureFileSize("text/csv", 60 * 1024 * 1024, {
        hasSandboxTools: true,
        useCase: "conversation",
      })
    ).toBe(true);

    expect(
      ensureFileSize("text/csv", 60 * 1024 * 1024, {
        hasSandboxTools: true,
        useCase: "upsert_table",
      })
    ).toBe(false);
  });
});

describe("resolveFileContentType", () => {
  it("normalizes Excel files reported as octet-stream", () => {
    expect(resolveFileContentType("application/octet-stream", "data.xls")).toBe(
      "application/vnd.ms-excel"
    );
    expect(
      resolveFileContentType("application/octet-stream", "data.xlsx")
    ).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
});
