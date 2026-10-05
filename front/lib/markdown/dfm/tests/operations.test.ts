import { anchorComment, extractAnchors } from "@app/lib/markdown/dfm";
import {
  expectError,
  unwrap,
} from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { describe, expect, it } from "vitest";

describe("anchorComment", () => {
  const body =
    "Snow :comment-start{id=c1}loosens at dawn:comment-end{id=c1} early. Snow again.";

  it("wraps the quoted text and leaves everything else untouched", () => {
    const anchored = unwrap(
      anchorComment({ body, id: "c2", quote: "at dawn early" })
    );

    expect(anchored).toBe(
      "Snow :comment-start{id=c1}loosens :comment-start{id=c2}at dawn:comment-end{id=c1} early:comment-end{id=c2}. Snow again."
    );
    const { text, anchors } = unwrap(extractAnchors(anchored));
    expect(text).toBe("Snow loosens at dawn early. Snow again.");
    expect(anchors).toEqual([
      { id: "c1", start: 5, end: 20 },
      { id: "c2", start: 13, end: 26 },
    ]);
  });

  it("counts occurrences without overlap", () => {
    const anchored = unwrap(
      anchorComment({ body: "aaaa", id: "c1", quote: "aa", nth: 2 })
    );

    expect(anchored).toBe("aa:comment-start{id=c1}aa:comment-end{id=c1}");
  });

  it("picks the nth occurrence", () => {
    const anchored = unwrap(
      anchorComment({ body, id: "c2", quote: "Snow", nth: 2 })
    );

    expect(
      anchored.endsWith(":comment-start{id=c2}Snow:comment-end{id=c2} again.")
    ).toBe(true);
  });

  it("anchors a quote that starts where an existing anchor starts", () => {
    const anchored = unwrap(
      anchorComment({ body, id: "c2", quote: "loosens" })
    );

    expect(anchored).toBe(
      "Snow :comment-start{id=c2}:comment-start{id=c1}loosens:comment-end{id=c2} at dawn:comment-end{id=c1} early. Snow again."
    );
  });

  it("anchors text after an unterminated directive inside code", () => {
    const anchored = unwrap(
      anchorComment({ body: "`:comment-start{` x", id: "c1", quote: "x" })
    );

    expect(anchored).toBe(
      "`:comment-start{` :comment-start{id=c1}x:comment-end{id=c1}"
    );
  });

  it("refuses an insertion that would turn another anchor into code", () => {
    const body = "a``` :comment-start{id=c1}b:comment-end{id=c1} ` z";

    expectError(
      anchorComment({ body, id: "new", quote: "a``" }),
      "inside code"
    );
    // A backslash escapes one backtick, so the span after it exists before and after the
    // insertion: nothing changes about which text is code, and the anchor is allowed.
    const escaped = unwrap(
      anchorComment({
        body: "Q\\`` :comment-start{id=c1}b:comment-end{id=c1} ` z",
        id: "new",
        quote: "Q\\`",
      })
    );
    expect(
      unwrap(extractAnchors(escaped)).anchors.map((anchor) => anchor.id)
    ).toEqual(["new"]);
    expectError(
      anchorComment({ body: "a``b", id: "c1", quote: "`" }),
      "inside code"
    );
  });

  it("anchors text next to a code block without touching the fence", () => {
    const anchored = unwrap(
      anchorComment({
        body: "Text\n\n```\ncode\n```\nAfter",
        id: "c1",
        quote: "After",
      })
    );

    expect(anchored).toBe(
      "Text\n\n```\ncode\n```\n:comment-start{id=c1}After:comment-end{id=c1}"
    );
  });

  it("anchors a heading's text without its marker", () => {
    const anchored = unwrap(
      anchorComment({ body: "# Title\n\n> quote", id: "c1", quote: "Title" })
    );

    expect(anchored).toBe(
      "# :comment-start{id=c1}Title:comment-end{id=c1}\n\n> quote"
    );
  });

  it("anchors text before a fence closed inside a blockquote or a list", () => {
    for (const body of [
      "Text\n\n> ```\n> code\n> ```",
      "Text\n\n- ```\n  code\n  ```",
    ]) {
      expect(anchorComment({ body, id: "c1", quote: "Text" }).isOk()).toBe(
        true
      );
    }
  });

  it.each([
    ["an invalid id", { body, id: "c 2", quote: "Snow" }, "Invalid comment id"],
    ["an empty quote", { body, id: "c2", quote: "" }, "Quote cannot be empty"],
    [
      "an id already anchored",
      { body, id: "c1", quote: "Snow" },
      'Comment anchor "c1" already exists',
    ],
    ["a missing quote", { body, id: "c2", quote: "rain" }, "Quote not found"],
    [
      "too few occurrences",
      { body, id: "c2", quote: "Snow", nth: 3 },
      "Quote not found 3 times",
    ],
    [
      "a quote whose end marker would unescape a backtick",
      { body: "Q\\`code` tail", id: "c1", quote: "Q\\" },
      "right after a backslash",
    ],
    [
      "a quote inside a span opened before an inner double-backtick pair",
      {
        body: "`before `` middle `` after` tail",
        id: "c1",
        quote: "before",
      },
      "inside code",
    ],
    [
      "a quote inside inline code",
      { body: "Use `git push` here.", id: "c2", quote: "git push" },
      "inside code",
    ],
    [
      "a quote overlapping inline code",
      { body: "Use `git push` here.", id: "c2", quote: "Use `git" },
      "inside code",
    ],
    [
      "a quote inside a fence",
      { body: "```\nnpm test\n```", id: "c2", quote: "npm test" },
      "inside code",
    ],
    [
      "a quote starting on a fence line",
      { body: "```\ncode\n```\nAfter", id: "c1", quote: "```\ncode" },
      "inside code",
    ],
    [
      "a quote ending on a fence line",
      { body: "Text\n\n```\ncode\n```\nAfter", id: "c1", quote: "Text\n\n" },
      "inside code",
    ],
    [
      "a malformed body",
      { body: ":comment-start{id=c1}open", id: "c2", quote: "open" },
      'Comment anchor "c1" is never closed',
    ],
    [
      "a zero occurrence",
      { body, id: "c2", quote: "Snow", nth: 0 },
      "Occurrence must be a positive integer",
    ],
    [
      "a fractional occurrence",
      { body, id: "c2", quote: "Snow", nth: 1.5 },
      "Occurrence must be a positive integer",
    ],
    [
      "a body with a carriage return",
      { body: "Text\rmore", id: "c2", quote: "Text" },
      "Body cannot contain a carriage return",
    ],
    [
      "a quote starting on a heading marker",
      { body: "# Title", id: "c1", quote: "# Title" },
      "heading would become paragraph",
    ],
    [
      "a quote starting on a list marker",
      { body: "- item\n- other", id: "c1", quote: "- item" },
      "changing the document structure",
    ],
    [
      "a quote inside intraword emphasis",
      { body: "a*b*c", id: "c1", quote: "b" },
      "emphasis would become nothing",
    ],
    [
      "a quote whose markers would nest one emphasis inside another",
      { body: "*a*b*c*", id: "c1", quote: "a" },
      "changing the document structure",
    ],
    [
      "a quote inside a link destination",
      { body: "aaaa [x](aaaa)", id: "c1", quote: "aa", nth: 3 },
      "a link would change",
    ],
    [
      "a quote right after a backslash",
      { body: "a\\b", id: "c1", quote: "b" },
      "right after a backslash",
    ],
    [
      "a quote ending with a backslash",
      { body: "a\\ b", id: "c1", quote: "a\\" },
      "right after a backslash",
    ],
    [
      "a body ending inside a code fence",
      { body: "Text\n\n```\ncode", id: "c2", quote: "Text" },
      "Body ends inside a code fence",
    ],
  ])("rejects %s", (_, input, message) => {
    expectError(anchorComment(input), message);
  });
});
