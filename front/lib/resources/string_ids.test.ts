import { getIdsFromSId, makeSId } from "@app/lib/resources/string_ids";
import { describe, expect, it } from "vitest";

describe("getIdsFromSId", () => {
  it("decodes a well-formed sId", () => {
    const result = getIdsFromSId(makeSId("space", { id: 42, workspaceId: 7 }));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        workspaceModelId: 7,
        resourceModelId: 42,
      });
    }
  });

  it.each([
    "vlt",
    "vlt_",
    "vlt_abc",
    "nope_abcdefghij",
    "",
  ])("returns an Err for the malformed sId %j", (sId) => {
    expect(getIdsFromSId(sId).isErr()).toBe(true);
  });
});
