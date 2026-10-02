import type { DfmDocument } from "@app/lib/markdown/dfm";
import { extractAnchors, parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import {
  AT,
  DAPH,
  DUST,
  expectError,
  FIXTURE,
  FIXTURES,
  MESSAGE,
  SIMPLE_DOCUMENT,
  unwrap,
  withBlock,
  withMessage,
  YUKA,
} from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { describe, expect, it } from "vitest";

describe("parseDfm", () => {
  it("parses the representative fixture", () => {
    const document = unwrap(parseDfm(FIXTURE));

    expect(document.frontMatter).toBe("title: The Pencil Case Manifesto");
    expect(document.body.startsWith("# The Pencil Case Manifesto\n\n")).toBe(
      true
    );
    expect(document.body.endsWith(":comment-end{id=c3}")).toBe(true);
    expect(document.comments.map((c) => [c.id, c.status])).toEqual([
      ["c1", "open"],
      ["c2", "open"],
      ["c3", "resolved"],
      ["c4", "resolved"],
    ]);

    const [c1, c2, , c4] = document.comments;
    expect(c1.messages).toEqual([
      {
        author: YUKA,
        createdAt: AT,
        body: "Three things? My pencil case has eleven pens and a tiny stapler.",
      },
    ]);
    expect(c2.messages[1].author).toEqual(DUST);
    expect(c2.messages[1].body).toBe(
      "Most fountain pen owners would say feature. A little ink on the fingers is how you tell a writer from a typist.\n\nSource: an entirely unscientific poll of the Dust office."
    );
    // A thread may outlive its anchor.
    expect(c4.messages).toHaveLength(1);

    const { anchors } = unwrap(extractAnchors(document.body));
    expect(anchors.map((anchor) => anchor.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("treats plain Markdown as a body without front matter or comments", () => {
    const document = unwrap(parseDfm("# Title\n\nSome text.\n\n"));

    expect(document).toEqual({
      frontMatter: null,
      body: "# Title\n\nSome text.",
      comments: [],
    });
  });

  it.each([
    ["an empty file", "", ""],
    ["front matter only", "---\ntitle: x\n---\n", ""],
    [
      "front matter followed by annotations",
      `---\ntitle: x\n---\n\n:::annotations\n::comment{id=c1 status=open}\n${MESSAGE}\nHi\n:::\n`,
      "",
    ],
    [
      "unknown directives, fences and a table",
      "::mention[@dust]{sId=abc}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n:::\n\n::foo{x=1}",
      "::mention[@dust]{sId=abc}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n:::\n\n::foo{x=1}",
    ],
  ])("keeps the body opaque with %s", (_, source, body) => {
    expect(unwrap(parseDfm(source)).body).toBe(body);
  });

  it("refuses a source outside the input bounds before parsing it", () => {
    expectError(
      parseDfm(`Body\n${">".repeat(300)} deep`),
      "nests deeper than",
      2
    );
  });

  it("drops a leading byte order mark", () => {
    const document = unwrap(parseDfm(`\uFEFF${FIXTURE}`));

    expect(document).toEqual(unwrap(parseDfm(FIXTURE)));
  });

  it("keeps an annotations opener inside a multi-line code span as body", () => {
    const source = "Example `text\n:::annotations\n:::\n`";
    const document = unwrap(parseDfm(source));

    expect(document.body).toBe(source);
    expect(document.comments).toEqual([]);
  });

  it("rejects an annotations opener with attributes", () => {
    expectError(
      parseDfm(
        `Body\n\n:::annotations{extra=x}\n::comment{id=c1 status=open}\n${MESSAGE}\nHi\n:::\n`
      ),
      "The annotations block opener takes no attributes",
      3
    );
  });

  it("normalizes CRLF line endings", () => {
    const document = unwrap(parseDfm(FIXTURE.replace(/\n/g, "\r\n")));

    expect(document).toEqual(unwrap(parseDfm(FIXTURE)));
  });

  it("rejects a carriage return outside a line ending", () => {
    expectError(
      parseDfm("Body\rmore\n"),
      "Carriage return outside a line ending",
      1
    );
  });

  it("ignores annotation fences inside the front matter", () => {
    const document = unwrap(parseDfm("---\n:::annotations\n---\n\nBody\n"));

    expect(document.frontMatter).toBe(":::annotations");
    expect(document.body).toBe("Body");
  });

  it("treats a leading fence without a closing one as body", () => {
    const document = unwrap(parseDfm("---\n\nText\n"));

    expect(document).toEqual({
      frontMatter: null,
      body: "---\n\nText",
      comments: [],
    });
    expect(unwrap(serializeDfm(document))).toBe("---\n\nText\n");
  });

  it("rejects a block that is not closed or not last", () => {
    expectError(
      parseDfm("Body\n\n:::annotations\n::comment{id=c1 status=open}\n"),
      "Unterminated annotations block",
      3
    );
    expectError(
      parseDfm(
        `${withBlock("::comment{id=c1 status=open}", MESSAGE, "Hi")}\n\nTrailing`
      ),
      "Content after the annotations block",
      9
    );
    expectError(
      parseDfm(
        `${withBlock("::comment{id=c9 status=open}", MESSAGE, "x")}\n\n:::annotations\n::comment{id=c1 status=open}\n${MESSAGE}\nHi\n:::\n`
      ),
      "Annotations block must be the last block",
      3
    );
  });

  it("tolerates trailing whitespace on fences and directives", () => {
    const source = `Body\n\n:::annotations  \n::comment{id=c1 status=open} \n${MESSAGE}\t\nHi\n::: \n`;

    expect(unwrap(parseDfm(source)).comments).toHaveLength(1);
  });
});

describe("serializeDfm", () => {
  it.each(
    FIXTURES.map(({ name, source }) => [name, source])
  )("reproduces fixture %s byte for byte", (_, source) => {
    const document = unwrap(parseDfm(source));

    expect(unwrap(serializeDfm(document))).toBe(source);
  });

  it.each([
    ["an empty document", { frontMatter: null, body: "", comments: [] }, ""],
    [
      "front matter only",
      { frontMatter: "title: x", body: "", comments: [] },
      "---\ntitle: x\n---\n",
    ],
    [
      "a body only",
      { frontMatter: null, body: "# Title\n\nText.", comments: [] },
      "# Title\n\nText.\n",
    ],
    [
      "comments only",
      { ...SIMPLE_DOCUMENT, body: "" },
      `:::annotations\n::comment{id=c1 status=open}\n\n${MESSAGE}\n\nHi\n:::\n`,
    ],
  ] satisfies [
    string,
    DfmDocument,
    string,
  ][])("serializes %s and parses it back", (_, document, expected) => {
    const source = unwrap(serializeDfm(document));

    expect(source).toBe(expected);
    expect(unwrap(parseDfm(source))).toEqual(document);
  });

  it("round-trips an empty message body", () => {
    const document: DfmDocument = {
      ...SIMPLE_DOCUMENT,
      comments: [
        {
          id: "c1",
          status: "resolved",
          messages: [
            { author: DAPH, createdAt: AT, body: "" },
            {
              author: DUST,
              createdAt: "2026-09-25T14:17:00.000Z",
              body: "Done",
            },
          ],
        },
      ],
    };
    const source = unwrap(serializeDfm(document));

    expect(unwrap(parseDfm(source))).toEqual(document);
  });

  it.each([
    [
      "no blank lines around blocks",
      `---\ntitle: x\n---\nBody\n:::annotations\n::comment{id=c1 status=open}\n${MESSAGE}\nHi\n:::`,
    ],
    [
      "reordered attributes and extra blank lines",
      `Body\n\n\n\n:::annotations\n\n::comment{status=open id=c1}\n\n\n::message{at=${AT} author=user:usr_daph name="Daph"}\n\n\nHi\n\n\n:::\n\n`,
    ],
    ["CRLF line endings", FIXTURE.replace(/\n/g, "\r\n")],
  ])("canonicalizes a source with %s in one pass", (_, source) => {
    const first = unwrap(serializeDfm(unwrap(parseDfm(source))));
    const second = unwrap(serializeDfm(unwrap(parseDfm(first))));

    expect(second).toBe(first);
  });

  it("serializes a body ending with a fence closed inside a blockquote", () => {
    const document = {
      ...SIMPLE_DOCUMENT,
      body: `${SIMPLE_DOCUMENT.body}\n\n> \`\`\`\n> code\n> \`\`\``,
    };

    expect(unwrap(parseDfm(unwrap(serializeDfm(document))))).toEqual(document);
  });

  // Serialization checks owned by document.ts.
  it.each([
    [
      "a body ending with a newline",
      { ...SIMPLE_DOCUMENT, body: `${SIMPLE_DOCUMENT.body}\n` },
      "Body cannot end with a newline",
    ],
    [
      "a body starting with a fence and containing another",
      { ...SIMPLE_DOCUMENT, body: `---\n${SIMPLE_DOCUMENT.body}\n---` },
      "Body cannot start with a front matter fence when a later line is one",
    ],
    [
      "a body starting with a fence and containing another inside code",
      { frontMatter: null, body: "---\nText\n\n```\n---\n```", comments: [] },
      "Body cannot start with a front matter fence when a later line is one",
    ],
    [
      "a body starting with a fence and a message containing one",
      {
        ...withMessage({ body: "Before\n---\nAfter" }),
        body: `---\n${SIMPLE_DOCUMENT.body}`,
      },
      "Body cannot start with a front matter fence when a later line is one",
    ],
    [
      "a body ending inside a code fence when comments exist",
      { ...SIMPLE_DOCUMENT, body: `${SIMPLE_DOCUMENT.body}\n\n\`\`\`\ncode` },
      "Body cannot end inside a code fence",
    ],
    [
      "a body containing an annotations opener",
      {
        ...SIMPLE_DOCUMENT,
        body: `${SIMPLE_DOCUMENT.body}\n\n:::annotations  `,
      },
      "Body cannot contain an annotations block opener",
    ],
    [
      "a body with a carriage return",
      { ...SIMPLE_DOCUMENT, body: `a\r\n${SIMPLE_DOCUMENT.body}` },
      "Body cannot contain a carriage return",
    ],
    [
      "front matter containing a fence",
      { ...SIMPLE_DOCUMENT, frontMatter: "a: b\n---\nc: d" },
      "Front matter cannot contain a fence line",
    ],
    [
      "front matter with a carriage return",
      { ...SIMPLE_DOCUMENT, frontMatter: "a: b\r" },
      "Front matter cannot contain a carriage return",
    ],
  ] satisfies [
    string,
    DfmDocument,
    string,
  ][])("rejects %s", (_, document, message) => {
    expectError(serializeDfm(document), message);
  });
});
