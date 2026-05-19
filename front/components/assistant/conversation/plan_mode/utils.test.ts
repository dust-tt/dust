import { describe, expect, test } from "vitest";

import { parsePlan } from "./utils";

describe("parsePlan", () => {
  describe("title extraction", () => {
    test("extracts the first H1 as the title", () => {
      const result = parsePlan("# Build a thing\n\nsome content");
      expect(result.title).toBe("Build a thing");
    });

    test("trims whitespace inside the H1", () => {
      const result = parsePlan("#    Build a thing   \n");
      expect(result.title).toBe("Build a thing");
    });

    test("falls back when no H1 is present", () => {
      const result = parsePlan("## Context\n\nsome content");
      expect(result.title).toBe("Untitled plan");
    });

    test("falls back on empty input", () => {
      expect(parsePlan("").title).toBe("Untitled plan");
      expect(parsePlan(null).title).toBe("Untitled plan");
    });
  });

  describe("preamble + tasks split", () => {
    test("returns content as preamble and no tasks when there's no Tasks heading", () => {
      const content = "# Plan\n\n## Context\n\nbackground only";
      const result = parsePlan(content);
      expect(result.preamble).toBe(content);
      expect(result.tasks).toEqual([]);
    });

    test("splits at '## Tasks' (plural) and keeps the heading in preamble", () => {
      const content = [
        "# Plan",
        "",
        "## Context",
        "why",
        "",
        "## Tasks",
        "- [ ] First",
        "- [ ] Second",
      ].join("\n");
      const result = parsePlan(content);
      expect(result.preamble.endsWith("## Tasks")).toBe(true);
      expect(result.tasks).toEqual(["First", "Second"]);
    });

    test("also matches '## Task' (singular)", () => {
      const content = "# Plan\n\n## Task\n- [ ] Only one";
      const result = parsePlan(content);
      expect(result.tasks).toEqual(["Only one"]);
    });

    test("matches the first heading when multiple Tasks sections exist", () => {
      const content = [
        "# Plan",
        "## Tasks",
        "- [ ] First-set",
        "## Tasks",
        "- [ ] Second-set",
      ].join("\n");
      const result = parsePlan(content);
      expect(result.tasks).toEqual(["First-set", "Second-set"]);
      // Both end up in tasks because everything after the first heading match
      // is scanned for task markers; the second heading doesn't re-anchor.
    });
  });

  describe("task marker parsing", () => {
    test("parses [ ] / [x] / [X] / [!] markers", () => {
      const content = [
        "# Plan",
        "## Tasks",
        "- [ ] open",
        "- [x] done lowercase",
        "- [X] done uppercase",
        "- [!] blocked",
      ].join("\n");
      const result = parsePlan(content);
      expect(result.tasks).toEqual([
        "open",
        "done lowercase",
        "done uppercase",
        "blocked",
      ]);
    });

    test("trims surrounding whitespace from task text", () => {
      const content = "## Tasks\n-  [ ]   spaced out   ";
      const result = parsePlan(content);
      expect(result.tasks).toEqual(["spaced out"]);
    });

    test("tolerates leading whitespace before the dash", () => {
      const content = "## Tasks\n   - [ ] indented";
      const result = parsePlan(content);
      expect(result.tasks).toEqual(["indented"]);
    });

    test("ignores lines that aren't task markers", () => {
      const content = [
        "## Tasks",
        "- [ ] real task",
        "not a task",
        "- [?] not a recognized marker",
        "- [ ] another real task",
      ].join("\n");
      const result = parsePlan(content);
      expect(result.tasks).toEqual(["real task", "another real task"]);
    });
  });
});
