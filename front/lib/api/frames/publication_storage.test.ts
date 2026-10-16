import { parseFrameFunctionsTarArchive } from "@app/lib/api/frames/functions_archive";
import { getFramePublishLockName } from "@app/lib/api/frames/operation_lock";
import type { FramePublicationFunctionArtifact } from "@app/lib/api/frames/publication_storage";
import {
  activateFramePublication,
  createFramePublicationFunctionRows,
  loadFramePublicationDescriptor,
  publishFramePublication,
  storeFramePublication,
} from "@app/lib/api/frames/publication_storage";
import { seedFramePublicationFunctionsArchive } from "@app/lib/api/frames/seed_functions_archive";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { computeFrameContentHash } from "@app/lib/api/viz/authorized_file_access_policy";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import {
  computeSandboxFunctionBundleSha256,
  SandboxFunctionResource,
} from "@app/lib/resources/sandbox_function_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { FramePublicationModel } from "@app/lib/resources/storage/models/frame_publication";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { enablePublicFrameFunctions } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { getNamespace } from "@app/tests/utils/test_cls";
import {
  FRAME_MANIFEST_FILE,
  FrameManifestSchema,
} from "@app/types/api/frame_manifest";
import { FramePublicationDescriptorSchema } from "@app/types/api/frame_publication";
import {
  getFramePublicationDescriptorPath,
  getFramePublicationFunctionsArchivePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/frames/seed_functions_archive", () => ({
  seedFramePublicationFunctionsArchive: vi.fn().mockResolvedValue(undefined),
}));

async function setupFrame({
  ready = false,
}: {
  ready?: boolean;
} = {}): Promise<{
  frame: FileResource;
  workspaceId: string;
  auth: Authenticator;
}> {
  const { authenticator, workspace } = await createResourceTest({});
  const conversation = await ConversationFactory.create(authenticator, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });
  const frame = await FileFactory.create(authenticator, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 0,
    status: ready ? "ready" : "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Frame/${FRAME_MANIFEST_FILE}`,
  });

  return { auth: authenticator, frame, workspaceId: workspace.sId };
}

const manifest = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
});

const manifestWithFunction = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
  functions: [
    {
      name: "add-task",
      description: "Add a task.",
      entryPoint: "functions/add_task.ts",
    },
  ],
});

const manifestWithDatabase = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
  databases: [{ name: "tasks", schema: "databases/tasks.db.ts" }],
});

const sourceFiles = [
  {
    relativePath: "index.tsx",
    content: Buffer.from("export default function App() {}"),
    contentType: "text/typescript" as const,
  },
  {
    relativePath: "data.json",
    content: Buffer.from("{}"),
    contentType: "application/json" as const,
  },
];

const sourceFilesWithFunction = [
  ...sourceFiles,
  {
    relativePath: "functions/add_task.ts",
    content: Buffer.from("export async function run() {}"),
    contentType: "text/typescript" as const,
  },
];

const uiBundleCode = "export default function App() {}";

const manifestWithFastFunction = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
  functions: [
    {
      name: "add-task",
      description: "Add a task.",
      entryPoint: "functions/add_task.ts",
      executionMode: "fast",
    },
  ],
});

