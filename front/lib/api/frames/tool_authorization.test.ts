import { authorizedToolsCoverRequired } from "@app/lib/api/frames/tool_authorization_coverage";
import { describe, expect, it } from "vitest";

describe("authorizedToolsCoverRequired", () => {
  it("treats an empty required set as satisfied", () => {
    expect(authorizedToolsCoverRequired([], [])).toBe(true);
    expect(authorizedToolsCoverRequired([["a", "b"]], [])).toBe(true);
  });

  it("requires every required pair to be present in authorized", () => {
    expect(
      authorizedToolsCoverRequired(
        [
          ["slack", "post"],
          ["github", "read"],
        ],
        [["slack", "post"]]
      )
    ).toBe(true);
    expect(
      authorizedToolsCoverRequired(
        [["slack", "post"]],
        [
          ["slack", "post"],
          ["github", "read"],
        ]
      )
    ).toBe(false);
  });
});
