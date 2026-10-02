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
  it("lists node types with their depth, text aside", () => {
    expect(structure("# Title\n\n- *a* `b`")).toEqual([
      "0:root",
      "1:heading",
      "1:list",
      "2:listItem",
      "3:paragraph",
      "4:emphasis",
      "4:inlineCode",
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
  it("accepts a large plain document", () => {
    const prose = "lorem ipsum dolor sit amet, ".repeat(9000);

    expect(prose.length).toBeGreaterThan(200_000);
    expect(checkInputBounds(prose)).toBeNull();
  });

  it.each([
    [
      "text over the length limit",
      "x".repeat(INPUT_LIMITS.length + 1),
      `exceeds ${INPUT_LIMITS.length} characters`,
      undefined,
    ],
    [
      "a line nested deeper than the parser handles quickly",
      `fine\n${">".repeat(INPUT_LIMITS.linePrefix + 1)} deep`,
      "nests deeper than",
      2,
    ],
    [
      "more inline delimiters than the parser resolves quickly",
      "*a_b*c_".repeat(INPUT_LIMITS.delimiters / 4 + 1),
      "emphasis, link or code delimiters",
      undefined,
    ],
  ])("refuses %s", (_, text, message, line) => {
    const error = checkInputBounds(text);

    expect(error?.message).toContain(message);
    expect(error?.line).toBe(line);
  });
});