const functionArtifacts = [
  {
    name: "add-task",
    bundleCode: "export async function run() {}",
    userIdentity: "workspace_user_required",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
    outputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
] satisfies FramePublicationFunctionArtifact[];

const publicFunctionArtifacts = functionArtifacts.map((artifact) => ({
  ...artifact,
  userIdentity: "public" as const,
}));

function createDeferred() {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  if (!resolvePromise) {
    throw new Error("Deferred promise resolver was not initialized.");
  }

  return { promise, resolve: resolvePromise };
}

afterEach(() => {
  // Publishing re-reads the Frame, so these tests spy on the prototype and must restore it.
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(seedFramePublicationFunctionsArchive).mockClear();
  vi.mocked(seedFramePublicationFunctionsArchive).mockResolvedValue(undefined);
  fileStorageMock.reset();
});

function getStoredDescriptor(path: string) {
  const storedDescriptor = fileStorageMock.getObject(path);
  if (!storedDescriptor) {
    throw new Error(`Missing stored Frame publication descriptor: ${path}`);
  }
  return FramePublicationDescriptorSchema.parse(JSON.parse(storedDescriptor));
}

describe("storeFramePublication", () => {
  it("stores runtime artifacts without source before the publication commit marker", async () => {
    const { auth, frame, workspaceId } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode,
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    const { publicationId } = result.value;
    const identity = { workspaceId, frameId: frame.sId, publicationId };

    const savedPaths = fileStorageMock.saveFileCalls.map(
      ({ filePath }) => filePath
    );
    expect(new Set(savedPaths.slice(0, -1))).toEqual(
      new Set([getFramePublicationUiBundlePath(identity)])
    );
    expect(savedPaths.at(-1)).toBe(getFramePublicationDescriptorPath(identity));
    expect(fileStorageMock.saveFileCalls.at(-1)?.contentType).toBe(
      frameV2ContentType
    );
    const uiBundlePath = getFramePublicationUiBundlePath(identity);
    expect(fileStorageMock.getObject(uiBundlePath)).toBe(uiBundleCode);
    expect(
      fileStorageMock.saveFileCalls.find(
        ({ filePath }) => filePath === uiBundlePath
      )?.contentType
    ).toBe(frameContentType);
    expect(
      fileStorageMock.saveFileCalls.some(({ filePath }) =>
        filePath.startsWith("files/w/")
      )
    ).toBe(false);
  });

  it("stores function artifacts before the publication commit marker", async () => {
    const { auth, frame, workspaceId } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    const identity = {
      workspaceId,
      frameId: frame.sId,
      publicationId: result.value.publicationId,
    };
    const archivePath = getFramePublicationFunctionsArchivePath(identity);
    const savedPaths = fileStorageMock.saveFileCalls.map(
      ({ filePath }) => filePath
    );

    expect(savedPaths.some((p) => p.endsWith("/functions/add-task.ts"))).toBe(
      false
    );
    expect(savedPaths).toContain(archivePath);
    expect(savedPaths.at(-1)).toBe(getFramePublicationDescriptorPath(identity));
    const archiveObject = fileStorageMock.getObject(archivePath);
    expect(archiveObject).toBeDefined();
    await expect(
      parseFrameFunctionsTarArchive(Buffer.from(archiveObject!))
    ).resolves.toEqual(
      new Map([["add-task", functionArtifacts[0].bundleCode]])
    );
    expect(
      fileStorageMock.saveFileCalls.find(
        ({ filePath }) => filePath === archivePath
      )?.contentType
    ).toBe("application/x-tar");
    const descriptor = await loadFramePublicationDescriptor(auth, {
      frame,
      publicationId: result.value.publicationId,
    });
    expect(descriptor.isOk() && descriptor.value.functions).toEqual([
      {
        name: "add-task",
        bundleSha256: computeSandboxFunctionBundleSha256(
          functionArtifacts[0].bundleCode
        ),
        userIdentity: functionArtifacts[0].userIdentity,
        inputSchema: functionArtifacts[0].inputSchema,
        outputSchema: functionArtifacts[0].outputSchema,
        toolCalls: [],
      },
    ]);
  });

  it("retains declared database schemas in publication metadata", async () => {
    const { auth, frame } = await setupFrame();
    const databaseSchema = {
      relativePath: "databases/tasks.db.ts",
      content: Buffer.from("export const tasks = {};"),
      contentType: "text/typescript" as const,
    };

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest: manifestWithDatabase,
      sourceFiles: [...sourceFiles, databaseSchema],
      uiBundleCode,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    const descriptor = await loadFramePublicationDescriptor(auth, {
      frame,
      publicationId: result.value.publicationId,
    });
    expect(descriptor.isOk() && descriptor.value.databases).toEqual([
      {
        name: "tasks",
        schemaSource: databaseSchema.content.toString("utf8"),
        schemaSha256: computeSandboxFunctionBundleSha256(
          databaseSchema.content.toString("utf8")
        ),
      },
    ]);
  });

  it("rejects a publication whose UI entry point is missing", async () => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles: sourceFiles.slice(1),
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_source");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a publication whose function entry point is missing", async () => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles,
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_source");
    expect(result.isErr() && result.error.message).toContain(
      "add-task (functions/add_task.ts)"
    );
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a publication whose database schema is missing", async () => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest: manifestWithDatabase,
      sourceFiles,
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_source");
    expect(result.isErr() && result.error.message).toContain(
      "Frame database schema not found: tasks"
    );
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a database schema that is not valid UTF-8", async () => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest: manifestWithDatabase,
      sourceFiles: [
        ...sourceFiles,
        {
          relativePath: "databases/tasks.db.ts",
          content: Buffer.from([0xff]),
          contentType: "text/typescript" as const,
        },
      ],
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_source");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it.each([
    {
      name: "missing",
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      functionArtifacts: [],
    },
    {
      name: "undeclared",
      manifest,
      sourceFiles,
      functionArtifacts,
    },
    {
      name: "duplicate",
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      functionArtifacts: [...functionArtifacts, ...functionArtifacts],
    },
  ])(
    "rejects $name function artifacts before writing",
    async ({ manifest, sourceFiles, functionArtifacts }) => {
      const { auth, frame } = await setupFrame();

      const result = await storeFramePublication(auth, {
        frame,
        functionArtifacts,
        manifest,
        sourceFiles,
        uiBundleCode,
      });

      expect(result.isErr() && result.error.code).toBe(
        "invalid_function_artifact"
      );
      expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    }
  );

  it.each([
    ["an invalid path", [{ ...sourceFiles[0], relativePath: "../index.tsx" }]],
    ["a duplicate path", [sourceFiles[0], sourceFiles[0]]],
  ])("rejects %s before writing", async (_name, invalidSourceFiles) => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles: invalidSourceFiles,
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_source");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("stores a fast public function when public functions are enabled", async () => {
    const { auth, frame } = await setupFrame();
    await enablePublicFrameFunctions(auth);

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: publicFunctionArtifacts,
      manifest: manifestWithFastFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    const descriptor = await loadFramePublicationDescriptor(auth, {
      frame,
      publicationId: result.value.publicationId,
    });
    expect(
      descriptor.isOk() && descriptor.value.functions.map((f) => f.userIdentity)
    ).toEqual(["public"]);
  });

  it("rejects a public function when public functions are disabled", async () => {
    const { auth, frame } = await setupFrame();
    await FeatureFlagFactory.basic(auth, "frames_v2");
    await FeatureFlagFactory.basic(auth, "frames_v2_functions");

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: publicFunctionArtifacts,
      manifest: manifestWithFastFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe(
      "invalid_function_artifact"
    );
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a public function that is not fast", async () => {
    const { auth, frame } = await setupFrame();
    await enablePublicFrameFunctions(auth);

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: publicFunctionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe(
      "invalid_function_artifact"
    );
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("persists literal tools.call pairs on each function contract", async () => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: [
        ...sourceFiles,
        {
          relativePath: "functions/add_task.ts",
          content: Buffer.from(`
            import { tools } from "@dust/pod";
            export default {
              async fetch() {
                await tools.call("gmail", "get_messages", {});
                await tools.call("slack", "search", {});
                return Response.json({});
              },
            };
          `),
          contentType: "text/typescript" as const,
        },
      ],
      uiBundleCode,
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    const descriptor = await loadFramePublicationDescriptor(auth, {
      frame,
      publicationId: result.value.publicationId,
    });
    expect(
      descriptor.isOk() && descriptor.value.functions[0]?.toolCalls
    ).toEqual([
      ["gmail", "get_messages"],
      ["slack", "search"],
    ]);
  });

  it("rejects a fast function that calls tools", async () => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFastFunction,
      sourceFiles: [
        ...sourceFiles,
        {
          relativePath: "functions/add_task.ts",
          content: Buffer.from(`
            import { tools } from "@dust/pod";
            export default {
              async fetch() {
                await tools.call("gmail", "get_messages", {});
                return Response.json({});
              },
            };
          `),
          contentType: "text/typescript" as const,
        },
      ],
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe(
      "invalid_function_artifact"
    );
    expect(result.isErr() && result.error.message).toContain("durable");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a public function whose bundle references a secret", async () => {
    const { auth, frame } = await setupFrame();
    await enablePublicFrameFunctions(auth);

    const result = await storeFramePublication(auth, {
      frame,
      functionArtifacts: publicFunctionArtifacts.map((artifact) => ({
        ...artifact,
        bundleCode: 'export async function run() { return "DSEC_API_KEY"; }',
      })),
      manifest: manifestWithFastFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe(
      "invalid_function_artifact"
    );
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a Frame from another workspace before writing", async () => {
    const { frame } = await setupFrame();
    const { authenticator: otherAuth } = await createResourceTest({});

    const result = await storeFramePublication(otherAuth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_frame");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("does not write publication.json after an artifact failure", async () => {
    const { auth, frame } = await setupFrame();
    fileStorageMock.setFileSaveFails((filePath) =>
      filePath.endsWith("/ui/bundle.js")
    );

    await expect(
      storeFramePublication(auth, {
        frame,
        functionArtifacts: [],
        manifest,
        sourceFiles,
        uiBundleCode,
      })
    ).rejects.toThrow("Simulated GCS write failure");
    expect(
      fileStorageMock.saveFileCalls.some(({ filePath }) =>
        filePath.endsWith("/publication.json")
      )
    ).toBe(false);
  });
});

describe("Frame publication reads", () => {
  it("loads the descriptor of a committed publication", async () => {
    const { auth, frame } = await setupFrame();
    const stored = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode,
    });
    expect(stored.isOk()).toBe(true);
    if (stored.isErr()) {
      return;
    }

    const descriptor = await loadFramePublicationDescriptor(auth, {
      frame,
      publicationId: stored.value.publicationId,
    });
    expect(descriptor.isOk()).toBe(true);
    if (descriptor.isErr()) {
      return;
    }
    expect(descriptor.value).toMatchObject({
      schemaVersion: 1,
      manifest,
      publisherId: auth.getNonNullableUser().sId,
      ui: {
        bundleSha256: computeSandboxFunctionBundleSha256(uiBundleCode),
      },
      functions: [],
      databases: [],
    });
    expect(descriptor.value.publishedAt).toEqual(expect.any(String));
    expect(descriptor.value.sourceFiles).toHaveLength(sourceFiles.length);
  });

  it("rejects an invalid stored descriptor", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const publicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    fileStorageMock.setObject(
      getFramePublicationDescriptorPath({
        workspaceId,
        frameId: frame.sId,
        publicationId,
      }),
      "not json"
    );

    const result = await loadFramePublicationDescriptor(auth, {
      frame,
      publicationId,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_publication");
  });

  it("rejects a modified database schema contract", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const stored = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest: manifestWithDatabase,
      sourceFiles: [
        ...sourceFiles,
        {
          relativePath: "databases/tasks.db.ts",
          content: Buffer.from("export const tasks = {};"),
          contentType: "text/typescript" as const,
        },
      ],
      uiBundleCode,
    });
    expect(stored.isOk()).toBe(true);
    if (stored.isErr()) {
      return;
    }
    const descriptorPath = getFramePublicationDescriptorPath({
      workspaceId,
      frameId: frame.sId,
      publicationId: stored.value.publicationId,
    });
    const descriptor = getStoredDescriptor(descriptorPath);
    fileStorageMock.setObject(
      descriptorPath,
      JSON.stringify({
        ...descriptor,
        databases: descriptor.databases.map((database) => ({
          ...database,
          schemaSource: "export const tampered = {};",
        })),
      })
    );

    const result = await loadFramePublicationDescriptor(auth, {
      frame,
      publicationId: stored.value.publicationId,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_publication");
  });
});

