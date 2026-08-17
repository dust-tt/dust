import { describe, expect, it } from "vitest";

import { parsePropertyValue } from "./notion_api";

describe("parsePropertyValue", () => {
  it("returns null for unsupported formula results", () => {
    expect(
      parsePropertyValue({
        id: "formula-property",
        type: "formula",
        formula: {
          type: "unsupported",
          unsupported: {},
        },
      })
    ).toBeNull();
  });

  it("keeps rendering supported formula results", () => {
    expect(
      parsePropertyValue({
        id: "formula-property",
        type: "formula",
        formula: {
          type: "number",
          number: 42,
        },
      })
    ).toBe("42");
  });
});
