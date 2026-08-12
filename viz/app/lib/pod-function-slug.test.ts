import {
  isPodFunctionReference,
  POD_FUNCTION_RELATIVE_REFERENCE_REGEX,
} from "@viz/app/lib/pod-function-slug";
import { describe, expect, it } from "vitest";

describe("isPodFunctionReference", () => {
  it("accepts a fully qualified reference", () => {
    expect(isPodFunctionReference("vlt_abc123/list-notes")).toBe(true);
    expect(isPodFunctionReference("vlt_abc123/tasklist__list-notes")).toBe(
      true
    );
  });

  it("accepts a bare name, which the host resolves against the Frame's app", () => {
    expect(isPodFunctionReference("list-notes")).toBe(true);
    expect(isPodFunctionReference("greet")).toBe(true);
  });

  it("rejects a prefixed name with no pod", () => {
    // Not a third form: dropping the app prefix is the point of the relative reference, so a
    // prefixed-but-podless string is a mistake rather than shorthand.
    expect(isPodFunctionReference("tasklist__list-notes")).toBe(false);
  });

  it("rejects references outside the slug grammar", () => {
    for (const reference of [
      "",
      "List-Notes",
      "list notes",
      "list_notes",
      "-list-notes",
      "list-notes-",
      "vlt_abc123/List-Notes",
      "vlt_abc123/a/b",
    ]) {
      expect({
        reference,
        accepted: isPodFunctionReference(reference),
      }).toEqual({ reference, accepted: false });
    }
  });
});

describe("POD_FUNCTION_RELATIVE_REFERENCE_REGEX", () => {
  it("matches one slug segment and nothing more", () => {
    expect(POD_FUNCTION_RELATIVE_REFERENCE_REGEX.test("add-task")).toBe(true);
    expect(POD_FUNCTION_RELATIVE_REFERENCE_REGEX.test("a")).toBe(true);
    expect(POD_FUNCTION_RELATIVE_REFERENCE_REGEX.test("add--task")).toBe(false);
    expect(POD_FUNCTION_RELATIVE_REFERENCE_REGEX.test("x/add-task")).toBe(
      false
    );
  });
});