describe("activateFramePublication", () => {
  it("activates a committed publication", async () => {
    const { auth, frame } = await setupFrame();
    const stored = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode,
    });
    expect(stored.isOk()).toBe(true);
    if (stored.isErr()) {
      return;
    }

    const activated = await activateFramePublication(auth, {
      frame,
      publicationId: stored.value.publicationId,
    });

    expect(
      activated.isOk(),
      activated.isErr() ? activated.error.message : undefined
    ).toBe(true);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      stored.value.publicationId
    );
    // Activation records the description; the source folder names the Frame.
    expect(reloaded?.useCaseMetadata?.frameDescription).toBe("Track tasks.");
  });

  it("refreshes the stored description on republish, leaving the name alone", async () => {
    const { auth, frame } = await setupFrame();
    const first = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode,
    });
    expect(first.isOk()).toBe(true);
    if (first.isErr()) {
      return;
    }
    await activateFramePublication(auth, {
      frame,
      publicationId: first.value.publicationId,
    });

    const renamedManifest = FrameManifestSchema.parse({
      ...manifest,
      description: "Renamed description.",
    });
    const second = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest: renamedManifest,
      sourceFiles,
      uiBundleCode,
    });
    expect(second.isOk()).toBe(true);
    if (second.isErr()) {
      return;
    }
    const activated = await activateFramePublication(auth, {
      frame,
      publicationId: second.value.publicationId,
    });
    expect(activated.isOk()).toBe(true);

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.frameDescription).toBe(
      "Renamed description."
    );
  });

  it("keeps the active publication when validation fails", async () => {
    const { auth, frame } = await setupFrame();
    const stored = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode,
    });
    expect(stored.isOk()).toBe(true);
    if (stored.isErr()) {
      return;
    }
    await activateFramePublication(auth, {
      frame,
      publicationId: stored.value.publicationId,
    });
    fileStorageMock.setFetchFileContentNotFound(() => true);

    const activation = await activateFramePublication(auth, {
      frame,
      publicationId: "b8c2b796-534a-4ad2-a5ad-071da692ca0b",
    });

    expect(activation.isErr() && activation.error.code).toBe(
      "publication_not_found"
    );
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      stored.value.publicationId
    );
  });

  it("materializes immutable function rows when staging, then activates the publication", async () => {
    const { auth, frame } = await setupFrame();
    const stored = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
    });
    expect(stored.isOk()).toBe(true);
    if (stored.isErr()) {
      return;
    }

    const staged = await createFramePublicationFunctionRows(auth, {
      frame,
      publicationId: stored.value.publicationId,
      descriptor: stored.value.descriptor,
      functionArtifacts,
    });
    expect(staged.isOk()).toBe(true);
    const activated = await activateFramePublication(auth, {
      frame,
      publicationId: stored.value.publicationId,
    });

    expect(activated.isOk()).toBe(true);
    const functions = await SandboxFunctionResource.listByFramePublication(
      auth,
      { frame, publicationId: stored.value.publicationId }
    );
    expect(functions).toHaveLength(1);
    expect(functions[0]).toMatchObject({
      publicationId: stored.value.publicationId,
      slug: "add-task",
      description: "Add a task.",
      userIdentity: "workspace_user_required",
      executionMode: "durable",
      defaultStake: "low",
      bundleSha256: computeSandboxFunctionBundleSha256(
        functionArtifacts[0].bundleCode
      ),
      inputSchema: functionArtifacts[0].inputSchema,
      outputSchema: functionArtifacts[0].outputSchema,
    });
    expect(functions[0]?.frame.sId).toBe(frame.sId);
  });

  it("rolls back the active pointer and allowlist when activation fails", async () => {
    const { auth, frame } = await setupFrame();
    vi.spyOn(
      FileResource.prototype,
      "computeAuthorizedFileAccess"
    ).mockImplementation(
      async (_auth, { frameContent }) =>
        new Ok({
          generatedByUserId: auth.getNonNullableUser().id,
          frameContentHash: computeFrameContentHash(frameContent),
          refs: [{ kind: "file_id", ref: "fil_ABCDEFGHIJ" }],
        })
    );

    const activeBundle = "export default function Active() {}";
    const active = await publishFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode: activeBundle,
      mode: "live",
    });
    expect(active.isOk()).toBe(true);
    const next = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode: "export default function Next() {}",
    });
    expect(next.isOk()).toBe(true);
    if (active.isErr() || next.isErr()) {
      return;
    }
    vi.spyOn(
      FileResource.prototype,
      "persistAuthorizedFileAccess"
    ).mockRejectedValueOnce(new Error("Simulated allowlist write failure"));

    const parentTransaction =
      getNamespace("test-namespace")?.get("transaction");
    expect(parentTransaction).toBeDefined();
    await expect(
      frontSequelize.transaction({ transaction: parentTransaction }, async () =>
        activateFramePublication(auth, {
          frame,
          publicationId: next.value.publicationId,
        })
      )
    ).rejects.toThrow("Simulated allowlist write failure");

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      active.value.publicationId
    );
    expect(
      (await reloaded?.getActiveAuthorizedFileAccessAllowlist())
        ?.frameContentHash
    ).toBe(computeFrameContentHash(activeBundle));
  });

  it("refreshes the sharing allowlist before activating a new bundle", async () => {
    const { auth, frame } = await setupFrame();
    vi.spyOn(
      FileResource.prototype,
      "computeAuthorizedFileAccess"
    ).mockImplementation(
      async (_auth, { frameContent }) =>
        new Ok({
          generatedByUserId: auth.getNonNullableUser().id,
          frameContentHash: computeFrameContentHash(frameContent),
          refs: [
            {
              kind: "file_id",
              ref: "fil_ABCDEFGHIJ",
            },
          ],
        })
    );
    async function reloadFrame() {
      const reloaded = await FileResource.fetchById(auth, frame.sId);
      if (!reloaded) {
        throw new Error("Frame not found.");
      }
      return reloaded;
    }

    const firstBundle = "export default function First() {}";
    const first = await publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode: firstBundle,
      mode: "live",
    });
    expect(first.isOk()).toBe(true);
    expect(
      (await (await reloadFrame()).getActiveAuthorizedFileAccessAllowlist())
        ?.frameContentHash
    ).toBe(computeFrameContentHash(firstBundle));

    const setActivePublication = vi.spyOn(
      FileResource.prototype,
      "setActiveFramePublication"
    );
    const persistAuthorizedFileAccess = vi.spyOn(
      FileResource.prototype,
      "persistAuthorizedFileAccess"
    );

    const secondBundle = "export default function Second() {}";
    const second = await publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode: secondBundle,
      mode: "live",
    });
    expect(second.isOk()).toBe(true);
    const reloaded = await reloadFrame();
    expect(
      (await reloaded.getActiveAuthorizedFileAccessAllowlist())
        ?.frameContentHash
    ).toBe(computeFrameContentHash(secondBundle));
    expect(reloaded.useCaseMetadata?.activePublicationId).toBe(
      second.isOk() ? second.value.publicationId : undefined
    );
    const activationTransaction = setActivePublication.mock.calls[0]?.[1];
    expect(activationTransaction).toBeDefined();
    expect(persistAuthorizedFileAccess.mock.calls[0]?.[1]?.transaction).toBe(
      activationTransaction
    );
  });
});

