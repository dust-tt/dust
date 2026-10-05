import { extractAnchors, parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import {
  expectError,
  MESSAGE,
  SIMPLE_DOCUMENT,
  unwrap,
} from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { describe, expect, it } from "vitest";

describe("extractAnchors", () => {
  it("returns the text without directives and offsets for overlapping anchors", () => {
    const { text, anchors } = unwrap(
      extractAnchors(
        "Snow :comment-start{id=c1}loosens :comment-start{id=c2}at dawn:comment-end{id=c1} early:comment-end{id=c2}."
      )
    );

    expect(text).toBe("Snow loosens at dawn early.");
    expect(anchors).toEqual([
      { id: "c1", start: 5, end: 20 },
      { id: "c2", start: 13, end: 26 },
    ]);
    expect(text.slice(5, 20)).toBe("loosens at dawn");
    expect(text.slice(13, 26)).toBe("at dawn early");
  });

  it("returns anchors in document order, not closing order", () => {
    const { anchors } = unwrap(
      extractAnchors(
        ":comment-start{id=outer}a :comment-start{id=inner}b:comment-end{id=inner} c:comment-end{id=outer} :comment-start{id=last}d:comment-end{id=last}"
      )
    );

    expect(anchors.map((anchor) => anchor.id)).toEqual([
      "outer",
      "inner",
      "last",
    ]);
  });

  it("lets one anchor span several paragraphs and a list", () => {
    const body = [
      "# Title",
      "",
      ":comment-start{id=c1}First paragraph.",
      "",
      "- item one",
      "- item two",
      "",
      "Last paragraph.",
      ":comment-end{id=c1}",
    ].join("\n");
    const { text, anchors } = unwrap(extractAnchors(body));

    expect(anchors).toEqual([{ id: "c1", start: 9, end: text.length }]);
    expect(text.slice(anchors[0].start)).toBe(
      "First paragraph.\n\n- item one\n- item two\n\nLast paragraph.\n"
    );

    const source = `${body}\n\n:::annotations\n::comment{id=c1 status=open}\n${MESSAGE}\nToo long?\n:::\n`;
    expect(unwrap(parseDfm(source)).body).toBe(body);
  });

  it("treats anchor syntax inside fenced and inline code as text", () => {
    const body = [
      "Write `:comment-start{id=c1}` around the text, like this:",
      "",
      "```md",
      ":comment-start{id=c9}x:comment-end{id=c9}",
      ":::annotations",
      "::comment{id=c9 status=open}",
      "```",
      "",
      "~~~",
      ":comment-start{id=c8",
      "~~~",
      "",
      "Real :comment-start{id=c1}anchor:comment-end{id=c1}.",
    ].join("\n");
    const source = `${body}\n\n:::annotations\n::comment{id=c1 status=open}\n${MESSAGE}\nHi\n:::\n`;
    const document = unwrap(parseDfm(source));

    expect(document.body).toBe(body);
    expect(document.comments.map((comment) => comment.id)).toEqual(["c1"]);

    const { text, anchors } = unwrap(extractAnchors(document.body));
    expect(anchors).toEqual([
      {
        id: "c1",
        start: text.indexOf("anchor"),
        end: text.indexOf("anchor") + 6,
      },
    ]);
    expect(text).toContain("```md\n:comment-start{id=c9}x:comment-end{id=c9}");
  });

  it("only treats complete backtick runs as code", () => {
    const body =
      "Use ``example :comment-start{id=c1}x:comment-end{id=c1}` here, and \\`not code :comment-start{id=c2}y:comment-end{id=c2}` either.";
    const { anchors } = unwrap(extractAnchors(body));

    expect(anchors.map((anchor) => anchor.id)).toEqual(["c1", "c2"]);
  });

  it("does not let a directive inside code swallow the real one after it", () => {
    const { text, anchors } = unwrap(
      extractAnchors(
        "`:comment-start{` :comment-start{id=c1}x:comment-end{id=c1}"
      )
    );

    expect(text).toBe("`:comment-start{` x");
    expect(anchors).toEqual([{ id: "c1", start: 18, end: 19 }]);
  });

  it("gives the earliest opener the whole span when backtick lengths mix", () => {
    const body =
      "`before `` :comment-start{id=c1}middle:comment-end{id=c1} `` after` then :comment-start{id=c2}live:comment-end{id=c2}";
    const { text, anchors } = unwrap(extractAnchors(body));

    expect(anchors.map((anchor) => anchor.id)).toEqual(["c2"]);
    expect(text.startsWith("`before `` :comment-start{id=c1}")).toBe(true);
  });

  it("keeps a quoted fence line inside an open fence as content", () => {
    const body =
      "```\n> ```\n:comment-start{id=c1}x:comment-end{id=c1}\n```\n\n:comment-start{id=c2}live:comment-end{id=c2}";
    const { anchors } = unwrap(extractAnchors(body));

    expect(anchors.map((anchor) => anchor.id)).toEqual(["c2"]);
  });

  it("recognizes fences inside blockquotes", () => {
    const { text, anchors } = unwrap(
      extractAnchors("> ~~~\n> :comment-start{id=c1}example\n> ~~~")
    );

    expect(anchors).toEqual([]);
    expect(text).toBe("> ~~~\n> :comment-start{id=c1}example\n> ~~~");
  });

  it("lets a backtick preceded by an escaped backslash open a span", () => {
    const body =
      "Use \\\\`:comment-start{id=c1}x:comment-end{id=c1}` here, not :comment-start{id=c2}this:comment-end{id=c2}.";
    const { anchors } = unwrap(extractAnchors(body));

    expect(anchors.map((anchor) => anchor.id)).toEqual(["c2"]);
  });

  it("does not let a heading's trailing backtick open a span into the next block", () => {
    expectError(
      extractAnchors("# Heading `\n:comment-start{id=c1}text`"),
      'Comment anchor "c1" is never closed',
      2
    );
  });

  it("keeps a span open across a lazy continuation line that looks like a list item", () => {
    const { anchors } = unwrap(
      extractAnchors(
        "Use `x\n2. :comment-start{id=c1}y:comment-end{id=c1}` here, then :comment-start{id=c2}live:comment-end{id=c2}"
      )
    );

    expect(anchors.map((anchor) => anchor.id)).toEqual(["c2"]);
  });

  it("treats indented code blocks as code", () => {
    const { anchors } = unwrap(
      extractAnchors(
        "Para\n\n    :comment-start{id=c1}code:comment-end{id=c1}\n\n:comment-start{id=c2}live:comment-end{id=c2}"
      )
    );

    expect(anchors.map((anchor) => anchor.id)).toEqual(["c2"]);
  });

  it("ends a code span at a heading, so an anchor there is live", () => {
    expectError(
      extractAnchors("Before `\n# :comment-start{id=c1}example`"),
      'Comment anchor "c1" is never closed',
      2
    );
  });

  it("treats a code span crossing a line break as text", () => {
    const body =
      "Type `:comment-start{id=c1}\nsomething` to start.\n\nNot code: :comment-start{id=c1}x:comment-end{id=c1}";
    const { text, anchors } = unwrap(extractAnchors(body));

    expect(anchors).toHaveLength(1);
    expect(text.startsWith("Type `:comment-start{id=c1}\nsomething`")).toBe(
      true
    );
  });

  it("treats an escaped anchor as text, unless the backslash is itself escaped", () => {
    expectError(
      extractAnchors("a \\:comment-start{id=c1}b:comment-end{id=c1}"),
      'Comment anchor "c1" ends before it starts'
    );
    const { text, anchors } = unwrap(
      extractAnchors("\\\\:comment-start{id=c1}b:comment-end{id=c1}")
    );
    expect(text).toBe("\\\\b");
    expect(anchors).toEqual([{ id: "c1", start: 2, end: 3 }]);
  });

  it("scans a body nested thousands of levels deep", () => {
    const deep = `${">".repeat(10_000)} :comment-start{id=c1}deep:comment-end{id=c1}`;

    expect(unwrap(extractAnchors(deep)).anchors).toHaveLength(1);
  });

  it.each([
    [
      "an anchor that is never closed",
      "Line one\n\n:comment-start{id=c1}open",
      'Comment anchor "c1" is never closed',
      3,
    ],
    [
      "an anchor without a thread",
      "Hi\n\nHi :comment-start{id=c1}there:comment-end{id=c1}\n",
      'Comment anchor "c1" has no comment thread',
      3,
    ],
    [
      "an end anchor before its start, after front matter",
      "---\na: b\n---\n\nFirst\n\nOops:comment-end{id=c1}",
      'Comment anchor "c1" ends before it starts',
      7,
    ],
    [
      "an empty anchor",
      ":comment-start{id=c1}:comment-end{id=c1}",
      'Comment anchor "c1" covers no text',
      1,
    ],
    [
      "a duplicated anchor",
      ":comment-start{id=c1}a:comment-end{id=c1} :comment-start{id=c1}b:comment-end{id=c1}",
      'Duplicate comment anchor "c1"',
      1,
    ],
    [
      "an anchor with an invalid id",
      ':comment-start{id="a b"}x:comment-end{id="a b"}',
      "Comment anchor without a valid id",
      1,
    ],
    [
      "an anchor with an unknown attribute",
      ":comment-start{id=c1 by=daph}x:comment-end{id=c1}",
      'Unknown attribute "by"',
      1,
    ],
    [
      "an anchor missing its closing brace",
      "Hi\n:comment-start{id=c1 there",
      "Malformed comment anchor",
      2,
    ],
    [
      "an anchor with a space before its attributes",
      ":comment-start {id=c1}x:comment-end {id=c1}",
      "Malformed comment anchor",
      1,
    ],
    [
      "an anchor with multiline attributes",
      ":comment-start{\nid=c1}x\n:comment-end{id=c2}",
      "Malformed comment anchor",
      1,
    ],
  ])("rejects %s with its line", (_, source, message, line) => {
    expectError(parseDfm(source), message, line);
  });

  // Serialization checks owned by anchors.ts.
  it.each([
    [
      "an anchor without thread",
      { ...SIMPLE_DOCUMENT, comments: [] },
      'Comment anchor "c1" has no comment thread',
    ],
    [
      "a malformed anchor",
      {
        ...SIMPLE_DOCUMENT,
        body: `${SIMPLE_DOCUMENT.body} :comment-end {id=c1}`,
      },
      "Malformed comment anchor",
    ],
  ])("refuses to serialize %s", (_, document, message) => {
    expectError(serializeDfm(document), message);
  });
});
