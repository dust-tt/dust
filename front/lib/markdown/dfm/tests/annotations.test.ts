import type { DfmComment, DfmDocument } from "@app/lib/markdown/dfm";
import {
  dfmCommentSchema,
  dfmCommentsSchema,
  parseDfm,
  serializeDfm,
} from "@app/lib/markdown/dfm";
import {
  AT,
  BLOCK_LINE,
  DAPH,
  expectError,
  FIXTURE,
  FIXTURES,
  MESSAGE,
  SIMPLE_DOCUMENT,
  unwrap,
  withBlock,
  withMessage,
} from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("annotations block parsing", () => {
  it("accepts quoted and bare attribute values in any order", () => {
    const source = [
      'Hi :comment-start{id="c1"}there:comment-end{id=c1}',
      "",
      ":::annotations",
      "::comment{status=open id=c1}",
      `::message{at=${AT} name=Daph author="user:usr_1"}`,
      "Hello",
      ":::",
    ].join("\n");
    const document = unwrap(parseDfm(source));

    expect(document.comments[0].messages[0]).toEqual({
      author: { kind: "user", id: "usr_1", name: "Daph" },
      createdAt: AT,
      body: "Hello",
    });
  });

  it("accepts a leap day and a zone offset", () => {
    const source = withBlock(
      "::comment{id=c1 status=open}",
      "::message{author=user:u name=N at=2028-02-29T23:59:59+05:30}",
      "Hi"
    );

    expect(unwrap(parseDfm(source)).comments[0].messages[0].createdAt).toBe(
      "2028-02-29T23:59:59+05:30"
    );
  });

  it("round-trips a message whose code span crosses lines with a directive inside", () => {
    const document = withMessage({
      body: "Example `text\n::comment{id=example status=open}\nmore`",
    });
    const source = unwrap(serializeDfm(document));

    expect(unwrap(parseDfm(source))).toEqual(document);
  });

  it("treats an indented directive-looking line as message text", () => {
    const document = unwrap(
      parseDfm(
        withBlock(
          "::comment{id=c1 status=open}",
          MESSAGE,
          "Try this:",
          "  ::comment{id=c2 status=open}"
        )
      )
    );

    expect(document.comments[0].messages[0].body).toBe(
      "Try this:\n  ::comment{id=c2 status=open}"
    );
  });

  it("round-trips a message that mentions an agent", () => {
    const document = withMessage({
      body: ":mention[@dust]{sId=abc} can you refine this?",
    });
    const source = unwrap(serializeDfm(document));

    expect(source).toContain(
      "\n\n:mention[@dust]{sId=abc} can you refine this?\n"
    );
    expect(unwrap(parseDfm(source))).toEqual(document);
  });

  it("keeps directive-looking lines inside a fenced message body", () => {
    const document = unwrap(
      parseDfm(
        withBlock(
          "::comment{id=c1 status=open}",
          MESSAGE,
          "Reply like this:",
          "",
          "```",
          "::message{author=user:u name=N at=2026-01-01T00:00:00Z}",
          ":::",
          "```"
        )
      )
    );

    expect(document.comments[0].messages).toHaveLength(1);
    expect(document.comments[0].messages[0].body).toBe(
      "Reply like this:\n\n```\n::message{author=user:u name=N at=2026-01-01T00:00:00Z}\n:::\n```"
    );
  });

  it.each([
    [
      "a message before any comment",
      [`${MESSAGE}`],
      "Message outside a comment",
      BLOCK_LINE,
    ],
    [
      "a comment without message at the end",
      ["::comment{id=c1 status=open}"],
      'Comment "c1" has no message',
      BLOCK_LINE,
    ],
    [
      "a comment without message before the next one",
      ["::comment{id=c1 status=open}", "", "::comment{id=c2 status=open}"],
      'Comment "c1" has no message',
      BLOCK_LINE,
    ],
    [
      "a comment without id",
      ["::comment{status=open}"],
      "Comment without a valid id",
      BLOCK_LINE,
    ],
    [
      "a comment with an invalid status",
      ["::comment{id=c1 status=pending}"],
      "without a valid status",
      BLOCK_LINE,
    ],
    [
      "a duplicated comment",
      [
        "::comment{id=c1 status=open}",
        MESSAGE,
        "Hi",
        "::comment{id=c1 status=open}",
      ],
      'Duplicate comment "c1"',
      BLOCK_LINE + 3,
    ],
    [
      "an unknown attribute",
      ["::comment{id=c1 status=open foo=bar}"],
      'Unknown attribute "foo"',
      BLOCK_LINE,
    ],
    [
      "a duplicated attribute",
      ["::comment{id=c1 id=c2 status=open}"],
      'Duplicate attribute "id"',
      BLOCK_LINE,
    ],
    [
      "malformed attributes",
      ["::comment{id status=open}"],
      "Malformed attributes",
      BLOCK_LINE,
    ],
    [
      "a malformed directive",
      ["::comment {id=c1 status=open}"],
      "Malformed directive",
      BLOCK_LINE,
    ],
    [
      "an author without kind",
      [
        "::comment{id=c1 status=open}",
        `::message{author=daph name=D at=${AT}}`,
      ],
      'Message author must be "<kind>:<id>"',
      BLOCK_LINE + 1,
    ],
    [
      "an unknown author kind",
      [
        "::comment{id=c1 status=open}",
        `::message{author=bot:x name=N at=${AT}}`,
      ],
      'Unknown author kind "bot"',
      BLOCK_LINE + 1,
    ],
    [
      "an empty author id",
      [
        "::comment{id=c1 status=open}",
        `::message{author=user: name=N at=${AT}}`,
      ],
      "Invalid author id",
      BLOCK_LINE + 1,
    ],
    [
      "a message without name",
      ["::comment{id=c1 status=open}", `::message{author=user:u at=${AT}}`],
      "without a valid author name",
      BLOCK_LINE + 1,
    ],
    [
      "a date-only timestamp",
      [
        "::comment{id=c1 status=open}",
        "::message{author=user:u name=N at=2026-01-01}",
      ],
      "valid timestamp",
      BLOCK_LINE + 1,
    ],
    [
      "a timestamp without zone",
      [
        "::comment{id=c1 status=open}",
        "::message{author=user:u name=N at=2026-01-01T00:00:00}",
      ],
      "valid timestamp",
      BLOCK_LINE + 1,
    ],
    [
      "an impossible calendar date",
      [
        "::comment{id=c1 status=open}",
        "::message{author=user:u name=N at=2026-02-30T12:00:00Z}",
      ],
      "valid timestamp",
      BLOCK_LINE + 1,
    ],
    [
      "a February 29 outside a leap year",
      [
        "::comment{id=c1 status=open}",
        "::message{author=user:u name=N at=2027-02-29T12:00:00Z}",
      ],
      "valid timestamp",
      BLOCK_LINE + 1,
    ],
    [
      "an out-of-range hour",
      [
        "::comment{id=c1 status=open}",
        "::message{author=user:u name=N at=2026-01-01T24:00:00Z}",
      ],
      "valid timestamp",
      BLOCK_LINE + 1,
    ],
    [
      "an out-of-range zone offset",
      [
        "::comment{id=c1 status=open}",
        "::message{author=user:u name=N at=2026-01-01T12:00:00+25:00}",
      ],
      "valid timestamp",
      BLOCK_LINE + 1,
    ],
    [
      "text outside a message",
      ["::comment{id=c1 status=open}", "stray text"],
      "Text outside a comment message",
      BLOCK_LINE + 1,
    ],
    [
      "an unknown directive",
      ["::suggestion{id=s1}"],
      'Unknown directive "suggestion"',
      BLOCK_LINE,
    ],
  ])("rejects %s with its line", (_, lines, message, line) => {
    expectError(parseDfm(withBlock(...lines)), message, line);
  });
});