describe("publishFramePublication", () => {
  it("returns a typed conflict when another publication holds the lock", async () => {
    const { auth, frame } = await setupFrame();
    const lockKey = `lock:${getFramePublishLockName(frame.sId)}`;
    const redisClient = await getRedisStreamClient({ origin: "lock" });
    await redisClient.set(lockKey, "held-by-test", {
      NX: true,
      PX: 60_000,
    });
    vi.useFakeTimers();

    try {
      const publicationPromise = publishFramePublication(auth, {
        frame,
        functionArtifacts: [],
        manifest,
        sourceFiles,
        uiBundleCode,
        mode: "live",
      });
      await vi.runAllTimersAsync();
      const published = await publicationPromise;

      expect(published.isErr() && published.error.code).toBe(
        "publish_conflict"
      );
    } finally {
      vi.useRealTimers();
      await redisClient.del(lockKey);
    }
  });

  it("does not relabel a nested lock timeout as a publication conflict", async () => {
    const { auth, frame } = await setupFrame();
    const lockName = `sandbox:lifecycle:frame:${frame.sId}`;
    vi.spyOn(FramePublicationModel, "create").mockRejectedValueOnce(
      new LockAcquisitionTimeoutError(lockName)
    );

    await expect(
      publishFramePublication(auth, {
        frame,
        functionArtifacts: [],
        manifest,
        sourceFiles,
        uiBundleCode,
        mode: "live",
      })
    ).rejects.toMatchObject({
      name: "LockAcquisitionTimeoutError",
      lockName,
    });
  });

  it("stores and activates a publication", async () => {
    const { auth, frame } = await setupFrame();

    const published = await publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode,
      mode: "live",
    });

    expect(published.isOk()).toBe(true);
    if (published.isErr()) {
      return;
    }
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      published.value.publicationId
    );
    expect(seedFramePublicationFunctionsArchive).not.toHaveBeenCalled();
  });

  it("fire-and-forgets functions.tar seed when the publication has functions", async () => {
    const { auth, frame } = await setupFrame();

    const published = await publishFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
      mode: "live",
    });

    expect(published.isOk()).toBe(true);
    if (published.isErr()) {
      return;
    }
    // Allow the voided promise to settle.
    await Promise.resolve();
    expect(seedFramePublicationFunctionsArchive).toHaveBeenCalledWith(auth, {
      frame,
      publicationId: published.value.publicationId,
    });
  });

  it("keeps the active publication when function artifact storage fails", async () => {
    const { auth, frame } = await setupFrame();
    const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    await frame.setActiveFramePublication({
      publicationId: activePublicationId,
      description: "Track tasks.",
    });
    fileStorageMock.setFileSaveFails((filePath) =>
      filePath.endsWith("/functions.tar")
    );

    await expect(
      publishFramePublication(auth, {
        frame,
        functionArtifacts,
        manifest: manifestWithFunction,
        sourceFiles: sourceFilesWithFunction,
        uiBundleCode,
        mode: "live",
      })
    ).rejects.toThrow("Simulated GCS write failure");
    expect(
      fileStorageMock.saveFileCalls.some(({ filePath }) =>
        filePath.endsWith("/publication.json")
      )
    ).toBe(false);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      activePublicationId
    );
  });

  it("finishes an in-flight publication before deleting its Frame", async () => {
    const { auth, frame } = await setupFrame({ ready: true });
    const activationStarted = createDeferred();
    const releaseActivation = createDeferred();
    vi.spyOn(
      FileResource.prototype,
      "computeAuthorizedFileAccess"
    ).mockImplementation(async (_auth, { frameContent }) => {
      activationStarted.resolve();
      await releaseActivation.promise;
      return new Ok({
        generatedByUserId: auth.getNonNullableUser().id,
        frameContentHash: computeFrameContentHash(frameContent),
        refs: [],
      });
    });

    const publicationPromise = publishFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
      mode: "live",
    });
    await activationStarted.promise;

    const deletionPromise = frame.delete(auth);
    const redisSet = vi.mocked(
      redisMock.streamClient.set as (
        key: string,
        value: string,
        options: { NX?: boolean; PX?: number }
      ) => Promise<string | null>
    );
    const lockKey = `lock:${getFramePublishLockName(frame.sId)}`;
    try {
      await vi.waitFor(() => {
        expect(
          redisSet.mock.calls.filter(([key]) => key === lockKey).length
        ).toBeGreaterThanOrEqual(2);
      });
      await expect(
        FileResource.fetchById(auth, frame.sId)
      ).resolves.not.toBeNull();
    } finally {
      releaseActivation.resolve();
    }

    const publication = await publicationPromise;
    expect(
      publication.isOk(),
      publication.isErr() ? publication.error.message : undefined
    ).toBe(true);
    const deletion = await deletionPromise;
    expect(
      deletion.isOk(),
      deletion.isErr() ? deletion.error.message : undefined
    ).toBe(true);
    await expect(FileResource.fetchById(auth, frame.sId)).resolves.toBeNull();
  });
});

