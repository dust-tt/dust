import { formatDfsUri, parseDfsUri } from "@app/lib/dfs/uri";
import { describe, expect, it } from "vitest";

const ID = "0190c3a0b1c27d4e8f0a1b2c3d4e5f60";

describe("parseDfsUri", () => {
  it("parses an anchor with or without a name, and an optional path", () => {
    expect(parseDfsUri(`dfs://${ID}`)).toEqual(
      expect.objectContaining({ value: { anchorId: ID, segments: [] } })
    );
    expect(parseDfsUri(`dfs://plan.md--${ID}`)).toEqual(
      expect.objectContaining({ value: { anchorId: ID, segments: [] } })
    );
    expect(
      parseDfsUri(`dfs://pod--acme--${ID}/data/q3%20r%C3%A9sum%C3%A9.md`)
    ).toEqual(
      expect.objectContaining({
        value: { anchorId: ID, segments: ["data", "q3 résumé.md"] },
      })
    );
  });

  it.each([
    ["another scheme", `file://${ID}`],
    ["an invalid object ID", "dfs://plan--1234"],
    ["an uppercase object ID", `dfs://${ID.toUpperCase()}`],
    ["an empty name", `dfs://--${ID}`],
    ["a trailing slash", `dfs://${ID}/`],
    ["an empty segment", `dfs://${ID}/a//b`],
    ["a dot-dot segment", `dfs://${ID}/a/../b`],
    ["an encoded slash", `dfs://${ID}/a%2Fb`],
    ["an encoded NUL", `dfs://${ID}/a%00`],
    ["a reserved character", `dfs://${ID}/a?b`],
    ["invalid UTF-8", `dfs://${ID}/%C3`],
    ["a too long segment", `dfs://${ID}/${"x".repeat(256)}`],
  ])("rejects %s", (_, uri) => {
    const res = parseDfsUri(uri);
    expect(res.isErr() && res.error.code).toBe("invalid_input");
  });
});

describe("formatDfsUri", () => {
  it("formats canonical URIs, omitting an empty name", () => {
    expect(formatDfsUri(ID)).toBe(`dfs://${ID}`);
    expect(formatDfsUri(ID, { name: "" })).toBe(`dfs://${ID}`);
    expect(formatDfsUri(ID, { name: "it's (v2)!.md" })).toBe(
      `dfs://it%27s%20%28v2%29%21.md--${ID}`
    );
  });

  it("round-trips through parseDfsUri", () => {
    const path = ["reports", "q3 résumé?.md", "a*b"];
    const uri = formatDfsUri(ID, { name: "pod--acme", path });

    expect(parseDfsUri(uri)).toEqual(
      expect.objectContaining({ value: { anchorId: ID, segments: path } })
    );
  });
});
