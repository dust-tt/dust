import { generateKeyPairSync } from "node:crypto";
import {
  applyLiveCommentCommand,
  dispatchLiveCommentMentions,
} from "@app/lib/api/collab/live_comments";
import type { LiveFile } from "@app/lib/api/collab/live_file";
import { dfmToYDoc } from "@app/lib/api/collab/ydoc";
import config from "@app/lib/api/config";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { dispatchCommentMentions } from "@app/lib/api/files/dfm_comment_mentions";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { serializeDfm } from "@app/lib/markdown/dfm";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/files/dfm_comment_mentions"), () => ({
  dispatchCommentMentions: vi.fn(),
}));

const { privateKey } = generateKeyPairSync("ed25519");

const THREAD: DfmComment = {
  id: "c1",
  status: "open",
  messages: [
    {
      author: { kind: "user", id: "usr_tom", name: "Tom" },
      createdAt: "2026-10-05T12:00:00.000Z",
      body: "Why Friday?",
    },
  ],
};
const OTHER: DfmComment = { ...THREAD, id: "c2" };

describe("applyLiveCommentCommand", () => {
  let file: LiveFile;

  beforeEach(async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const dustFs = await DustFileSystem.forUser(auth);
    if (dustFs.isErr()) {
      throw dustFs.error;
    }
    await FeatureFlagFactory.basic(auth, "co_edition");
    vi.spyOn(config, "getDfmCommentSigningKey").mockReturnValue(
      privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
    );
    file = {
      auth,
      workspaceId: workspace.sId,
      canonicalPath: `user-${auth.getNonNullableUser().sId}/notes.md`,
      dustFs: dustFs.value,
      canWrite: true,
    };
  });

  it("adds a thread signed for the file's user, whatever the command says", async () => {
    const result = await applyLiveCommentCommand(file, [THREAD], {
      type: "add",
      commentId: "c-new",
      body: "Looks good.",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const { created, comments } = result.value;
    const user = file.auth.getNonNullableUser();
    expect(created?.messages).toEqual([
      expect.objectContaining({
        author: { kind: "user", id: user.sId, name: user.fullName() },
        body: "Looks good.",
        signature: expect.any(String),
      }),
    ]);
    expect(comments).toEqual([THREAD, created]);
  });

  it("refuses every command when the file cannot be written", async () => {
    const result = await applyLiveCommentCommand(
      { ...file, canWrite: false },
      [THREAD],
      { type: "resolve", commentId: "c1", resolved: true }
    );

    expect(result.isErr() && result.error).toBe("unavailable");
  });

  it("refuses to add a thread whose id is taken", async () => {
    const result = await applyLiveCommentCommand(file, [THREAD], {
      type: "add",
      commentId: "c1",
      body: "Again.",
    });

    expect(result.isErr() && result.error).toBe("unavailable");
  });

  it("refuses to sign outside a workspace with co_edition", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const result = await applyLiveCommentCommand({ ...file, auth }, [], {
      type: "add",
      commentId: "c-new",
      body: "Hi.",
    });

    expect(result.isErr() && result.error).toBe("unavailable");
  });

  it("appends a signed reply after the thread's last message", async () => {
    const result = await applyLiveCommentCommand(file, [THREAD, OTHER], {
      type: "reply",
      commentId: "c1",
      position: 1,
      body: "Because of the release.",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const [replied, other] = result.value.comments;
    expect(replied.messages).toHaveLength(2);
    expect(replied.messages[1]).toEqual(
      expect.objectContaining({
        body: "Because of the release.",
        signature: expect.any(String),
      })
    );
    expect(other).toBe(OTHER);
    expect(result.value.created).toBeNull();
  });

  it("refuses a reply to a thread that moved on, or that is gone", async () => {
    const stale = await applyLiveCommentCommand(file, [THREAD], {
      type: "reply",
      commentId: "c1",
      position: 2,
      body: "Late.",
    });
    const missing = await applyLiveCommentCommand(file, [THREAD], {
      type: "reply",
      commentId: "c-gone",
      position: 1,
      body: "Lost.",
    });

    expect(stale.isErr() && stale.error).toBe("thread_changed");
    expect(missing.isErr() && missing.error).toBe("not_found");
  });

  it("resolves and deletes only the given thread", async () => {
    const resolved = await applyLiveCommentCommand(file, [THREAD, OTHER], {
      type: "resolve",
      commentId: "c1",
      resolved: true,
    });
    const deleted = await applyLiveCommentCommand(file, [THREAD, OTHER], {
      type: "delete",
      commentId: "c1",
    });

    expect(resolved.isOk() && resolved.value.comments).toEqual([
      { ...THREAD, status: "resolved" },
      OTHER,
    ]);
    expect(deleted.isOk() && deleted.value.comments).toEqual([OTHER]);
  });
});

describe("dispatchLiveCommentMentions", () => {
  const TOM = { kind: "user", id: "usr_tom", name: "Tom" } as const;
  const SOURCE = serializeDfm({
    frontMatter: null,
    body: "Ship it :comment-start{id=c1}on Friday:comment-end{id=c1}.",
    comments: [
      {
        id: "c1",
        status: "open",
        messages: [
          { author: TOM, createdAt: "2026-10-05T12:00:00.000Z", body: "Why?" },
          {
            author: TOM,
            createdAt: "2026-10-05T12:01:00.000Z",
            body: "@dust any idea?",
          },
        ],
      },
      {
        id: "c2",
        status: "open",
        messages: [
          {
            author: TOM,
            createdAt: "2026-10-05T12:02:00.000Z",
            body: "Not anchored yet.",
          },
        ],
      },
    ],
  });
  let file: LiveFile;

  function loadLive() {
    if (SOURCE.isErr()) {
      throw SOURCE.error;
    }
    const live = dfmToYDoc(SOURCE.value);
    if (live.isErr()) {
      throw new Error(live.error);
    }
    return live.value;
  }

  beforeEach(async () => {
    vi.mocked(dispatchCommentMentions).mockReset();
    const { authenticator: auth, workspace } = await createResourceTest({});
    const dustFs = await DustFileSystem.forUser(auth);
    if (dustFs.isErr()) {
      throw dustFs.error;
    }
    file = {
      auth,
      workspaceId: workspace.sId,
      canonicalPath: `user-${auth.getNonNullableUser().sId}/notes.md`,
      dustFs: dustFs.value,
      canWrite: true,
    };
  });

  it("dispatches a reply's message with the text its thread's anchors cover", async () => {
    const live = loadLive();

    await dispatchLiveCommentMentions(file, live, {
      type: "reply",
      commentId: "c1",
      position: 1,
      body: "@dust any idea?",
    });

    expect(dispatchCommentMentions).toHaveBeenCalledWith(file.auth, {
      scopedPath: file.canonicalPath,
      newMessages: [
        {
          commentId: "c1",
          quote: "on Friday",
          message: live.comments[0].messages[1],
        },
      ],
    });
  });

  it("dispatches an add not anchored yet with the quote it carries", async () => {
    const live = loadLive();

    await dispatchLiveCommentMentions(file, live, {
      type: "add",
      commentId: "c2",
      body: "Not anchored yet.",
      quote: "Ship it",
    });

    expect(
      vi.mocked(dispatchCommentMentions).mock.calls[0][1].newMessages
    ).toEqual([
      {
        commentId: "c2",
        quote: "Ship it",
        message: live.comments[1].messages[0],
      },
    ]);
  });

  it("dispatches nothing for a resolve or a delete", async () => {
    const live = loadLive();

    await dispatchLiveCommentMentions(file, live, {
      type: "resolve",
      commentId: "c1",
      resolved: true,
    });
    await dispatchLiveCommentMentions(file, live, {
      type: "delete",
      commentId: "c1",
    });

    expect(dispatchCommentMentions).not.toHaveBeenCalled();
  });
});