describe("publishFramePublication modes", () => {
  const publishBundle = (
    auth: Authenticator,
    frame: FileResource,
    code: string,
    mode: "live" | "draft"
  ) =>
    publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode: code,
      mode,
    });

  async function metadataOf(auth: Authenticator, frame: FileResource) {
    return (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata;
  }

  it("makes a first draft publish live", async () => {
    const { auth, frame } = await setupFrame();

    const published = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "draft"
    );

    expect(published.isOk() && published.value.status).toBe("live");
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(
      published.isOk() && published.value.publicationId
    );
    expect(metadata?.latestPublicationId).toBe(
      published.isOk() && published.value.publicationId
    );
  });

  it("stages a later draft publish without touching live", async () => {
    const { auth, frame } = await setupFrame();
    const live = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "live"
    );

    const draft = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );

    expect(draft.isOk() && draft.value.status).toBe("draft");
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(
      live.isOk() && live.value.publicationId
    );
    expect(metadata?.latestPublicationId).toBe(
      draft.isOk() && draft.value.publicationId
    );
  });

  it("does not stage a draft that matches live, and points latest back at live", async () => {
    const { auth, frame } = await setupFrame();
    const live = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "live"
    );
    await publishBundle(auth, frame, "export default function B() {}", "draft");

    const reverted = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "draft"
    );

    expect(reverted.isOk() && reverted.value).toEqual({
      publicationId: live.isOk() && live.value.publicationId,
      status: "live",
    });
    expect((await metadataOf(auth, frame))?.latestPublicationId).toBe(
      live.isOk() && live.value.publicationId
    );
  });

  it("keeps the pending draft when a draft republish matches it", async () => {
    const { auth, frame } = await setupFrame();
    await publishBundle(auth, frame, "export default function A() {}", "live");
    const first = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );

    const again = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );

    assert(first.isOk() && again.isOk(), "both draft publishes succeed");
    expect(again.value).toEqual({
      publicationId: first.value.publicationId,
      status: "draft",
    });
    expect((await metadataOf(auth, frame))?.latestPublicationId).toBe(
      first.value.publicationId
    );
  });

  it("replaces a pending draft whose publication is missing", async () => {
    const { auth, frame } = await setupFrame();
    await publishBundle(auth, frame, "export default function A() {}", "live");
    const fresh = await frame.fetchFreshFrameV2(auth);
    assert(fresh, "Frame exists");
    await fresh.setLatestFramePublication({
      publicationId: "missing-draft-publication",
    });
    fileStorageMock.setFetchFileContentNotFound((path) =>
      path.includes("missing-draft-publication")
    );

    const draft = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );

    assert(draft.isOk(), "draft publish succeeds");
    expect(draft.value.status).toBe("draft");
    expect(draft.value.publicationId).not.toBe("missing-draft-publication");
    expect((await metadataOf(auth, frame))?.latestPublicationId).toBe(
      draft.value.publicationId
    );
  });

  it("points both pointers at a live publish, resolving a pending draft", async () => {
    const { auth, frame } = await setupFrame();
    await publishBundle(auth, frame, "export default function A() {}", "live");
    await publishBundle(auth, frame, "export default function B() {}", "draft");

    const published = await publishBundle(
      auth,
      frame,
      "export default function C() {}",
      "live"
    );

    expect(published.isOk() && published.value.status).toBe("live");
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(
      published.isOk() && published.value.publicationId
    );
    expect(metadata?.latestPublicationId).toBe(
      published.isOk() && published.value.publicationId
    );
  });

  function failAllowlistComputation() {
    vi.spyOn(
      FileResource.prototype,
      "computeAuthorizedFileAccess"
    ).mockResolvedValue(
      new Err(new DustError("frame_user_required", "Simulated failure."))
    );
  }

  describe("when activation fails", () => {
    it("keeps a pending draft and the live pointer on a failed live publish", async () => {
      const { auth, frame } = await setupFrame();
      const live = await publishBundle(
        auth,
        frame,
        "export default function A() {}",
        "live"
      );
      const draft = await publishBundle(
        auth,
        frame,
        "export default function B() {}",
        "draft"
      );
      failAllowlistComputation();

      const published = await publishBundle(
        auth,
        frame,
        "export default function C() {}",
        "live"
      );

      expect(published.isErr() && published.error.code).toBe(
        "allowlist_failed"
      );
      const metadata = await metadataOf(auth, frame);
      expect(metadata?.activePublicationId).toBe(
        live.isOk() && live.value.publicationId
      );
      expect(metadata?.latestPublicationId).toBe(
        draft.isOk() && draft.value.publicationId
      );
    });

    it("leaves no pointer after a failed first publish", async () => {
      const { auth, frame } = await setupFrame();
      failAllowlistComputation();

      const published = await publishBundle(
        auth,
        frame,
        "export default function A() {}",
        "live"
      );

      expect(published.isErr() && published.error.code).toBe(
        "allowlist_failed"
      );
      const metadata = await metadataOf(auth, frame);
      expect(metadata?.activePublicationId).toBeUndefined();
      expect(metadata?.latestPublicationId).toBeUndefined();
    });
  });

  describe("draft publish allowlist", () => {
    async function countFunctionRows(auth: Authenticator, frame: FileResource) {
      const publications = await FramePublicationResource.listForFrame(
        auth,
        frame
      );
      const byPublication = new Map<string, number>();
      for (const publication of publications) {
        const functions = await SandboxFunctionResource.listByFramePublication(
          auth,
          { frame, publicationId: publication.publicationId }
        );
        byPublication.set(publication.publicationId, functions.length);
      }
      return byPublication;
    }

    const publishWithFunction = (
      auth: Authenticator,
      frame: FileResource,
      code: string,
      mode: "live" | "draft"
    ) =>
      publishFramePublication(auth, {
        frame,
        functionArtifacts,
        manifest: manifestWithFunction,
        sourceFiles: sourceFilesWithFunction,
        uiBundleCode: code,
        mode,
      });

    it("fails a draft publish whose files the share allowlist would refuse", async () => {
      const { auth, frame } = await setupFrame();
      const live = await publishWithFunction(
        auth,
        frame,
        "export default function A() {}",
        "live"
      );
      expect(live.isOk()).toBe(true);
      if (live.isErr()) {
        return;
      }
      failAllowlistComputation();

      const draft = await publishWithFunction(
        auth,
        frame,
        "export default function B() {}",
        "draft"
      );

      expect(draft.isErr() && draft.error.code).toBe("allowlist_failed");
      const metadata = await metadataOf(auth, frame);
      expect(metadata?.activePublicationId).toBe(live.value.publicationId);
      expect(metadata?.latestPublicationId).toBe(live.value.publicationId);
      const rows = await countFunctionRows(auth, frame);
      expect(rows.get(live.value.publicationId)).toBe(1);
      for (const [publicationId, count] of rows) {
        if (publicationId !== live.value.publicationId) {
          expect(count).toBe(0);
        }
      }
    });

    it("keeps a pending draft when a later draft publish fails the allowlist", async () => {
      const { auth, frame } = await setupFrame();
      const live = await publishBundle(
        auth,
        frame,
        "export default function A() {}",
        "live"
      );
      const pending = await publishBundle(
        auth,
        frame,
        "export default function B() {}",
        "draft"
      );
      failAllowlistComputation();

      const draft = await publishBundle(
        auth,
        frame,
        "export default function C() {}",
        "draft"
      );

      expect(draft.isErr() && draft.error.code).toBe("allowlist_failed");
      const metadata = await metadataOf(auth, frame);
      expect(metadata?.activePublicationId).toBe(
        live.isOk() && live.value.publicationId
      );
      expect(metadata?.latestPublicationId).toBe(
        pending.isOk() && pending.value.publicationId
      );
    });

    it("fails a draft publish that matches the live bundle when the allowlist would refuse it", async () => {
      const { auth, frame } = await setupFrame();
      const bundle = "export default function A() {}";
      const live = await publishBundle(auth, frame, bundle, "live");
      const pending = await publishBundle(
        auth,
        frame,
        "export default function B() {}",
        "draft"
      );
      failAllowlistComputation();

      const draft = await publishBundle(auth, frame, bundle, "draft");

      expect(draft.isErr() && draft.error.code).toBe("allowlist_failed");
      const metadata = await metadataOf(auth, frame);
      expect(metadata?.activePublicationId).toBe(
        live.isOk() && live.value.publicationId
      );
      expect(metadata?.latestPublicationId).toBe(
        pending.isOk() && pending.value.publicationId
      );
    });

    it("does not persist the allowlist on a draft publish", async () => {
      const { auth, frame } = await setupFrame();
      vi.spyOn(
        FileResource.prototype,
        "computeAuthorizedFileAccess"
      ).mockImplementation(
        async (_auth, { frameContent }) =>
          new Ok({
            generatedByUserId: auth.getNonNullableUser().id,
            frameContentHash: computeFrameContentHash(frameContent),
            refs: [{ kind: "file_id", ref: "fil_ABCDEFGHIJ" }],
          })
      );
      const liveBundle = "export default function A() {}";
      await publishBundle(auth, frame, liveBundle, "live");

      const draft = await publishBundle(
        auth,
        frame,
        "export default function B() {}",
        "draft"
      );

      expect(draft.isOk() && draft.value.status).toBe("draft");
      const reloaded = await FileResource.fetchById(auth, frame.sId);
      expect(
        (await reloaded?.getActiveAuthorizedFileAccessAllowlist())
          ?.frameContentHash
      ).toBe(computeFrameContentHash(liveBundle));
    });
  });

  it("creates function rows for a draft publication", async () => {
    const { auth, frame } = await setupFrame();
    const live = await publishFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode: "export default function A() {}",
      mode: "live",
    });
    expect(live.isOk()).toBe(true);

    const draft = await publishFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode: "export default function B() {}",
      mode: "draft",
    });

    expect(draft.isOk() && draft.value.status).toBe("draft");
    if (draft.isErr()) {
      return;
    }
    const functions = await SandboxFunctionResource.listByFramePublication(
      auth,
      { frame, publicationId: draft.value.publicationId }
    );
    expect(functions).toHaveLength(1);
    expect(functions[0]).toMatchObject({
      publicationId: draft.value.publicationId,
      slug: "add-task",
      bundleSha256: computeSandboxFunctionBundleSha256(
        functionArtifacts[0].bundleCode
      ),
    });
  });

  describe("per-publication allowlist", () => {
    it("stores the share allowlist on a draft publication", async () => {
      const { auth, frame } = await setupFrame();
      await publishBundle(
        auth,
        frame,
        "export default function A() {}",
        "live"
      );

      const draft = await publishBundle(
        auth,
        frame,
        "export default function B() {}",
        "draft"
      );

      assert(draft.isOk(), "draft publish succeeds");
      const row = await FramePublicationResource.fetchForFramePublication(
        auth,
        frame,
        draft.value.publicationId
      );
      expect(row?.authorizedFileAccess).toEqual({
        shareScope: await frame.getShareScope(),
        allowlist: expect.objectContaining({
          frameContentHash: computeFrameContentHash(
            "export default function B() {}"
          ),
        }),
      });
    });

    it("stores the share allowlist on a live publication", async () => {
      const { auth, frame } = await setupFrame();

      const live = await publishBundle(
        auth,
        frame,
        "export default function A() {}",
        "live"
      );

      assert(live.isOk(), "live publish succeeds");
      const row = await FramePublicationResource.fetchForFramePublication(
        auth,
        frame,
        live.value.publicationId
      );
      expect(row?.authorizedFileAccess?.allowlist.frameContentHash).toBe(
        computeFrameContentHash("export default function A() {}")
      );
    });

    // A ref is needed for the active allowlist to have any rows to read back.
    function spyOnAllowlistComputation(auth: Authenticator) {
      return vi
        .spyOn(FileResource.prototype, "computeAuthorizedFileAccess")
        .mockImplementation(
          async (_auth, { frameContent }) =>
            new Ok({
              generatedByUserId: auth.getNonNullableUser().id,
              frameContentHash: computeFrameContentHash(frameContent),
              refs: [{ kind: "file_id", ref: "fil_ABCDEFGHIJ" }],
            })
        );
    }

    async function publishLiveThenDraft(
      auth: Authenticator,
      frame: FileResource
    ) {
      await publishBundle(
        auth,
        frame,
        "export default function A() {}",
        "live"
      );
      const draft = await publishBundle(
        auth,
        frame,
        "export default function B() {}",
        "draft"
      );
      assert(draft.isOk(), "draft publish succeeds");
      const row = await FramePublicationResource.fetchForFramePublication(
        auth,
        frame,
        draft.value.publicationId
      );
      assert(row?.authorizedFileAccess, "the draft stored its allowlist");
      return {
        publicationId: draft.value.publicationId,
        authorizedFileAccess: row.authorizedFileAccess,
      };
    }

    it("activates with the stored allowlist when the share scope is unchanged", async () => {
      const { auth, frame } = await setupFrame();
      const compute = spyOnAllowlistComputation(auth);
      const { publicationId, authorizedFileAccess } =
        await publishLiveThenDraft(auth, frame);
      compute.mockClear();

      const activated = await activateFramePublication(auth, {
        frame,
        publicationId,
        authorizedFileAccess,
      });

      expect(activated.isOk()).toBe(true);
      expect(compute).not.toHaveBeenCalled();
      const reloaded = await FileResource.fetchById(auth, frame.sId);
      expect(
        (await reloaded?.getActiveAuthorizedFileAccessAllowlist())
          ?.frameContentHash
      ).toBe(computeFrameContentHash("export default function B() {}"));
    });

    it("recomputes the allowlist when the share scope changed since the draft", async () => {
      const { auth, frame } = await setupFrame();
      const compute = spyOnAllowlistComputation(auth);
      const { publicationId, authorizedFileAccess } =
        await publishLiveThenDraft(auth, frame);
      const changedScope =
        authorizedFileAccess.shareScope === "emails_only"
          ? "workspace"
          : "emails_only";
      await frame.setShareScope(auth, changedScope);
      compute.mockClear();

      const activated = await activateFramePublication(auth, {
        frame,
        publicationId,
        authorizedFileAccess,
      });

      expect(activated.isOk()).toBe(true);
      expect(compute).toHaveBeenCalledTimes(1);
      expect(await frame.getShareScope()).toBe(changedScope);
      const reloaded = await FileResource.fetchById(auth, frame.sId);
      expect(
        (await reloaded?.getActiveAuthorizedFileAccessAllowlist())
          ?.frameContentHash
      ).toBe(computeFrameContentHash("export default function B() {}"));
    });
  });
});