const INVALID_STATUS_DOCUMENT: DfmDocument = {
  ...SIMPLE_DOCUMENT,
  comments: [
    {
      ...SIMPLE_DOCUMENT.comments[0],
      // @ts-expect-error a status outside the union, on purpose
      status: "pending",
    },
  ],
};

describe("annotations block serialization", () => {
  // Serialization checks owned by annotations.ts.
  it.each([
    [
      "a comment without message",
      {
        ...SIMPLE_DOCUMENT,
        comments: [{ id: "c1", status: "open", messages: [] }],
      },
      'Comment "c1" has no message',
    ],
    [
      "an invalid comment id",
      {
        ...SIMPLE_DOCUMENT,
        comments: [{ ...SIMPLE_DOCUMENT.comments[0], id: "c 1" }],
      },
      'Comment "c 1": Comment without a valid id',
    ],
    [
      "an invalid status",
      INVALID_STATUS_DOCUMENT,
      "Comment without a valid status",
    ],
    [
      "a message body with a directive line",
      withMessage({ body: "Looks like\n::comment{id=x status=open}" }),
      "cannot contain a directive line",
    ],
    [
      "a message body ending inside a code fence",
      withMessage({ body: "```\ncode" }),
      "cannot end inside a code fence",
    ],
    [
      "a padded message body",
      withMessage({ body: "\nPadded\n" }),
      "cannot start or end with blank lines",
    ],
    [
      "a message body with a carriage return",
      withMessage({ body: "one\r\ntwo" }),
      "cannot contain a carriage return",
    ],
    [
      "an author name with a quote",
      withMessage({ author: { ...DAPH, name: 'Daph "the" Dev' } }),
      "without a valid author name",
    ],
    [
      "an author name with a brace",
      withMessage({ author: { ...DAPH, name: "Daph}" } }),
      "without a valid author name",
    ],
    [
      "an author name with a newline",
      withMessage({ author: { ...DAPH, name: "Daph\nPopin" } }),
      "without a valid author name",
    ],
    [
      "an author id with a space",
      withMessage({ author: { ...DAPH, id: "usr daph" } }),
      "Invalid author id",
    ],
    [
      "an unknown author kind",
      withMessage({
        author: {
          ...DAPH,
          // @ts-expect-error a kind outside the union, on purpose
          kind: "bot",
        },
      }),
      'Unknown author kind "bot"',
    ],
    [
      "a quoted timestamp",
      withMessage({ createdAt: '"2026"' }),
      "without a valid timestamp",
    ],
    [
      "a date-only timestamp",
      withMessage({ createdAt: "2026-01-01" }),
      "without a valid timestamp",
    ],
    [
      "an impossible calendar date",
      withMessage({ createdAt: "2026-04-31T00:00:00.000Z" }),
      "without a valid timestamp",
    ],
  ] satisfies [
    string,
    DfmDocument,
    string,
  ][])("refuses to serialize %s", (_, document, message) => {
    expectError(serializeDfm(document), message);
  });
});

