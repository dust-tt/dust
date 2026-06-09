import {
  getCapabilitySortName,
  sortCapabilityMatches,
} from "@app/lib/capabilities/sort";
import { describe, expect, it } from "vitest";

describe("sortCapabilityMatches", () => {
  it("sorts by normalized capability name without a query", () => {
    const result = sortCapabilityMatches({
      normalizedQuery: "",
      items: [
        { id: "z", sortName: getCapabilitySortName("Zed") },
        { id: "a", sortName: getCapabilitySortName("Alpha") },
      ],
    });

    expect(result.map((item) => item.id)).toEqual(["a", "z"]);
  });
});
