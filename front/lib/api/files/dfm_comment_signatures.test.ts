// @vitest-environment node: signs with node:crypto and checks with WebCrypto, as browsers do.

import { generateKeyPairSync, sign, verify } from "node:crypto";
import { documentSchema } from "@app/components/editor/document/content";
import { loadDfm } from "@app/components/editor/document/dfm_persistence";
import { getCommentedTexts } from "@app/components/editor/document/DocumentComments";
import { validateCommentSignatures } from "@app/lib/api/files/dfm_comment_signatures";
import { createDfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { DfmMessage } from "@app/lib/markdown/dfm";
import { messageSignaturePayload } from "@app/lib/markdown/dfm";
import { describe, expect, it } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64url");
const AT = "2026-10-05T12:00:00.000Z";
const PATH = "pod-s1/notes.md";
const CONTEXT = {
  workspaceId: "w_1",
  filePath: PATH,
  userId: "usr_tom",
  verify: (payload: string, signature: string) =>
    verify(
      null,
      Buffer.from(payload, "utf8"),
      publicKey,
      Buffer.from(signature, "base64url")
    ),
};

/** A message as the server signs it when posted after `earlier` in thread `commentId`. */
function signedMessage(
  commentId: string,
  earlier: DfmMessage[],
  message: Omit<DfmMessage, "signature">,
  filePath = PATH
): DfmMessage {
  return {
    ...message,
    signature: sign(
      null,
      Buffer.from(
        messageSignaturePayload({
          workspaceId: "w_1",
          filePath,
          commentId,
          position: earlier.length,
          previous: earlier.at(-1) ?? null,
          message,
        }),
        "utf8"
      ),
      privateKey
    ).toString("base64url"),
  };
}

const TOM_MESSAGE = {
  author: { kind: "user" as const, id: "usr_tom", name: "Tom Draier" },
  createdAt: AT,
  body: "Looks good.",
};
const TOM: DfmMessage = signedMessage("c1", [], TOM_MESSAGE);

const line = ({ author, createdAt, body, signature }: DfmMessage) =>
  `::message{author=${author.kind}:${author.id} name="${author.name}" at=${createdAt}${signature ? ` sig=${signature}` : ""}}\n\n${body}\n`;

const file = (...messages: DfmMessage[]) =>
  `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n${messages.map(line).join("\n")}:::\n`;

const validate = (previous: string | null, next: string) =>
  validateCommentSignatures({ previous, next }, CONTEXT);

describe("validateCommentSignatures", () => {
  it("accepts a new message the server signed for the saving user", async () => {
    expect(validate(file(), file(TOM)).isOk()).toBe(true);

    const browserVerify = await createDfmMessageVerifier({
      publicKey: PUBLIC_KEY,
      workspaceId: "w_1",
      filePath: PATH,
    });
    expect(await browserVerify("c1", [TOM], 0)).toBe(true);
    expect(await browserVerify("c1", [{ ...TOM, body: "Looks bad." }], 0)).toBe(
      false
    );
    expect(await browserVerify("c1", [TOM, TOM], 1)).toBe(false);

    const otherFileVerify = await createDfmMessageVerifier({
      publicKey: PUBLIC_KEY,
      workspaceId: "w_1",
      filePath: "pod-s1/copy.md",
    });
    expect(await otherFileVerify("c1", [TOM], 0)).toBe(false);
  });

  it.each([
    ["has no signature", { ...TOM, signature: undefined }],
    ["has a signature for other text", { ...TOM, body: "Looks bad." }],
    [
      "has a signature from another key",
      { ...TOM, signature: "AAAA" + TOM.signature?.slice(4) },
    ],
    [
      "was signed for another file",
      signedMessage("c1", [], TOM_MESSAGE, "pod-s1/copy.md"),
    ],
  ])("refuses a new message from the user that %s", (_, message) => {
    const result = validate(file(), file(message));

    expect(result.isErr() && result.error.code).toBe("unsigned_message");
  });

  it.each([
    ["another user", "user", "usr_yuka"],
    ["an agent", "agent", "dust"],
  ] as const)("refuses a new message attributed to %s", (_, kind, id) => {
    const result = validate(
      file(),
      file(
        signedMessage("c1", [], {
          author: { kind, id, name: "X" },
          createdAt: AT,
          body: "Hi",
        })
      )
    );

    expect(result.isErr() && result.error.code).toBe("foreign_message");
  });

  it("refuses new messages when no user is saving", () => {
    const result = validateCommentSignatures(
      { previous: null, next: file(TOM) },
      { ...CONTEXT, userId: null }
    );

    expect(result.isErr()).toBe(true);
  });

  it("accepts stored messages as they were, signed or not", () => {
    const agent: DfmMessage = {
      author: { kind: "agent", id: "dust", name: "@dust" },
      createdAt: AT,
      body: "Unsigned.",
    };
    const stored = file(TOM, agent);

    expect(validate(stored, stored).isOk()).toBe(true);
  });

  it("refuses a stored message whose signature changed", () => {
    const agent: DfmMessage = {
      author: { kind: "agent", id: "dust", name: "@dust" },
      createdAt: AT,
      body: "Unsigned.",
    };

    const added = validate(
      file(TOM, agent),
      file(TOM, { ...agent, signature: TOM.signature })
    );
    const removed = validate(
      file(TOM, agent),
      file({ ...TOM, signature: undefined }, agent)
    );

    expect(added.isErr() && added.error.code).toBe("altered_message");
    expect(removed.isErr() && removed.error.code).toBe("altered_message");
  });

  it("treats an edited message of someone else as new and refuses it", () => {
    const yuka: DfmMessage = {
      author: { kind: "user", id: "usr_yuka", name: "Yuka" },
      createdAt: AT,
      body: "Mine.",
    };

    expect(
      validate(file(yuka), file({ ...yuka, body: "Edited." })).isErr()
    ).toBe(true);
  });

  it("accepts deleting threads and messages", () => {
    const yuka: DfmMessage = {
      author: { kind: "user", id: "usr_yuka", name: "Yuka" },
      createdAt: AT,
      body: "Keep me.",
    };

    expect(validate(file(yuka, TOM), file(yuka)).isOk()).toBe(true);
  });

  describe("thread order", () => {
    const question = signedMessage("c1", [], {
      author: { kind: "user", id: "usr_yuka", name: "Yuka" },
      createdAt: AT,
      body: "Shall we keep section 3?",
    });
    const agreed = signedMessage("c1", [question], {
      author: { kind: "user", id: "usr_daph", name: "Daph" },
      createdAt: AT,
      body: "Agreed.",
    });
    const stored = file(question, agreed);

    it("accepts a reply signed after the thread's last message", () => {
      const reply = signedMessage("c1", [question, agreed], TOM_MESSAGE);

      expect(validate(stored, file(question, agreed, reply)).isOk()).toBe(true);
    });

    it("refuses a new message put before someone else's reply", () => {
      const inserted = signedMessage("c1", [question], TOM_MESSAGE);
      const result = validate(stored, file(question, inserted, agreed));

      expect(result.isErr() && result.error.code).toBe("moved_message");
    });

    it("refuses a signed reply repeated with the unsigned message it follows", () => {
      const unsigned: DfmMessage = {
        author: { kind: "agent", id: "dust", name: "@dust" },
        createdAt: AT,
        body: "Unsigned.",
      };
      const reply = signedMessage("c1", [unsigned], {
        author: { kind: "user", id: "usr_daph", name: "Daph" },
        createdAt: AT,
        body: "Agreed.",
      });
      const result = validate(
        file(unsigned, reply),
        file(unsigned, reply, unsigned, reply)
      );

      expect(result.isErr() && result.error.code).toBe("moved_message");
    });

    it("refuses a repeated message", () => {
      const result = validate(stored, file(question, agreed, agreed));

      expect(result.isErr() && result.error.code).toBe("moved_message");
    });

    it("refuses a new message signed after another predecessor", () => {
      const reply = signedMessage("c1", [question], TOM_MESSAGE);
      const result = validate(stored, file(question, agreed, reply));

      expect(result.isErr() && result.error.code).toBe("unsigned_message");
    });
  });

  it("accepts a source the codec cannot read", () => {
    expect(
      validate(null, "Body\n\n:::annotations\n::comment{id=c1}\n:::\n").isOk()
    ).toBe(true);
  });

  it("accepts the user's unsigned messages when no key is configured", () => {
    const result = validateCommentSignatures(
      { previous: null, next: file({ ...TOM, signature: undefined }) },
      { ...CONTEXT, verify: null }
    );

    expect(result.isOk()).toBe(true);
  });

  it("returns the new messages with the text their comment quotes", () => {
    const stored = file(TOM);
    const reply = signedMessage("c1", [TOM], {
      author: { kind: "user", id: "usr_tom", name: "Tom Draier" },
      createdAt: "2026-10-05T12:05:00.000Z",
      body: "Ping :mention[dust]{sId=dust}",
    });

    const result = validate(stored, file(TOM, reply));

    expect(result.isOk() && result.value).toEqual([
      { commentId: "c1", quote: "there", message: reply },
    ]);
  });

  describe("quotes", () => {
    const reply = signedMessage("c1", [TOM], {
      author: { kind: "user", id: "usr_tom", name: "Tom Draier" },
      createdAt: "2026-10-05T12:05:00.000Z",
      body: "Ping :mention[dust]{sId=dust}",
    });
    const withBody = (body: string) =>
      file(TOM, reply).replace(
        "Hi :comment-start{id=c1}there:comment-end{id=c1}",
        body
      );

    it("quote the plain text, its blocks separated by a space, as the editor does", () => {
      const source = withBody(
        "Hi :comment-start{id=c1}**there**.\n\nAnd here:comment-end{id=c1} too."
      );
      const result = validate(file(TOM), source);
      const loaded = loadDfm(source);
      if (loaded.isErr()) {
        throw new Error(loaded.error);
      }

      expect(result.isOk() && result.value[0].quote).toBe("there. And here");
      expect(
        getCommentedTexts(
          documentSchema.nodeFromJSON(loaded.value.content)
        ).get("c1")
      ).toBe("there. And here");
    });

    it("quote code by its text", () => {
      const result = validate(
        file(TOM),
        withBody(
          "Hi :comment-start{id=c1}run `npm test`:comment-end{id=c1} now."
        )
      );

      expect(result.isOk() && result.value[0].quote).toBe("run npm test");
    });
  });
});
