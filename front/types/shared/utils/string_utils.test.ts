import { describe, expect, it } from "vitest";

import { stripMarkdown } from "./string_utils";

describe("stripMarkdown", () => {
  it("strips basic markdown formatting", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
  });

  it("strips headings", () => {
    expect(stripMarkdown("# Heading 1")).toBe("Heading 1");
    expect(stripMarkdown("## Heading 2")).toBe("Heading 2");
  });

  it("strips links", () => {
    expect(stripMarkdown("[click here](https://example.com)")).toBe(
      "click here"
    );
  });

  it("strips inline code", () => {
    expect(stripMarkdown("use `console.log`")).toBe("use console.log");
  });

  it("replaces agent mentions with @name", () => {
    expect(stripMarkdown(":mention[Dust]{sId=abc123}")).toBe("@Dust");
  });

  it("replaces user mentions with @name", () => {
    expect(stripMarkdown(":mention_user[Alice]{sId=user42}")).toBe("@Alice");
  });

  it("replaces content node mentions with quoted title", () => {
    expect(
      stripMarkdown(":content_node_mention[My Doc]{url=https://example.com}")
    ).toBe('"My Doc"');
  });

  it("handles a mix of mentions and markdown", () => {
    const input =
      "Hey :mention[Bot]{sId=b1}, check **this** :content_node_mention[Report]{url=https://x.com}";
    const result = stripMarkdown(input);
    expect(result).toBe('Hey @Bot, check this "Report"');
  });

  it("returns plain text unchanged", () => {
    expect(stripMarkdown("just plain text")).toBe("just plain text");
  });

  it("handles empty string", () => {
    expect(stripMarkdown("")).toBe("");
  });

  it("handles &nbsp;", () => {
    expect(stripMarkdown("hello&nbsp;darkness&nbsp;my&nbsp;old friend")).toBe(
      "hello darkness my old friend"
    );
  });
});
