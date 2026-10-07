import { generateKeyPairSync } from "node:crypto";
import { applyLiveCommentCommand } from "@app/lib/api/collab/live_comments";
import type { LiveFile } from "@app/lib/api/collab/live_file";
import config from "@app/lib/api/config";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
