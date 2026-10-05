import {
  checkInputBounds,
  endsInsideFence,
  INPUT_LIMITS,
  isEscaped,
  structure,
} from "@app/lib/markdown/dfm/parser";
import { describe, expect, it } from "vitest";

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
  ])("refuses %s on the line where it crosses the bound", (_, text, message, line) => {
    const error = checkInputBounds(text);

    expect(error?.message).toContain(message);
    expect(error?.line).toBe(line);
  });
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