describe("dfmCommentSchema", () => {
  it("reads back every thread the codec parses, unchanged", () => {
    for (const { source } of FIXTURES) {
      const { comments } = unwrap(parseDfm(source));

      expect(z.array(dfmCommentSchema).parse(comments)).toEqual(comments);
    }
  });

  it.each([
    ["a thread", (comment: DfmComment) => ({ ...comment, extra: 1 })],
    [
      "a message",
      (comment: DfmComment) => ({
        ...comment,
        messages: [{ ...comment.messages[0], extra: 1 }],
      }),
    ],
    [
      "an author",
      (comment: DfmComment) => ({
        ...comment,
        messages: [
          {
            ...comment.messages[0],
            author: { ...comment.messages[0].author, extra: 1 },
          },
        ],
      }),
    ],
  ])("refuses an unknown key on %s instead of dropping it", (_, withExtra) => {
    const [comment] = unwrap(parseDfm(FIXTURE)).comments;

    expect(dfmCommentSchema.safeParse(withExtra(comment)).success).toBe(false);
  });
});

describe("dfmCommentsSchema", () => {
  it("accepts every thread list the codec parses", () => {
    for (const { source } of FIXTURES) {
      const { comments } = unwrap(parseDfm(source));

      expect(dfmCommentsSchema.parse(comments)).toEqual(comments);
    }
  });

  it.each([
    [
      "an invalid id",
      (comment: DfmComment) => ({ ...comment, id: "not an id" }),
    ],
    ["no message", (comment: DfmComment) => ({ ...comment, messages: [] })],
    [
      "an invalid timestamp",
      (comment: DfmComment) => ({
        ...comment,
        messages: [{ ...comment.messages[0], createdAt: "yesterday" }],
      }),
    ],
    [
      "an invalid author name",
      (comment: DfmComment) => ({
        ...comment,
        messages: [
          {
            ...comment.messages[0],
            author: { ...comment.messages[0].author, name: "" },
          },
        ],
      }),
    ],
  ])("refuses a thread with %s, which serializeDfm would", (_, broken) => {
    const [comment] = unwrap(parseDfm(FIXTURE)).comments;

    expect(dfmCommentsSchema.safeParse([broken(comment)]).success).toBe(false);
  });

  it("refuses duplicate thread ids", () => {
    const [comment] = unwrap(parseDfm(FIXTURE)).comments;

    expect(dfmCommentsSchema.safeParse([comment, comment]).success).toBe(false);
  });
});
