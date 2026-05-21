import { transformEditableText } from "@viz/app/lib/transformEditableText";
import { describe, expect, it } from "vitest";

// Helper: extract the text content of every data-editable span in the
// transformed output, in document order.
function spanContents(output: string): string[] {
  const matches = [
    ...output.matchAll(/<span[^>]*data-editable[^>]*>(.*?)<\/span>/gs),
  ];
  return matches.map((m) => m[1]);
}

describe("transformEditableText", () => {
  it("leaves code unchanged when there is no JSX text", () => {
    const code = `function Foo() { return <div />; }`;
    expect(transformEditableText(code)).toBe(code);
  });

  it("wraps simple inline text in a span", () => {
    const code = `function Foo() { return <p>Hello world</p>; }`;
    const out = transformEditableText(code);
    expect(spanContents(out)).toEqual(["Hello world"]);
  });

  it("preserves inline spaces adjacent to elements (the original bug)", () => {
    const code = `
function Foo() {
  return (
    <p>The Alps host <strong>340 resorts</strong> and welcome <strong>55M visitors</strong> annually.</p>
  );
}`;
    const out = transformEditableText(code);
    const contents = spanContents(out);
    // Inline spaces around <strong> must be preserved — not trimmed.
    expect(contents).toContain("The Alps host ");
    expect(contents).toContain("340 resorts");
    expect(contents).toContain(" and welcome ");
    expect(contents).toContain("55M visitors");
    expect(contents).toContain(" annually.");
  });

  it("strips leading/trailing newline+indent from multi-line JSX text nodes", () => {
    const code = `
function Foo() {
  return (
    <p>
      Some text here
    </p>
  );
}`;
    const out = transformEditableText(code);
    // The JSX text node is "\n      Some text here\n    " — newlines+indent should be removed.
    expect(spanContents(out)).toEqual(["Some text here"]);
  });

  it("stores raw text (with original whitespace) in data-raw-text", () => {
    const code = `function Foo() { return <p>The Alps host <strong>340</strong> resorts.</p>; }`;
    const out = transformEditableText(code);
    // The raw text for "The Alps host " includes the trailing space.
    expect(out).toContain(
      `data-raw-text="${encodeURIComponent("The Alps host ")}"`
    );
    // The raw text for " resorts." includes the leading space.
    expect(out).toContain(`data-raw-text="${encodeURIComponent(" resorts.")}"`);
  });

  it("leaves non-JSX files unchanged", () => {
    const code = `const x = 1 + 2;`;
    expect(transformEditableText(code)).toBe(code);
  });

  it("wraps text in multiple sibling elements", () => {
    const code = `
function Foo() {
  return (
    <div>
      <p>First paragraph</p>
      <p>Second paragraph</p>
    </div>
  );
}`;
    const out = transformEditableText(code);
    expect(spanContents(out)).toEqual(["First paragraph", "Second paragraph"]);
  });
});
