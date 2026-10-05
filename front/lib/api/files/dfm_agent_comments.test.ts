import { generateKeyPairSync, verify } from "node:crypto";
import { Readable } from "node:stream";
import config from "@app/lib/api/config";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { addAgentComment } from "@app/lib/api/files/dfm_agent_comments";
import {
  readCanonicalFileContent,
  WriteCanonicalFileContentError,
  writeCanonicalFileContent,
} from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import { messageSignaturePayload, parseDfm } from "@app/lib/markdown/dfm";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/files/file_system_ops"),
  async (importOriginal) => {
    const mod = await importOriginal();
    return {
      ...mod,
      readCanonicalFileContent: vi.fn(),
      writeCanonicalFileContent: vi.fn(),
    };
  }
);

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const AGENT = { sId: "agent_reviewer", name: "reviewer" };
const DUST_FS = {} as DustFileSystem;
const PATH = "pod-p1/spec.md";

const SOURCE =
  "# Spec\n\nShip it :comment-start{id=c1}on Friday:comment-end{id=c1}.\n\n" +
  ":::annotations\n::comment{id=c1 status=open}\n\n" +
  '::message{author=user:usr_tom name="Tom" at=2026-10-05T12:00:00.000Z}\n\nWhy Friday?\n:::\n';

function stored(content: string, revision: string) {
  return new Ok({
    stream: Readable.from([Buffer.from(content, "utf8")]),
    contentType: "text/markdown",
    revision,
  });
}

function written(call: number) {
  const [, , , content, , revision] = vi.mocked(writeCanonicalFileContent).mock
    .calls[call];
  return { content: Buffer.from(content).toString("utf8"), revision };
}

const conflict = () =>
  new Err(
    new WriteCanonicalFileContentError("revision_conflict", "File changed.")
  );

const comment = (auth: Authenticator, quote = "Ship it") =>
  addAgentComment(auth, DUST_FS, {
    agent: AGENT,
    scopedPath: PATH,
    quote,
    occurrence: 1,
    comment: "Friday deploys are risky.\r\n",
  });

describe("addAgentComment", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    vi.resetAllMocks();
    auth = (await createResourceTest({})).authenticator;
    await FeatureFlagFactory.basic(auth, "co_edition");
    vi.spyOn(config, "getDfmCommentSigningKey").mockReturnValue(
      privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
    );
  });

  it("adds one open thread signed for the agent and keeps the rest of the file", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));
    vi.mocked(writeCanonicalFileContent).mockResolvedValue(
      new Ok({ created: false, revision: "8" })
    );

    const result = await comment(auth);
    expect(result.isOk()).toBe(true);
    const commentId = result.isOk() ? result.value.commentId : "";

    const { content, revision } = written(0);
    expect(revision).toBe("7");
    const before = parseDfm(SOURCE);
    const after = parseDfm(content);
    if (before.isErr() || after.isErr()) {
      throw new Error("Unparsable document.");
    }
    expect(after.value.body).toBe(
      `# Spec\n\n:comment-start{id=${commentId}}Ship it:comment-end{id=${commentId}} :comment-start{id=c1}on Friday:comment-end{id=c1}.`
    );
    expect(after.value.comments.slice(0, -1)).toEqual(before.value.comments);

    const thread = after.value.comments.at(-1);
    expect(thread).toMatchObject({ id: commentId, status: "open" });
    expect(thread?.messages).toHaveLength(1);
    const [message] = thread?.messages ?? [];
    expect(message).toMatchObject({
      author: { kind: "agent", id: AGENT.sId, name: "@reviewer" },
      body: "Friday deploys are risky.",
    });
    expect(
      verify(
        null,
        Buffer.from(
          messageSignaturePayload({
            workspaceId: auth.getNonNullableWorkspace().sId,
            filePath: PATH,
            commentId,
            position: 0,
            previous: null,
            message,
          }),
          "utf8"
        ),
        publicKey,
        Buffer.from(message.signature ?? "", "base64url")
      )
    ).toBe(true);
  });

  it("starts over from a fresh read when the file changed, never overwriting it", async () => {
    const edited = SOURCE.replace("# Spec", "# Spec v2");
    vi.mocked(readCanonicalFileContent)
      .mockResolvedValueOnce(stored(SOURCE, "7"))
      .mockResolvedValueOnce(stored(edited, "9"));
    vi.mocked(writeCanonicalFileContent)
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(new Ok({ created: false, revision: "10" }));

    expect((await comment(auth)).isOk()).toBe(true);

    const { content, revision } = written(1);
    expect(revision).toBe("9");
    expect(content.startsWith("# Spec v2\n")).toBe(true);
  });

  it("gives up after repeated conflicts", async () => {
    vi.mocked(readCanonicalFileContent).mockImplementation(async () =>
      stored(SOURCE, "7")
    );
    vi.mocked(writeCanonicalFileContent).mockResolvedValue(conflict());

    const result = await comment(auth);
    expect(result.isErr() && result.error.code).toBe("conflict");
    expect(writeCanonicalFileContent).toHaveBeenCalledTimes(3);
  });

  it("refuses a quote missing from the document without writing", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));

    const result = await comment(auth, "Ship it on Monday");
    expect(result.isErr() && result.error.code).toBe("invalid_quote");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("refuses files that are not Markdown", async () => {
    const result = await addAgentComment(auth, DUST_FS, {
      agent: AGENT,
      scopedPath: "pod-p1/notes.txt",
      quote: "Ship it",
      occurrence: 1,
      comment: "Hi.",
    });
    expect(result.isErr() && result.error.code).toBe("not_markdown");
    expect(readCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("refuses to comment without co_edition", async () => {
    const other = (await createResourceTest({})).authenticator;

    const result = await comment(other);
    expect(result.isErr() && result.error.code).toBe("not_available");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });
});
