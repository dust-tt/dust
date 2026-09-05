// esbuild (pulled in by buildFrameBundle) requires a real node environment; jsdom breaks its
// TextEncoder invariant.
// @vitest-environment node

import type { FrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType, sandboxFunctionContentType } from "@app/types/files";
import { splitFrameEntryScopedPath } from "@app/types/mount_path";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
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

// Like inMemoryReader but records every path actually read, so tests can assert the publish
// only pulls the entry's import graph and never the rest of the mount.
function recordingReader(sources: Record<string, string>): {
  reader: FrameSourceReader;
  reads: string[];
} {
  const reads: string[] = [];
  return {
    reads,
    reader: {
      list: async () => Object.keys(sources),
      read: async (relPath) => {
        if (!(relPath in sources)) {
          return null;
        }
        reads.push(relPath);
        return sources[relPath];
      },
    },
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

async function createFrameFile(
  auth: Parameters<typeof publishFrame>[0],
  { spaceId }: { spaceId?: ModelId } = {}
) {
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
    spaceId,
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

const POD_FUNCTION_SCHEMA: JSONSchema = {
  type: "object",
  properties: {},
};

async function createPodFunction(
  auth: Parameters<typeof publishFrame>[0],
  {
    space,
    user,
    slug,
    inputSchema = POD_FUNCTION_SCHEMA,
  }: {
    space: SpaceResource;
    user: UserResource;
    slug: string;
    inputSchema?: JSONSchema;
  }
) {
  const functionFile = await FileFactory.create(auth, user, {
    contentType: sandboxFunctionContentType,
    fileName: `${slug}.ts`,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });

  return SandboxFunctionResource.makeNew(auth, {
    space,
    file: functionFile,
    slug,
    description: `Run ${slug}.`,
    inputSchema,
    outputSchema: POD_FUNCTION_SCHEMA,
  });
}

async function createPodFrameFile(
  auth: Parameters<typeof publishFrame>[0],
  space: SpaceResource
) {
  return FileFactory.create(auth, null, {
    contentType: frameContentType,
    fileName: "Dashboard.tsx",
    fileSize: 100,
    status: "ready",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
}

async function setupPodTestContext() {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  // `SpaceFactory.project` makes the creator a member of the Pod's editors group, which is what
  // grants the user access to the Pod -- no extra group membership is needed here.
  const space = await SpaceFactory.project(workspace, user.id);

  return {
    auth: await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId),
    space,
    user,
  };
}

describe("publishFrame", () => {
  it("builds the source tree into the processed bundle and flips the rendered version", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const file = await createFrameFile(auth);

    // The allowlist recompute reads the rendered content back; the GCS mock returns an empty,
    // never-ending stream, so serve a finite (ref-free) stream instead.
    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from(VALID_SOURCES["Dashboard.tsx"], "utf-8")])
    );
    // The storage mock no-ops uploadRawContentToBucket, so capture the uploaded content from the
    // resource methods publishFrame drives (spies still call through).
    const uploadBundleSpy = vi.spyOn(FileResource.prototype, "uploadProcessed");
    const uploadOriginalSpy = vi.spyOn(FileResource.prototype, "uploadContent");

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader(VALID_SOURCES),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.warnings).toEqual([]);
    }

    // The frame now renders the bundle, and the build root and entry are recorded for republish.
    expect(file.getRenderableVersion()).toBe("processed");
    expect(file.useCaseMetadata?.frameBundleRootPath).toBe(ROOT);
    expect(file.useCaseMetadata?.frameEntryRelPath).toBe("Dashboard.tsx");

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
  });

  it("blocks publishing on a syntax error and does not write a bundle", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const file = await createFrameFile(auth);
    const uploadBundleSpy = vi.spyOn(FileResource.prototype, "uploadProcessed");

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `export default function Dashboard() {
  const x = ;
  return null;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_syntax");
    }

    // No bundle built or persisted, and the frame still renders its source.
    expect(uploadBundleSpy).not.toHaveBeenCalled();
    expect(file.getRenderableVersion()).toBe("original");
  });

  it("publishes when a template-literal Pod function reference is available in the Frame's Pod", async () => {
    const { auth, space, user } = await setupPodTestContext();
    const file = await createFrameFile(auth, { spaceId: space.id });
    await createPodFunction(auth, {
      space,
      user,
      slug: "list-slide-comments",
      inputSchema: {
        type: "object",
        properties: { slideId: { type: "string" } },
        required: ["slideId"],
        additionalProperties: false,
      },
    });

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from("self contained", "utf-8")])
    );

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { callFunction } from "@dust/react-hooks";
import { POD_ID } from "./constants";

export default function Dashboard() {
  const loadComments = () => callFunction(\`${"${POD_ID}"}/list-slide-comments\`, {
    slideId: "slide-1",
  });
  return <button onClick={loadComments}>Load comments</button>;
}
`,
        "constants.ts": `export const POD_ID = ${JSON.stringify(space.sId)};`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isOk(), result.isErr() ? result.error.message : "").toBe(
      true
    );
  });

  it("blocks publishing when Pod function input does not match its JSON Schema", async () => {
    const { auth, space, user } = await setupPodTestContext();
    const file = await createPodFrameFile(auth, space);
    await createPodFunction(auth, {
      space,
      user,
      slug: "list-slide-comments",
      inputSchema: {
        type: "object",
        properties: { slideId: { type: "string" } },
        required: ["slideId"],
        additionalProperties: false,
      },
    });

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { callFunction } from "@dust/react-hooks";

const POD_ID = ${JSON.stringify(space.sId)};
export default function Dashboard() {
  const loadComments = () => callFunction(\`${"${POD_ID}"}/list-slide-comments\`, {
    slideId: 42,
  });
  return <button onClick={loadComments}>Load comments</button>;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_pod_function_input");
    }
  });

  it("blocks publishing when a Pod function reference is unavailable in the Frame's Pod", async () => {
    const { auth, space } = await setupPodTestContext();
    const file = await createPodFrameFile(auth, space);
    const uploadBundleSpy = vi.spyOn(FileResource.prototype, "uploadProcessed");
    const uploadOriginalSpy = vi.spyOn(FileResource.prototype, "uploadContent");

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { callFunction } from "@dust/react-hooks";

const POD_ID = ${JSON.stringify(space.sId)};
export default function Dashboard() {
  const loadComments = () => callFunction(\`${"${POD_ID}"}/missing-function\`, {});
  return <button onClick={loadComments}>Load comments</button>;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("pod_function_not_found");
    }
    expect(uploadOriginalSpy).not.toHaveBeenCalled();
    expect(uploadBundleSpy).not.toHaveBeenCalled();
  });

  it("blocks Pod function references in a Frame without a Pod scope", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const file = await createFrameFile(auth);

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { callFunction } from "@dust/react-hooks";

export default function Dashboard() {
  return <button onClick={() => callFunction("spc_test/function", {})}>Run</button>;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("pod_scope_not_found");
    }
  });

  it("publishes without warnings when hook-based Pod function references are available in the Frame's Pod", async () => {
    const { auth, space, user } = await setupPodTestContext();
    const file = await createFrameFile(auth, { spaceId: space.id });
    await createPodFunction(auth, {
      space,
      user,
      slug: "list-slide-comments",
      inputSchema: {
        type: "object",
        properties: { slideId: { type: "string" } },
        required: ["slideId"],
        additionalProperties: false,
      },
    });

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from("self contained", "utf-8")])
    );

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        // The conditional-null reference is the hooks' supported "disabled" pattern.
        "Dashboard.tsx": `import { usePodFunction, usePodFunctionMutation } from "@dust/react-hooks";
import { POD_ID } from "./constants";

export default function Dashboard() {
  const ready = Math.random() > 0.5;
  const { data } = usePodFunction(ready ? \`${"${POD_ID}"}/list-slide-comments\` : null, {
    slideId: "slide-1",
  });
  const { trigger } = usePodFunctionMutation(\`${"${POD_ID}"}/list-slide-comments\`);
  return <button onClick={() => trigger({ slideId: "slide-1" })}>{String(data)}</button>;
}
`,
        "constants.ts": `export const POD_ID = ${JSON.stringify(space.sId)};`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isOk(), result.isErr() ? result.error.message : "").toBe(
      true
    );
    if (result.isOk()) {
      expect(result.value.warnings).toEqual([]);
    }
  });

  it("warns without blocking when a usePodFunction reference is unavailable in the Frame's Pod", async () => {
    const { auth, space } = await setupPodTestContext();
    const file = await createPodFrameFile(auth, space);
    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from("self contained", "utf-8")])
    );
    const uploadBundleSpy = vi.spyOn(FileResource.prototype, "uploadProcessed");

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { usePodFunction } from "@dust/react-hooks";

const POD_ID = ${JSON.stringify(space.sId)};
export default function Dashboard() {
  const { data } = usePodFunction(\`${"${POD_ID}"}/missing-function\`, {});
  return <div>{String(data)}</div>;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isOk(), result.isErr() ? result.error.message : "").toBe(
      true
    );
    if (result.isOk()) {
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0].type).toBe("pod_function");
      expect(result.value.warnings[0].message).toContain(
        "Frame references a Pod function that is not available in its Pod"
      );
      expect(result.value.warnings[0].message).toContain("missing-function");
      expect(result.value.warnings[0].message).toContain(
        "will start blocking publishing"
      );
    }
    // The publish itself goes through: the frame renders the new bundle.
    expect(uploadBundleSpy).toHaveBeenCalledTimes(1);
    expect(file.getRenderableVersion()).toBe("processed");
  });

  it("warns without blocking when usePodFunction input does not match its JSON Schema", async () => {
    const { auth, space, user } = await setupPodTestContext();
    const file = await createPodFrameFile(auth, space);
    await createPodFunction(auth, {
      space,
      user,
      slug: "list-slide-comments",
      inputSchema: {
        type: "object",
        properties: { slideId: { type: "string" } },
        required: ["slideId"],
        additionalProperties: false,
      },
    });
    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from("self contained", "utf-8")])
    );

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { usePodFunction } from "@dust/react-hooks";

const POD_ID = ${JSON.stringify(space.sId)};
export default function Dashboard() {
  const { data } = usePodFunction(\`${"${POD_ID}"}/list-slide-comments\`, {
    slideId: 42,
  });
  return <div>{String(data)}</div>;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isOk(), result.isErr() ? result.error.message : "").toBe(
      true
    );
    if (result.isOk()) {
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0].type).toBe("pod_function");
      expect(result.value.warnings[0].message).toContain(
        "Frame passes input that does not match the Pod function contract"
      );
    }
  });

  it("warns without blocking when a usePodFunctionMutation reference is unavailable in the Frame's Pod", async () => {
    const { auth, space } = await setupPodTestContext();
    const file = await createPodFrameFile(auth, space);
    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from("self contained", "utf-8")])
    );

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { usePodFunctionMutation } from "@dust/react-hooks";

const POD_ID = ${JSON.stringify(space.sId)};
export default function Dashboard() {
  const { trigger } = usePodFunctionMutation(\`${"${POD_ID}"}/missing-function\`);
  return <button onClick={() => trigger({})}>Run</button>;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isOk(), result.isErr() ? result.error.message : "").toBe(
      true
    );
    if (result.isOk()) {
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0].type).toBe("pod_function");
      expect(result.value.warnings[0].message).toContain(
        "Frame references a Pod function that is not available in its Pod"
      );
    }
  });

  it("warns without blocking hook-based Pod function references in a Frame without a Pod scope", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const file = await createFrameFile(auth);
    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from("self contained", "utf-8")])
    );

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { usePodFunction } from "@dust/react-hooks";

export default function Dashboard() {
  const { data } = usePodFunction("spc_test/function", {});
  return <div>{String(data)}</div>;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isOk(), result.isErr() ? result.error.message : "").toBe(
      true
    );
    if (result.isOk()) {
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0].type).toBe("pod_function");
      expect(result.value.warnings[0].message).toContain("not scoped to a Pod");
    }
  });

  it("still blocks a dangling callFunction reference when hooks are used alongside it", async () => {
    const { auth, space } = await setupPodTestContext();
    const file = await createPodFrameFile(auth, space);
    const uploadBundleSpy = vi.spyOn(FileResource.prototype, "uploadProcessed");

    const result = await publishFrame(auth, {
      file,
      reader: inMemoryReader({
        "Dashboard.tsx": `import { callFunction, usePodFunction } from "@dust/react-hooks";

const POD_ID = ${JSON.stringify(space.sId)};
export default function Dashboard() {
  const { data } = usePodFunction(\`${"${POD_ID}"}/also-missing\`, {});
  const run = () => callFunction(\`${"${POD_ID}"}/missing-function\`, {});
  return <button onClick={run}>{String(data)}</button>;
}
`,
      }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("pod_function_not_found");
      // Only the callFunction failure blocks; the hook failure stays out of the error.
      expect(result.error.message).toContain("missing-function");
      expect(result.error.message).not.toContain("also-missing");
    }
    expect(uploadBundleSpy).not.toHaveBeenCalled();
  });

  it("reads only the entry's import graph, ignoring unrelated files in the mount", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const file = await createFrameFile(auth);

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from("self contained", "utf-8")])
    );
    const uploadBundleSpy = vi.spyOn(FileResource.prototype, "uploadProcessed");

    // A self-contained entry alongside an unrelated, syntactically broken file the frame never
    // imports. The broken file must neither be pulled from the mount nor block the publish.
    const { reader, reads } = recordingReader({
      "Dashboard.tsx": `export default function Dashboard() {
  return (
    <div className="p-4">
      <h1>Sales</h1>
    </div>
  );
}
`,
      "broken.tsx": `export default function Broken() { const x = ; }`,
    });

    const result = await publishFrame(auth, {
      file,
      reader,
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.warnings).toEqual([]);
    }
    expect(file.getRenderableVersion()).toBe("processed");
    expect(uploadBundleSpy).toHaveBeenCalledTimes(1);

    // Only the entry was read (graph-driven), so the broken sibling could not contribute a
    // syntax error.
    expect(reads).toEqual(["Dashboard.tsx"]);
  });

  it("fails when the entry file is missing from the source tree", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const file = await createFrameFile(auth);

    const result = await publishFrame(auth, {
      file,
      // Entry is "Dashboard.tsx" but the tree only has a component.
      reader: inMemoryReader({ "Chart.tsx": VALID_SOURCES["Chart.tsx"] }),
      entryRelPath: "Dashboard.tsx",
      rootScopedPath: ROOT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("entry_not_found");
    }
    expect(file.getRenderableVersion()).toBe("original");
  });

  it("refuses to publish a non-interactive-content file", async () => {
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
      entryRelPath: "notes.txt",
      rootScopedPath: ROOT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_interactive_content");
    }
  });

  it("publishes two frames sharing a fileName independently, each from its own content", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const first = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Dashboard.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });
    const second = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Dashboard.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    // The second frame keeps the same fileName but is stored under an sId-disambiguated path,
    // exactly what the model would see if it listed the directory before publishing.
    const firstScopedPath = first.toScopedPath(auth);
    const secondScopedPath = second.toScopedPath(auth);
    expect(firstScopedPath).not.toBe(secondScopedPath);
    assert(firstScopedPath && secondScopedPath);

    const firstSplit = splitFrameEntryScopedPath(firstScopedPath);
    const secondSplit = splitFrameEntryScopedPath(secondScopedPath);
    assert(firstSplit.isOk() && secondSplit.isOk());

    // mockImplementation, not mockReturnValue: a Readable is single-use, and this mock is read
    // once per publish call (twice here).
    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockImplementation(
      () => Readable.from([Buffer.from("self contained", "utf-8")])
    );

    const firstSource = `export default function Dashboard() {
  return <div>first frame</div>;
}
`;
    const secondSource = `export default function Dashboard() {
  return <div>second frame</div>;
}
`;

    const firstResult = await publishFrame(auth, {
      file: first,
      reader: inMemoryReader({ [firstSplit.value.entryRelPath]: firstSource }),
      entryRelPath: firstSplit.value.entryRelPath,
      rootScopedPath: firstSplit.value.root,
    });
    const secondResult = await publishFrame(auth, {
      file: second,
      reader: inMemoryReader({
        [secondSplit.value.entryRelPath]: secondSource,
      }),
      entryRelPath: secondSplit.value.entryRelPath,
      rootScopedPath: secondSplit.value.root,
    });

    expect(firstResult.isOk()).toBe(true);
    expect(secondResult.isOk()).toBe(true);
    expect(first.getRenderableVersion()).toBe("processed");
    expect(second.getRenderableVersion()).toBe("processed");
    expect(first.useCaseMetadata?.frameEntryRelPath).toBe(
      firstSplit.value.entryRelPath
    );
    expect(second.useCaseMetadata?.frameEntryRelPath).toBe(
      secondSplit.value.entryRelPath
    );
  });
});
