import { filterOptionMatchesSearch } from "@app/components/workspace/analytics/filterPanel/filterState";
import { describe, expect, it } from "vitest";

describe("filterOptionMatchesSearch", () => {
  it.each([
    ["Développeur", "developpeur"],
    ["Developpeur", "développeur"],
    ["Développeur", "  DEVELOPPEUR  "],
  ])("matches %s with %s regardless of accents", (optionName, searchText) => {
    expect(filterOptionMatchesSearch(optionName, searchText)).toBe(true);
  });

  it("does not match unrelated names", () => {
    expect(filterOptionMatchesSearch("Développeur", "designer")).toBe(false);
  });
});
