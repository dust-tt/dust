// esbuild (pulled in by buildFrameBundle) requires a real node environment; jsdom breaks its
// TextEncoder invariant.
// @vitest-environment node
import type { FrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The distributed (Redis) lock is an implementation detail of publishFrame, not what these tests
// exercise, and its stream client hangs under the node vitest environment. Run the critical
// section directly so the tests stay deterministic and Redis-free.
vi.mock("@app/lib/lock", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async <T>(_name: string, cb: () => Promise<T>) => cb(),
  };
});

// esbuild cold start plus DB setup can exceed the default 5s.
const TEST_TIMEOUT_MS = 30000;

beforeEach(() => {
  vi.restoreAllMocks();
  fileStorageMock.reset();
});

function inMemoryReader(sources: Record<string, string>): FrameSourceReader {
  return {
    list: async () => Object.keys(sources),
    read: async (relPath) => sources[relPath] ?? null,
  };
}

const ROOT = "conversation-conv_test/dashboards/sales";

// A valid two-file frame: the entry imports a relative component and an external dependency.
const VALID_SOURCES: Record<string, string> = {
  "Dashboard.tsx": `import Chart from "./Chart";

export default function Dashboard() {
  return (
    <div className="p-4">
      <h1>Sales</h1>
      <Chart />
    </div>
  );
}
`,
  "Chart.tsx": `import { LineChart } from "recharts";

export default function Chart() {
  return <LineChart width={400} height={200} data={[]} />;
}
`,
};

async function createFrameFile(auth: Parameters<typeof publishFrame>[0]) {
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
    useCaseMetadata: { conversationId: conversation.sId },
  });
}

describe("publishFrame", () => {
  it(
    "builds the source tree into the processed bundle and flips the rendered version",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await createFrameFile(auth);

      // The allowlist recompute reads the rendered content back; the GCS mock returns an empty,
      // never-ending stream, so serve a finite (ref-free) stream instead.
      vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
        Readable.from([Buffer.from(VALID_SOURCES["Dashboard.tsx"], "utf-8")])
      );
      // The storage mock no-ops uploadRawContentToBucket, so capture the uploaded content from the
      // resource methods publishFrame drives (spies still call through).
      const uploadBundleSpy = vi.spyOn(
        FileResource.prototype,
        "uploadProcessedFrameBundle"
      );
      const uploadOriginalSpy = vi.spyOn(
        FileResource.prototype,
        "uploadContent"
      );

      const result = await publishFrame(auth, {
        file,
        reader: inMemoryReader(VALID_SOURCES),
        rootScopedPath: ROOT,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.warnings).toEqual([]);
      }

      // The frame now renders the bundle, and the build root is recorded for republish.
      expect(file.getRenderableVersion()).toBe("processed");
      expect(file.useCaseMetadata?.frameBundleRootPath).toBe(ROOT);

      expect(uploadBundleSpy).toHaveBeenCalledTimes(1);
      const bundle = uploadBundleSpy.mock.calls[0][1];
      // The relative import is inlined (Chart's body is present)...
      expect(bundle).toContain("LineChart");
      expect(bundle).toContain("Sales");
      // ...while the external dependency stays an import resolved by the viz scope at render...
      expect(bundle).toContain('from "recharts"');
      // ...and source-location tags are injected for live edit routing.
      expect(bundle).toContain("data-source");

      // The canonical original is refreshed with the published entry source.
      expect(uploadOriginalSpy).toHaveBeenCalledTimes(1);
      expect(uploadOriginalSpy.mock.calls[0][1]).toBe(
        VALID_SOURCES["Dashboard.tsx"]
      );
    },
    TEST_TIMEOUT_MS
  );

  it(
    "blocks publishing on a syntax error and does not write a bundle",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await createFrameFile(auth);
      const uploadBundleSpy = vi.spyOn(
        FileResource.prototype,
        "uploadProcessedFrameBundle"
      );

      const result = await publishFrame(auth, {
        file,
        reader: inMemoryReader({
          "Dashboard.tsx": `export default function Dashboard() {
  const x = ;
  return null;
}
`,
        }),
        rootScopedPath: ROOT,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("invalid_syntax");
      }

      // No bundle built or persisted, and the frame still renders its source.
      expect(uploadBundleSpy).not.toHaveBeenCalled();
      expect(file.getRenderableVersion()).toBe("original");
    },
    TEST_TIMEOUT_MS
  );

  it(
    "fails when the entry file is missing from the source tree",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await createFrameFile(auth);

      const result = await publishFrame(auth, {
        file,
        // Entry is "Dashboard.tsx" but the tree only has a component.
        reader: inMemoryReader({ "Chart.tsx": VALID_SOURCES["Chart.tsx"] }),
        rootScopedPath: ROOT,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("entry_not_found");
      }
      expect(file.getRenderableVersion()).toBe("original");
    },
    TEST_TIMEOUT_MS
  );

  it(
    "refuses to publish a non-interactive-content file",
    async () => {
      const { authenticator: auth } = await createResourceTest({});
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "notes.txt",
        fileSize: 10,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      const result = await publishFrame(auth, {
        file,
        reader: inMemoryReader({ "notes.txt": "hello" }),
        rootScopedPath: ROOT,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("not_interactive_content");
      }
    },
    TEST_TIMEOUT_MS
  );
});
