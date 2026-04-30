import { describe, expect, it } from "vitest";

import {
  extractProjectTodoDirectivesFromString,
  serializeProjectTodoDirective,
} from "./format";

describe("project_todo format", () => {
  it("serializes and extracts round-trip", () => {
    const s = serializeProjectTodoDirective({
      label: "Fix bug",
      sId: "pt_123",
    });
    expect(s).toBe(":todo[Fix bug]{sId=pt_123}");

    const extracted = extractProjectTodoDirectivesFromString(
      `Before ${s} after`
    );
    expect(extracted).toEqual([{ label: "Fix bug", sId: "pt_123" }]);
  });

  it("extracts multiple todos", () => {
    const text = ":todo[One]{sId=a} and :todo[Two]{sId=b}";
    expect(extractProjectTodoDirectivesFromString(text)).toEqual([
      { label: "One", sId: "a" },
      { label: "Two", sId: "b" },
    ]);
  });
});
