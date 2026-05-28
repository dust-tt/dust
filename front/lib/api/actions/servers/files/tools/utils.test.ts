import { isReadableAsText } from "@app/lib/api/actions/servers/files/tools/utils";
import { describe, expect, it } from "vitest";

describe("isReadableAsText", () => {
  it("returns true for text/* mime types", () => {
    expect(isReadableAsText("text/plain")).toBe(true);
    expect(isReadableAsText("text/csv")).toBe(true);
    expect(isReadableAsText("text/html")).toBe(true);
    expect(isReadableAsText("text/markdown")).toBe(true);
  });

  it("returns true for known text-like application/* types", () => {
    expect(isReadableAsText("application/json")).toBe(true);
    expect(isReadableAsText("application/yaml")).toBe(true);
    expect(isReadableAsText("application/xml")).toBe(true);
    expect(isReadableAsText("application/x-ndjson")).toBe(true);
    expect(isReadableAsText("application/javascript")).toBe(true);
    expect(isReadableAsText("application/typescript")).toBe(true);
  });

  it("strips mime parameters before matching", () => {
    expect(isReadableAsText("text/plain; charset=utf-8")).toBe(true);
    expect(isReadableAsText("application/json; charset=utf-8")).toBe(true);
  });

  it("returns false for binary types", () => {
    expect(isReadableAsText("image/png")).toBe(false);
    expect(isReadableAsText("application/pdf")).toBe(false);
    expect(isReadableAsText("application/octet-stream")).toBe(false);
  });
});
