import { createConversation } from "@app/lib/api/assistant/conversation";
import {
  closeActivePlan,
  closePlan,
  getActivePlanContent,
  writePlanContent,
} from "@app/lib/api/assistant/plan_mode";
import type { FileSystemEntry } from "@app/lib/api/file_system/dust_file_system";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// withPlanModeLock acquires a Redis lock, which never resolves against the test Redis. Bypass it so
// the lock-wrapped helpers (closeActivePlan) run their body directly, keeping the module's other
// exports intact.
vi.mock("@app/lib/lock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/lock")>()),
  executeWithLock: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

// The GCS mock records `file.save(...)` (writes) and gates reads on `exists`, but it does not
// implement bucket listing/copy or stream reads. So we assert on what was written, on the
// missing-file read path, and stub the file system for `closePlan`. Reading back real content is
// out of reach of this mock.
async function setup(): Promise<{
  auth: Authenticator;
  conversation: ConversationWithoutContentType;
}> {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const conversation = await createConversation(auth, {
    title: "Plan mode test",
    visibility: "unlisted",
    spaceId: null,
  });
  return { auth, conversation };
}

function lastPlanWrite(): string | null {
  const calls = fileStorageMock.saveFileCalls.filter((c) =>
    c.filePath.endsWith("/files/plan.md")
  );
  const last = calls[calls.length - 1];
  return last ? last.content.toString() : null;
}

function fileEntry(fileName: string): FileSystemEntry {
  return {
    isDirectory: false,
    fileName,
    path: `x/${fileName}`,
    sizeBytes: 0,
    lastModifiedMs: 0,
    contentType: "text/markdown",
    fileId: null,
    thumbnailUrl: null,
  };
}

// closePlan lists the archive folder then moves plan.md to the next index. The storage mock can't
// list/move, so spy on the file system methods to assert the index computation and destination path.
function stubFsForClose(archivedEntries: FileSystemEntry[]) {
  vi.spyOn(DustFileSystem.prototype, "list").mockResolvedValue(
    new Ok(archivedEntries)
  );
  const move = vi
    .spyOn(DustFileSystem.prototype, "move")
    .mockResolvedValue(new Ok({ sourceDeletionFailed: false }));
  return { move };
}

describe("plan_mode", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writePlanContent writes the given content to plan.md at the conversation root", async () => {
    const { auth, conversation } = await setup();

    const res = await writePlanContent(
      auth,
      conversation,
      "# My plan\n\n- [ ] step one\n"
    );
    expect(res.isOk()).toBe(true);
    expect(lastPlanWrite()).toBe("# My plan\n\n- [ ] step one\n");
  });

  it("getActivePlanContent returns Ok(null) when there is no active plan", async () => {
    const { auth, conversation } = await setup();

    fileStorageMock.setFileExists(() => false);
    const res = await getActivePlanContent(auth, conversation);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toBeNull();
    }
  });

  it("closePlan archives plan.md as plan-1.md when the archive folder is empty", async () => {
    const { auth, conversation } = await setup();
    const { move } = stubFsForClose([]);

    const res = await closePlan(auth, conversation);
    expect(res.isOk()).toBe(true);
    expect(move).toHaveBeenCalledTimes(1);
    expect(move.mock.calls[0][0].dest).toBe(
      `conversation-${conversation.sId}/archived_plans/plan-1.md`
    );
  });

  it("closePlan archives at max existing index + 1, ignoring non-plan files", async () => {
    const { auth, conversation } = await setup();
    const { move } = stubFsForClose([
      fileEntry("plan-1.md"),
      fileEntry("plan-3.md"),
      fileEntry("notes.txt"),
    ]);

    const res = await closePlan(auth, conversation);
    expect(res.isOk()).toBe(true);
    expect(move.mock.calls[0][0]).toEqual({
      src: `conversation-${conversation.sId}/plan.md`,
      dest: `conversation-${conversation.sId}/archived_plans/plan-4.md`,
    });
  });

  it("closeActivePlan reports closed=false (idempotent) when there is no active plan", async () => {
    const { auth, conversation } = await setup();
    vi.spyOn(DustFileSystem.prototype, "readBuffer").mockResolvedValue(
      new Ok(null)
    );

    const res = await closeActivePlan(auth, conversation);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.closed).toBe(false);
    }
  });
});