describe("frame_publications rows", () => {
  async function listPublicationRows(frame: FileResource) {
    return FramePublicationModel.findAll({
      where: { workspaceId: frame.workspaceId, fileId: frame.id },
    });
  }

  it("records a row for the stored publication and its publisher", async () => {
    const { auth, frame } = await setupFrame();

    const stored = await storeFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode,
    });
    expect(stored.isOk()).toBe(true);
    if (stored.isErr()) {
      return;
    }

    const rows = await listPublicationRows(frame);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      publicationId: stored.value.publicationId,
      publishedByUserId: auth.getNonNullableUser().id,
      requiredTools: [],
    });
  });

  it("persists the frame-level requiredTools union on the publication row", async () => {
    const { auth, frame } = await setupFrame();

    const stored = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: [
        ...sourceFiles,
        {
          relativePath: "functions/add_task.ts",
          content: Buffer.from(`
            import { tools } from "@dust/pod";
            export default {
              async fetch() {
                await tools.call("slack", "search", {});
                await tools.call("gmail", "get_messages", {});
                await tools.call("slack", "search", {});
                return Response.json({});
              },
            };
          `),
          contentType: "text/typescript" as const,
        },
      ],
      uiBundleCode,
    });
    expect(stored.isOk()).toBe(true);
    if (stored.isErr()) {
      return;
    }

    const rows = await listPublicationRows(frame);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.requiredTools).toEqual([
      ["gmail", "get_messages"],
      ["slack", "search"],
    ]);
  });

  it("commits the row before writing any publication object", async () => {
    const { auth, frame } = await setupFrame();
    fileStorageMock.setFileSaveFails(() => true);

    await expect(
      storeFramePublication(auth, {
        frame,
        functionArtifacts: [],
        manifest,
        sourceFiles,
        uiBundleCode,
      })
    ).rejects.toThrow("Simulated GCS write failure");

    expect(await listPublicationRows(frame)).toHaveLength(1);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});
