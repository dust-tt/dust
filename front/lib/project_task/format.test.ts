import { describe, expect, it } from "vitest";

import {
  extractProjectTaskDirectivesFromString,
  serializeProjectTaskDirective,
} from "./format";

describe("pod task format", () => {
  it("serializes and extracts round-trip", () => {
    const s = serializeProjectTaskDirective({
      label: "Fix bug",
      sId: "pt_123",
    });
    expect(s).toBe(":pod_task[Fix bug]{sId=pt_123}");

    const extracted = extractProjectTaskDirectivesFromString(
      `Before ${s} after`
    );
    expect(extracted).toEqual([{ label: "Fix bug", sId: "pt_123" }]);
  });

  it("extracts legacy :project_task and :todo directives", () => {
    const text = ":project_task[One]{sId=a} and :todo[Two]{sId=b}";
    expect(extractProjectTaskDirectivesFromString(text)).toEqual([
      { label: "One", sId: "a" },
      { label: "Two", sId: "b" },
    ]);
  });
});
