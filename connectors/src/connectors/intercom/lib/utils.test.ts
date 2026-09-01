import { describe, expect, it } from "vitest";

import { getIntercomConversationIds } from "./utils";

describe("getIntercomConversationIds", () => {
  it("keeps conversations that have an id", () => {
    expect(
      getIntercomConversationIds([{ id: "123" }, { id: 456 }, { id: "789" }])
    ).toEqual(["123", "456", "789"]);
  });

  it("drops conversations with missing or empty ids", () => {
    expect(
      getIntercomConversationIds([
        { id: "123" },
        { id: undefined },
        { id: null },
        {},
        { id: "" },
      ])
    ).toEqual(["123"]);
  });
});
