import { describe, expect, it } from "vitest";

import { stripMarkdown } from "./markdown";

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

  it("replaces content node mentions with title", () => {
    expect(
      stripMarkdown(":content_node_mention[My Doc]{url=https://example.com}")
    ).toBe("My Doc");
  });

  it("handles a mix of mentions and markdown", () => {
    const input =
      "Hey :mention[Bot]{sId=b1}, check **this** :content_node_mention[Report]{url=https://x.com}";
    expect(stripMarkdown(input)).toBe("Hey @Bot, check this Report");
  });

  it("replaces project tasks, mentions, and quickReply", () => {
    const input =
      'Hello :mention[Agent]{sId=a1} — :project_task[Ship feature]{sId=todo_1} :quickReply[Go]{message="Do it"}';
    expect(stripMarkdown(input)).toBe("Hello @Agent — Ship feature Go — Do it");
  });

  it("leaves cite markers intact", () => {
    const input = "See :cite[ab] and :project_task[X]{sId=t}";
    expect(stripMarkdown(input)).toBe("See :cite[ab] and X");
  });

  it("replaces toolSetup and visualization blocks", () => {
    const input = `Before\n:::visualization\n{"x":1}\n:::\nAfter :toolSetup[Connect Notion]{sId=notion}`;
    expect(stripMarkdown(input)).toBe(
      "Before\nVisualization\n\nAfter Connect Notion"
    );
  });

  it("replaces pasted attachments", () => {
    const input = ":pasted_attachment[Notes]{id=1}";
    expect(stripMarkdown(input)).toBe("📎 Notes");
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
