import { isFrameFunctionReference } from "@viz/app/lib/frame-function-slug";
import { describe, expect, it } from "vitest";

describe("isFrameFunctionReference", () => {
  it("accepts a bare manifest name", () => {
    expect(isFrameFunctionReference("list-notes")).toBe(true);
    expect(isFrameFunctionReference("greet")).toBe(true);
    expect(isFrameFunctionReference("a")).toBe(true);
  });

  it("rejects a qualified reference", () => {
    // The host qualifies bare names against the calling Frame's own identity, so a Frame naming
    // the Frame it calls into is refused rather than honored.
    expect(isFrameFunctionReference("vlt_abc123/list-notes")).toBe(false);
    expect(isFrameFunctionReference("vlt_abc123/tasklist__list-notes")).toBe(
      false
    );
  });

  it("rejects an app-prefixed name", () => {
    // The `<app>__` prefix belonged to Pod functions' app-folder resolution. A v2 Frame's slug is
    // its bare manifest name, so a prefixed string names nothing.
    expect(isFrameFunctionReference("tasklist__list-notes")).toBe(false);
  });

  it("rejects references outside the name grammar", () => {
    for (const reference of [
      "",
      "List-Notes",
      "list notes",
      "list_notes",
      "-list-notes",
      "list-notes-",
      "list--notes",
      "a/b",
    ]) {
      expect({
        reference,
        accepted: isFrameFunctionReference(reference),
      }).toEqual({ reference, accepted: false });
    }
  });
});
