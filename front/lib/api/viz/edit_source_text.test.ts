import {
  parseSourceLocation,
  replaceJsxTextAtSourceLocation,
} from "@app/lib/api/viz/edit_source_text";
import { describe, expect, it } from "vitest";

// Line/col reference (1-based), tag-name start as emitted by injectSourceLocationTags:
// 1 export default function F() {
// 2   return (
// 3     <div>
// 4       <h1>Sales</h1>
// 5       <p>Hello <b>world</b> bye</p>
// 6       <img src="x" />
// 7     </div>
// 8   );
// 9 }
const CODE = `export default function F() {
  return (
    <div>
      <h1>Sales</h1>
      <p>Hello <b>world</b> bye</p>
      <img src="x" />
    </div>
  );
}
`;

describe("parseSourceLocation", () => {
  it("parses a relative path with line and column", () => {
    expect(parseSourceLocation("components/Chart.tsx:12:4")).toEqual({
      relPath: "components/Chart.tsx",
      line: 12,
      col: 4,
    });
  });

  it("parses a bare file name", () => {
    expect(parseSourceLocation("dashboard.tsx:1:1")).toEqual({
      relPath: "dashboard.tsx",
      line: 1,
      col: 1,
    });
  });

  it("rejects malformed values", () => {
    expect(parseSourceLocation("dashboard.tsx")).toBeNull();
    expect(parseSourceLocation("dashboard.tsx:12")).toBeNull();
    expect(parseSourceLocation("dashboard.tsx:0:1")).toBeNull();
    expect(parseSourceLocation("dashboard.tsx:1:0")).toBeNull();
  });
});

describe("replaceJsxTextAtSourceLocation", () => {
  it("replaces the visible text of the element at the given location", () => {
    const result = replaceJsxTextAtSourceLocation(CODE, {
      line: 4,
      col: 8,
      oldText: "Sales",
      newText: "Revenue",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain("<h1>Revenue</h1>");
      expect(result.value).not.toContain("Sales");
    }
  });

  it("disambiguates among an element's own text children by oldText", () => {
    // <p> has two text children, "Hello " and " bye". Edit the first.
    const first = replaceJsxTextAtSourceLocation(CODE, {
      line: 5,
      col: 8,
      oldText: "Hello",
      newText: "Hi",
    });
    expect(first.isOk()).toBe(true);
    if (first.isOk()) {
      expect(first.value).toContain("<p>Hi <b>world</b> bye</p>");
    }

    // ...and the second, at the same element location.
    const second = replaceJsxTextAtSourceLocation(CODE, {
      line: 5,
      col: 8,
      oldText: "bye",
      newText: "later",
    });
    expect(second.isOk()).toBe(true);
    if (second.isOk()) {
      expect(second.value).toContain("<p>Hello <b>world</b> later</p>");
    }
  });

  it("edits the nested child element addressed by its own location", () => {
    // <b> is at line 5, col 17.
    const result = replaceJsxTextAtSourceLocation(CODE, {
      line: 5,
      col: 17,
      oldText: "world",
      newText: "planet",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain("<b>planet</b>");
    }
  });

  it("only edits the element at the location when the same text appears elsewhere", () => {
    const dup = `export default function F() {
  return (
    <div>
      <h1>Sales</h1>
      <h2>Sales</h2>
    </div>
  );
}
`;
    // Edit the <h2> (line 5, col 8). The <h1> "Sales" must stay.
    const result = replaceJsxTextAtSourceLocation(dup, {
      line: 5,
      col: 8,
      oldText: "Sales",
      newText: "Costs",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain("<h1>Sales</h1>");
      expect(result.value).toContain("<h2>Costs</h2>");
    }
  });

  it("preserves surrounding whitespace of multi-line text", () => {
    const code = `export default () => (
  <div>
    Long text here
  </div>
);
`;
    // <div> tag name at line 2, col 4.
    const result = replaceJsxTextAtSourceLocation(code, {
      line: 2,
      col: 4,
      oldText: "Long text here",
      newText: "Short",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Indentation and newlines around the text are preserved.
      expect(result.value).toContain("\n    Short\n  </div>");
    }
  });

  it("edits by content when the text is unique, ignoring a stale location", () => {
    // Drift tolerance: positions baked at publish time go stale as edits accumulate, but a
    // unique oldText is matched by content regardless of the (now wrong) location.
    const result = replaceJsxTextAtSourceLocation(CODE, {
      line: 999,
      col: 1,
      oldText: "Sales",
      newText: "Revenue",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain("<h1>Revenue</h1>");
    }
  });

  it("tolerates a drifted location when disambiguating duplicate text", () => {
    const dup = `export default function F() {
  return (
    <div>
      <h1>Save</h1>
      <h2>Save</h2>
    </div>
  );
}
`;
    // The true <h2> tag is at line 5, col 8. Pass a drifted column on the right line. The nearest
    // element still wins, so the <h2> is edited and the <h1> is left intact.
    const result = replaceJsxTextAtSourceLocation(dup, {
      line: 5,
      col: 12,
      oldText: "Save",
      newText: "Store",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain("<h1>Save</h1>");
      expect(result.value).toContain("<h2>Store</h2>");
    }
  });

  it("returns text_not_found when the text does not exist anywhere", () => {
    const result = replaceJsxTextAtSourceLocation(CODE, {
      line: 4,
      col: 8,
      oldText: "Nope",
      newText: "x",
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("text_not_found");
    }
  });

  it("returns text_not_found when the addressed text is only an attribute value", () => {
    // <img src="x" /> has no JSX text child. "x" lives in an attribute, not as text.
    const result = replaceJsxTextAtSourceLocation(CODE, {
      line: 6,
      col: 8,
      oldText: "x",
      newText: "y",
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("text_not_found");
    }
  });
});
