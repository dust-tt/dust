import {
  injectSourceLocationTags,
  SOURCE_LOCATION_ATTRIBUTE,
} from "@app/lib/api/viz/source_location_tags";
import { describe, expect, it } from "vitest";

describe("injectSourceLocationTags", () => {
  it("tags an opening element with its 1-based file:line:col", () => {
    const out = injectSourceLocationTags("a.tsx", `<div>Hi</div>`);
    // `div` tagName starts at column 2 (after `<`) on line 1.
    expect(out).toBe(`<div ${SOURCE_LOCATION_ATTRIBUTE}="a.tsx:1:2">Hi</div>`);
  });

  it("tags nested elements each with their own location", () => {
    const out = injectSourceLocationTags("a.tsx", `<div><span>Hi</span></div>`);
    expect(out).toContain(`<div ${SOURCE_LOCATION_ATTRIBUTE}="a.tsx:1:2">`);
    expect(out).toContain(`<span ${SOURCE_LOCATION_ATTRIBUTE}="a.tsx:1:7">`);
  });

  it("tags self-closing elements", () => {
    const out = injectSourceLocationTags("a.tsx", `<img src="x" />`);
    expect(out).toBe(
      `<img ${SOURCE_LOCATION_ATTRIBUTE}="a.tsx:1:2" src="x" />`
    );
  });

  it("computes line numbers across multiple lines", () => {
    const code = [
      "function C() {",
      "  return (",
      "    <h1>Title</h1>",
      "  );",
      "}",
    ].join("\n");
    const out = injectSourceLocationTags("comp.tsx", code);
    // `h1` is on line 3, indented 4 spaces, so the tagName starts at column 6.
    expect(out).toContain(`<h1 ${SOURCE_LOCATION_ATTRIBUTE}="comp.tsx:3:6">`);
  });

  it("preserves existing attributes and text content", () => {
    const out = injectSourceLocationTags(
      "a.tsx",
      `<button className="btn" onClick={go}>Click</button>`
    );
    expect(out).toContain(`${SOURCE_LOCATION_ATTRIBUTE}="a.tsx:1:2"`);
    expect(out).toContain(`className="btn"`);
    expect(out).toContain(`onClick={go}`);
    expect(out).toContain(`>Click</button>`);
  });

  it("does not tag fragments and leaves other elements intact", () => {
    const out = injectSourceLocationTags("a.tsx", `<><p>x</p></>`);
    // Fragments have no tag name, so only the <p> is tagged. `<>` is 2 chars, so the
    // `p` tag name starts at column 4.
    expect(out).toBe(`<><p ${SOURCE_LOCATION_ATTRIBUTE}="a.tsx:1:4">x</p></>`);
  });

  it("uses the provided file name (the mount-relative path) in the tag", () => {
    const out = injectSourceLocationTags(
      "components/Chart.tsx",
      `<div>c</div>`
    );
    expect(out).toContain(`"components/Chart.tsx:1:2"`);
  });

  it("returns the input unchanged when there is no JSX", () => {
    const code = `export const palette = { primary: "#3366ff" };`;
    expect(injectSourceLocationTags("theme.ts", code)).toBe(code);
  });

  it("does not throw on malformed input", () => {
    expect(() => injectSourceLocationTags("a.tsx", `<div><span`)).not.toThrow();
  });
});
