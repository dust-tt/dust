// esbuild (pulled in by the publishFrame rebuild) requires a real node environment.
// @vitest-environment node
import { DustFileSystem } from "@app/lib/api/file_system";
import { editFrameTextAtSource } from "@app/lib/api/viz/edit_frame_text";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Redis lock taken by publishFrame hangs under the node vitest environment and is not what
// these tests exercise, so run the critical section directly.
vi.mock("@app/lib/lock", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async <T>(_name: string, cb: () => Promise<T>) => cb(),
  };
});

const TEST_TIMEOUT_MS = 30000;

const ROOT = "conversation-conv_x/dashboards/sales";

// h1 "Sales" sits at line 4, col 8 (tag-name start) in this file.
const ENTRY_SOURCE = `export default function Dashboard() {
  return (
    <div className="p-4">
      <h1>Sales</h1>
    </div>
  );
}
`;

beforeEach(() => {
  vi.restoreAllMocks();
  fileStorageMock.reset();
});

// In-memory DustFileSystem standing in for the mount. Keys are full scoped paths.
function mockMount(files: Map<string, string>) {
  const fakeFs = {
    readBuffer: async (p: string) =>
      new Ok(files.has(p) ? Buffer.from(files.get(p)!, "utf-8") : null),
    stat: async (p: string) =>
      new Ok(
        files.has(p)
          ? { contentType: "text/plain", sizeBytes: files.get(p)!.length }
          : null
      ),
    write: async (p: string, content: Buffer | string) => {
      files.set(p, content.toString());
      return new Ok(undefined);
    },
    list: async (root: string) =>
      new Ok(
        [...files.keys()]
          .filter((p) => p.startsWith(`${root}/`))
          .map((p) => ({ path: p, isDirectory: false }))
      ),
  };
  vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
    new Ok(fakeFs as unknown as DustFileSystem)
  );
  return files;
}

async function createPublishedFrame(
  auth: Parameters<typeof editFrameTextAtSource>[0]
) {
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });

  return FileFactory.create(auth, null, {
    contentType: frameContentType,
    fileName: "Dashboard.tsx",
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: {
      conversationId: conversation.sId,
      frameBundleRootPath: ROOT,
    },
  });
}

describe("editFrameTextAtSource", () => {
  it(
    "edits the source file by location and rebuilds the bundle",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await createPublishedFrame(auth);
      const files = mockMount(
        new Map([[`${ROOT}/Dashboard.tsx`, ENTRY_SOURCE]])
      );

      // The allowlist recompute reads the rendered content back, so serve a finite, ref-free stream.
      vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
        Readable.from([Buffer.from(ENTRY_SOURCE, "utf-8")])
      );
      const uploadBundleSpy = vi.spyOn(
        FileResource.prototype,
        "uploadProcessed"
      );

      const result = await editFrameTextAtSource(auth, {
        file,
        source: "Dashboard.tsx:4:8",
        oldText: "Sales",
        newText: "Revenue",
      });

      expect(result.isOk()).toBe(true);

      // The durable source in the mount was updated.
      expect(files.get(`${ROOT}/Dashboard.tsx`)).toContain("<h1>Revenue</h1>");
      expect(files.get(`${ROOT}/Dashboard.tsx`)).not.toContain("Sales");

      // The Frame was rebuilt: the new bundle reflects the edit and the render stays "processed".
      expect(uploadBundleSpy).toHaveBeenCalledTimes(1);
      expect(uploadBundleSpy.mock.calls[0][1]).toContain("Revenue");
      expect(file.getRenderableVersion()).toBe("processed");
    },
    TEST_TIMEOUT_MS
  );

  it(
    "refuses to edit a Frame that has not been published",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      // No frameBundleRootPath -> never published, no data-source tags exist.
      const file = await FileFactory.create(auth, null, {
        contentType: frameContentType,
        fileName: "Dashboard.tsx",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      const result = await editFrameTextAtSource(auth, {
        file,
        source: "Dashboard.tsx:4:8",
        oldText: "Sales",
        newText: "Revenue",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("not_published");
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    "rejects a malformed source location",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await createPublishedFrame(auth);

      const result = await editFrameTextAtSource(auth, {
        file,
        source: "Dashboard.tsx",
        oldText: "Sales",
        newText: "Revenue",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("invalid_source");
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    "returns source_not_found when the addressed file is absent",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await createPublishedFrame(auth);
      mockMount(new Map([[`${ROOT}/Dashboard.tsx`, ENTRY_SOURCE]]));

      const result = await editFrameTextAtSource(auth, {
        file,
        source: "components/Gone.tsx:1:2",
        oldText: "x",
        newText: "y",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("source_not_found");
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    "returns edit_failed and writes nothing when the text is not found",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await createPublishedFrame(auth);
      const files = mockMount(
        new Map([[`${ROOT}/Dashboard.tsx`, ENTRY_SOURCE]])
      );
      const uploadBundleSpy = vi.spyOn(
        FileResource.prototype,
        "uploadProcessed"
      );

      const result = await editFrameTextAtSource(auth, {
        file,
        source: "Dashboard.tsx:4:8",
        oldText: "Nonexistent",
        newText: "Revenue",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("edit_failed");
      }
      // Source untouched and no rebuild.
      expect(files.get(`${ROOT}/Dashboard.tsx`)).toBe(ENTRY_SOURCE);
      expect(uploadBundleSpy).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT_MS
  );
});
