import { describe, expect, it } from "vitest";

import { INTERNAL_MCP_SERVERS } from "./constants";

describe("INTERNAL_MCP_SERVERS", () => {
  it("should have unique IDs for all servers", () => {
    const ids = Object.values(INTERNAL_MCP_SERVERS).map((server) => server.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });
});
