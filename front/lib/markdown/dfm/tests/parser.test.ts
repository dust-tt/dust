import { serializeDfm } from "@app/lib/markdown/dfm";
import {
  checkInputBounds,
  codeRanges,
  endsInsideFence,
  INPUT_LIMITS,
  isEscaped,
  structure,
} from "@app/lib/markdown/dfm/parser";
import {
  SIMPLE_DOCUMENT,
  unwrap,
} from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { fromMarkdown } from "mdast-util-from-markdown";
import { describe, expect, it, vi } from "vitest";

vi.mock("mdast-util-from-markdown", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("mdast-util-from-markdown")>();
  return { ...original, fromMarkdown: vi.fn(original.fromMarkdown) };
});

const parser = vi.mocked(fromMarkdown);

/** A body long enough for its code ranges to be memoized, unique to `name`. */
function longBody(name: string): string {
  return `# ${name}\n\n\`\`\`\ncode\n\`\`\`\n\n${"Text with `a span`.\n\n".repeat(300)}End.`;
}

describe("isEscaped", () => {
  it.each([
    ["nothing before", "x", 0, false],
    ["one backslash", "\\x", 1, true],
    ["two backslashes", "\\\\x", 2, false],
    ["three backslashes", "\\\\\\x", 3, true],
    ["a backslash further back", "\\ax", 2, false],
  ])("reads %s", (_, text, index, escaped) => {
    expect(isEscaped(text, index)).toBe(escaped);
  });
});

describe("endsInsideFence", () => {
  it.each([
    ["an unclosed fence", "Text\n\n```\ncode", true],
    ["an unclosed fence with trailing newlines", "```\ncode\n\n", true],
    ["a closed fence", "```\ncode\n```", false],
    ["a closed fence inside a blockquote", "> ```\n> code\n> ```", false],
    ["a closed fence inside a list item", "- ```\n  code\n  ```", false],
    ["an unclosed fence inside a blockquote", "> ```\n> code", false],
    ["an unclosed fence inside a list item", "- ```\n  code", false],
    ["an indented code block", "Text\n\n    code", false],
    ["no code at all", "Text", false],
    ["an empty text", "", false],
  ])("is %s", (_, text, inside) => {
    expect(endsInsideFence(text)).toBe(inside);
  });
});

describe("structure", () => {
  it("lists nodes with their depth, type and properties, text aside", () => {
    expect(structure("# Title\n\n- *a* `b`")).toEqual([
      "0:root:{}",
      '1:heading:{"depth":1}',
      '1:list:{"ordered":false,"start":null,"spread":false}',
      '2:listItem:{"spread":false,"checked":null}',
      "3:paragraph:{}",
      "4:emphasis:{}",
      '4:inlineCode:{"value":"b"}',
    ]);
  });

  it("tells sibling emphases from nested ones", () => {
    const siblings = structure("*a*b*c*");

    expect(siblings).toEqual(structure("*a*b*xc*"));
    expect(siblings).not.toEqual(
      structure("*:comment-start{id=c1}a:comment-end{id=c1}*b*c*")
    );
  });
});

describe("checkInputBounds", () => {
  it.each([
    ["a large plain document", "lorem ipsum dolor sit amet, ".repeat(9000)],
    [
      "a long formatted list",
      "- **Name** [link](http://x) `code`\n  - sub _em_\n    - sub2\n".repeat(
        1000
      ),
    ],
    [
      "a line nested as deep as the bound allows",
      `${">".repeat(INPUT_LIMITS.linePrefix - 1)} deep`,
    ],
    ["a flat list at the bound", "1. a\n".repeat(INPUT_LIMITS.listItems)],
  ])("accepts %s", (_, text) => {
    expect(checkInputBounds(text)).toBeNull();
  });

  it.each([
    [
      "text over the length limit",
      `a\n${"x".repeat(INPUT_LIMITS.length)}`,
      `exceeds ${INPUT_LIMITS.length} characters`,
      2,
    ],
    [
      "a line nested deeper than the parser handles quickly",
      `fine\n${">".repeat(INPUT_LIMITS.linePrefix + 1)} deep`,
      "nests deeper than",
      2,
    ],
    [
      "a line nesting quotes inside a list item",
      `- ${">".repeat(INPUT_LIMITS.linePrefix)} deep`,
      "nests deeper than",
      1,
    ],
    [
      "a line nesting ordered list items",
      "1. ".repeat(INPUT_LIMITS.linePrefix / 3 + 1),
      "nests deeper than",
      1,
    ],
    [
      "more inline delimiters than the parser resolves quickly",
      `a\n${"*a_b*c_".repeat(INPUT_LIMITS.delimiters / 4 + 1)}`,
      "emphasis, link or code delimiters",
      2,
    ],
    [
      "more closing brackets than the parser resolves quickly",
      "]".repeat(INPUT_LIMITS.delimiters + 1),
      "emphasis, link or code delimiters",
      1,
    ],
    [
      "more list items than the parser handles quickly",
      "1. a\n".repeat(INPUT_LIMITS.listItems + 1),
      `more than ${INPUT_LIMITS.listItems} list items`,
      INPUT_LIMITS.listItems + 1,
    ],
    [
      "empty list items",
      "-\n".repeat(INPUT_LIMITS.listItems + 1),
      `more than ${INPUT_LIMITS.listItems} list items`,
      INPUT_LIMITS.listItems + 1,
    ],
    [
      "a deep line behind a byte order mark",
      `\uFEFF${">".repeat(INPUT_LIMITS.linePrefix + 1)} deep`,
      "nests deeper than",
      1,
    ],
    [
      "a deep line after a bare carriage return",
      `fine\r${">".repeat(INPUT_LIMITS.linePrefix + 1)} deep`,
      "nests deeper than",
      2,
    ],
    [
      "nested list items counted across lines",
      `${"- ".repeat(8)}a\n`.repeat(INPUT_LIMITS.listItems / 8 + 1),
      `more than ${INPUT_LIMITS.listItems} list items`,
      INPUT_LIMITS.listItems / 8 + 1,
    ],
  ])(
    "refuses %s on the line where it crosses the bound",
    (_, text, message, line) => {
      const error = checkInputBounds(text);

      expect(error?.message).toContain(message);
      expect(error?.line).toBe(line);
    }
  );
});

describe("structure", () => {
  it("tells a link whose destination changed from one whose text did", () => {
    const [link] = structure("[a](b)").filter((entry) =>
      entry.includes("link")
    );

    expect(structure("[ab](b)")).toContain(link);
    expect(structure("[a](bb)")).not.toContain(link);
  });
});

describe("codeRanges", () => {
  it("parses a long text once while other texts are asked for in between", () => {
    const body = longBody("memoized");
    const ranges = codeRanges(body);
    codeRanges(`${body}\n\nzz`);
    codeRanges("A comment message with `code`.");
    codeRanges(`${body}\n\n:::annotations\n:::`);
    parser.mockClear();

    expect(codeRanges(body)).toBe(ranges);
    expect(parser).not.toHaveBeenCalled();
  });

  it("parses the body of a document serializeDfm writes once", () => {
    const body = `${longBody("serialized")}\n\n${SIMPLE_DOCUMENT.body}`;
    parser.mockClear();

    unwrap(serializeDfm({ ...SIMPLE_DOCUMENT, body }));

    expect(parser.mock.calls.filter(([text]) => text === body)).toHaveLength(1);
  });
});
