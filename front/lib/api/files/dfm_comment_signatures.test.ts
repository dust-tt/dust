// @vitest-environment node: signs with node:crypto and checks with WebCrypto, as browsers do.

import { generateKeyPairSync, sign } from "node:crypto";
import { applyCommentSignatures } from "@app/lib/api/files/dfm_comment_signatures";
import { createDfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { parseDfm } from "@app/lib/markdown/dfm";
import { describe, expect, it } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64url");
const NOW = "2026-10-05T12:00:00.000Z";
const CLIENT_AT = "2026-10-05T11:59:58.000Z";
const USER = { sId: "usr_tom", fullName: "Tom Draier" };
const CONTEXT = {
  workspaceId: "w_1",
  user: USER,
  now: NOW,
  sign: (payload: string) =>
    sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64url"),
};

const message = (
  author: string,
  name: string,
  at: string,
  body: string,
  sig?: string
) =>
  `::message{author=${author} name="${name}" at=${at}${sig ? ` sig=${sig}` : ""}}\n\n${body}\n`;

const file = (...messages: string[]) =>
  `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n:::annotations\n::comment{id=c1 status=open}\n\n${messages.join("\n")}:::\n`;

function threads(source: string): DfmComment[] {
  const parsed = parseDfm(source);
  if (parsed.isErr()) {
    throw new Error(parsed.error.message);
  }
  return parsed.value.comments;
}

function signed(previous: string | null, next: string) {
  const result = applyCommentSignatures({ previous, next }, CONTEXT);
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe("applyCommentSignatures", () => {
  it("signs a new message from the saving user with the server's name and time", async () => {
    const { content, rewritten } = signed(
      file(),
      file(message("user:usr_tom", "Me", CLIENT_AT, "Looks good."))
    );

    expect(rewritten).toBe(true);
    const [stored] = threads(content)[0].messages;
    expect(stored).toMatchObject({
      author: { kind: "user", id: "usr_tom", name: "Tom Draier" },
      createdAt: NOW,
      body: "Looks good.",
    });
    const verify = await createDfmMessageVerifier({
      publicKey: PUBLIC_KEY,
      workspaceId: "w_1",
    });
    expect(await verify("c1", stored)).toBe(true);
    expect(await verify("c1", { ...stored, body: "Looks bad." })).toBe(false);
    expect(await verify("c2", stored)).toBe(false);
  });

  it.each([
    ["another user", "user:usr_yuka"],
    ["an agent", "agent:dust"],
  ])("refuses a new message attributed to %s", (_, author) => {
    const result = applyCommentSignatures(
      { previous: file(), next: file(message(author, "X", CLIENT_AT, "Hi")) },
      CONTEXT
    );

    expect(result.isErr() && result.error.code).toBe("foreign_message");
  });

  it("refuses a new message when no user is saving", () => {
    const result = applyCommentSignatures(
      {
        previous: null,
        next: file(message("user:usr_tom", "Me", CLIENT_AT, "Hi")),
      },
      { ...CONTEXT, user: null }
    );

    expect(result.isErr()).toBe(true);
  });

  it("keeps stored messages with their stored signature, or none", () => {
    const signedByServer = signed(
      null,
      file(message("user:usr_tom", "Me", CLIENT_AT, "Mine."))
    ).content;
    const [mine] = threads(signedByServer)[0].messages;
    const agent = message("agent:dust", "@dust", CLIENT_AT, "Unsigned.");
    const previous = file(
      message("user:usr_tom", "Tom Draier", NOW, "Mine.", mine.signature),
      agent
    );

    const unchanged = signed(previous, previous);
    expect(unchanged).toEqual({ content: previous, rewritten: false });

    const tampered = signed(
      previous,
      file(
        message("user:usr_tom", "Tom Draier", NOW, "Mine."),
        message("agent:dust", "@dust", CLIENT_AT, "Unsigned.", mine.signature)
      )
    );
    expect(tampered.content).toBe(previous);
  });

  it("treats an edited message of someone else as new and refuses it", () => {
    const previous = file(message("user:usr_yuka", "Yuka", CLIENT_AT, "Mine."));

    const result = applyCommentSignatures(
      {
        previous,
        next: file(message("user:usr_yuka", "Yuka", CLIENT_AT, "Edited.")),
      },
      CONTEXT
    );

    expect(result.isErr()).toBe(true);
  });

  it("lets the user delete threads and keep others' messages untouched", () => {
    const yuka = message("user:usr_yuka", "Yuka", CLIENT_AT, "Keep me.");
    const previous = `${file(yuka).replace(
      ":::\n",
      `\n::comment{id=c2 status=open}\n\n${message("user:usr_yuka", "Yuka", CLIENT_AT, "Delete me.")}:::\n`
    )}`;

    expect(signed(previous, file(yuka))).toEqual({
      content: file(yuka),
      rewritten: false,
    });
  });

  it("writes a source the codec cannot read unchanged", () => {
    const broken = "Body\n\n:::annotations\n::comment{id=c1}\n:::\n";

    expect(signed(null, broken)).toEqual({ content: broken, rewritten: false });
  });

  it("saves new messages unsigned when no key is configured", () => {
    const result = applyCommentSignatures(
      {
        previous: null,
        next: file(message("user:usr_tom", "Me", CLIENT_AT, "Hi")),
      },
      { ...CONTEXT, sign: null }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [stored] = threads(result.value.content)[0].messages;
      expect(stored.signature).toBeUndefined();
      expect(stored.createdAt).toBe(NOW);
    }
  });
});
