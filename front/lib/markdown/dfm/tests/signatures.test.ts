import type { DfmDocument } from "@app/lib/markdown/dfm";
import {
  messageSignaturePayload,
  parseDfm,
  serializeDfm,
} from "@app/lib/markdown/dfm";
import {
  AT,
  DAPH,
  expectError,
  unwrap,
  withBlock,
} from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { describe, expect, it } from "vitest";

const SIG = "c2lnbmVkLWJ5LXRoZS1zZXJ2ZXI";

describe("message signatures in the annotations block", () => {
  it("reads sig into the message and writes it back", () => {
    const source = withBlock(
      "::comment{id=c1 status=open}",
      "",
      `::message{author=user:usr_daph name="Daph" at=${AT} sig=${SIG}}`,
      "",
      "Signed."
    );
    const document = unwrap(parseDfm(source));

    expect(document.comments[0].messages[0]).toEqual({
      author: DAPH,
      createdAt: AT,
      body: "Signed.",
      signature: SIG,
    });
    expect(unwrap(serializeDfm(document))).toContain(` sig=${SIG}}`);
  });

  it("leaves no signature key on an unsigned message", () => {
    const document = unwrap(
      parseDfm(
        withBlock(
          "::comment{id=c1 status=open}",
          `::message{author=user:usr_daph name="Daph" at=${AT}}`,
          "Unsigned."
        )
      )
    );

    expect(Object.hasOwn(document.comments[0].messages[0], "signature")).toBe(
      false
    );
  });

  it("refuses a signature outside base64url", () => {
    expectError(
      parseDfm(
        withBlock(
          "::comment{id=c1 status=open}",
          `::message{author=user:usr_daph name="Daph" at=${AT} sig=a+b/c=}`,
          "Bad."
        )
      ),
      "invalid signature"
    );
    const document: DfmDocument = {
      frontMatter: null,
      body: "",
      comments: [
        {
          id: "c1",
          status: "open",
          messages: [
            { author: DAPH, createdAt: AT, body: "Bad.", signature: "a b" },
          ],
        },
      ],
    };
    expectError(serializeDfm(document), "invalid signature");
  });
});

describe("messageSignaturePayload", () => {
  const previous = { author: DAPH, createdAt: AT, body: "Before" };
  const base = {
    workspaceId: "w1",
    filePath: "pod-s1/notes.md",
    commentId: "c1",
    previous,
    message: { author: DAPH, createdAt: AT, body: "Hello" },
  };

  it.each([
    ["workspace", { ...base, workspaceId: "w2" }],
    ["file", { ...base, filePath: "pod-s1/copy.md" }],
    ["comment", { ...base, commentId: "c2" }],
    ["previous message", { ...base, previous: { ...previous, body: "Other" } }],
    ["absence of a previous message", { ...base, previous: null }],
    [
      "author",
      { ...base, message: { ...base.message, author: { ...DAPH, id: "u2" } } },
    ],
    [
      "author kind",
      {
        ...base,
        message: {
          ...base.message,
          author: { ...DAPH, kind: "agent" as const },
        },
      },
    ],
    [
      "name",
      {
        ...base,
        message: { ...base.message, author: { ...DAPH, name: "D" } },
      },
    ],
    ["timestamp", { ...base, message: { ...base.message, createdAt: "x" } }],
    ["body", { ...base, message: { ...base.message, body: "Hello!" } }],
  ])("changes with the %s", (_, changed) => {
    expect(messageSignaturePayload(changed)).not.toBe(
      messageSignaturePayload(base)
    );
  });

  it("does not let one field's text pass for another's", () => {
    expect(
      messageSignaturePayload({ ...base, workspaceId: "w1", commentId: "c1x" })
    ).not.toBe(
      messageSignaturePayload({ ...base, workspaceId: "w1c", commentId: "1x" })
    );
  });
});
