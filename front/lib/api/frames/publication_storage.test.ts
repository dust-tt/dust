import { reconcileFramePublicationDatabases } from "@app/lib/api/frames/database_reconciliation";
import { getFramePublishLockName } from "@app/lib/api/frames/operation_lock";
import type { FramePublicationFunctionArtifact } from "@app/lib/api/frames/publication_storage";
import {
  activateFramePublication,
  loadFramePublicationDescriptor,
  publishFramePublication,
  storeFramePublication,
} from "@app/lib/api/frames/publication_storage";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { computeFrameContentHash } from "@app/lib/api/viz/authorized_file_access_policy";
import type { Authenticator } from "@app/lib/auth";
import { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  computeSandboxFunctionBundleSha256,
  SandboxFunctionResource,
} from "@app/lib/resources/sandbox_function_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
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
  getFramePublicationFunctionBundlePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  frameContentType,
  frameV2ContentType,
  sandboxFunctionContentType,
} from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/frames/database_reconciliation", () => ({
  reconcileFramePublicationDatabases: vi.fn(),
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
  name: "Task List",
  description: "Track tasks.",
});

const manifestWithFunction = FrameManifestSchema.parse({
  version: 1,
  name: "Task List",
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
  name: "Task List",
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

beforeEach(() => {
  vi.mocked(reconcileFramePublicationDatabases).mockResolvedValue(
    new Ok(undefined)
  );
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
    const bundlePath = getFramePublicationFunctionBundlePath({
      ...identity,
      functionName: "add-task",
    });
    const savedPaths = fileStorageMock.saveFileCalls.map(
      ({ filePath }) => filePath
    );

    expect(savedPaths).toContain(bundlePath);
    expect(savedPaths.at(-1)).toBe(getFramePublicationDescriptorPath(identity));
    expect(fileStorageMock.getObject(bundlePath)).toBe(
      functionArtifacts[0].bundleCode
    );
    expect(
      fileStorageMock.saveFileCalls.find(
        ({ filePath }) => filePath === bundlePath
      )?.contentType
    ).toBe(sandboxFunctionContentType);
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
  ])("rejects $name function artifacts before writing", async ({
    manifest,
    sourceFiles,
    functionArtifacts,
  }) => {
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
  });

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
    expect(reloaded?.useCaseMetadata?.frameName).toBe("Task List");
    expect(reloaded?.useCaseMetadata?.frameDescription).toBe("Track tasks.");
  });

  it("refreshes the stored name and description on republish", async () => {
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
      name: "Renamed Tasks",
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
    expect(reloaded?.useCaseMetadata?.frameName).toBe("Renamed Tasks");
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

  it("materializes immutable function rows for the activated publication", async () => {
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
    expect(functions[0]?.frame?.sId).toBe(frame.sId);
    expect(() => functions[0]?.space).toThrow(
      "Frame functions do not belong to a Pod space."
    );
  });

  it("rejects a modified function bundle before activation", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
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
    fileStorageMock.setObject(
      getFramePublicationFunctionBundlePath({
        workspaceId,
        frameId: frame.sId,
        publicationId: stored.value.publicationId,
        functionName: "add-task",
      }),
      "export const tampered = true;"
    );

    const result = await activateFramePublication(auth, {
      frame,
      publicationId: stored.value.publicationId,
    });

    expect(result.isErr() && result.error.code).toBe(
      "invalid_function_artifact"
    );
    expect(frame.useCaseMetadata?.activePublicationId).toBeUndefined();
  });

  it("rolls back the allowlist and function rows when activation fails", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    vi.spyOn(frame, "computeAuthorizedFileAccess").mockImplementation(
      async (_auth, { frameContent }) => ({
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
    });
    expect(active.isOk()).toBe(true);
    if (active.isErr()) {
      return;
    }

    const stagedBundle = "export default function Staged() {}";
    const identity = {
      workspaceId,
      frameId: frame.sId,
      publicationId: active.value.publicationId,
    };
    fileStorageMock.setObject(
      getFramePublicationUiBundlePath(identity),
      stagedBundle
    );
    const descriptor = getStoredDescriptor(
      getFramePublicationDescriptorPath(identity)
    );
    fileStorageMock.setObject(
      getFramePublicationDescriptorPath(identity),
      JSON.stringify({
        ...descriptor,
        ui: {
          bundleSha256: computeSandboxFunctionBundleSha256(stagedBundle),
        },
      })
    );

    const parentTransaction =
      getNamespace("test-namespace")?.get("transaction");
    expect(parentTransaction).toBeDefined();
    await expect(
      frontSequelize.transaction({ transaction: parentTransaction }, async () =>
        activateFramePublication(auth, {
          frame,
          publicationId: active.value.publicationId,
        })
      )
    ).rejects.toThrow();

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      active.value.publicationId
    );
    expect(
      (await frame.getActiveAuthorizedFileAccessAllowlist())?.frameContentHash
    ).toBe(computeFrameContentHash(activeBundle));
    expect(
      await SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: active.value.publicationId,
      })
    ).toHaveLength(1);
  });

  it("refreshes the sharing allowlist before activating a new bundle", async () => {
    const { auth, frame } = await setupFrame();
    vi.spyOn(frame, "computeAuthorizedFileAccess").mockImplementation(
      async (_auth, { frameContent }) => ({
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

    const firstBundle = "export default function First() {}";
    const first = await publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode: firstBundle,
    });
    expect(first.isOk()).toBe(true);
    expect(
      (await frame.getActiveAuthorizedFileAccessAllowlist())?.frameContentHash
    ).toBe(computeFrameContentHash(firstBundle));

    const setActivePublication = vi.spyOn(frame, "setActiveFramePublication");
    const persistAuthorizedFileAccess = vi.spyOn(
      frame,
      "persistAuthorizedFileAccess"
    );

    const secondBundle = "export default function Second() {}";
    const second = await publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest,
      sourceFiles,
      uiBundleCode: secondBundle,
    });
    expect(second.isOk()).toBe(true);
    expect(
      (await frame.getActiveAuthorizedFileAccessAllowlist())?.frameContentHash
    ).toBe(computeFrameContentHash(secondBundle));
    expect(frame.useCaseMetadata?.activePublicationId).toBe(
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
    vi.mocked(reconcileFramePublicationDatabases).mockRejectedValueOnce(
      new LockAcquisitionTimeoutError(`sandbox:lifecycle:frame:${frame.sId}`)
    );

    await expect(
      publishFramePublication(auth, {
        frame,
        functionArtifacts: [],
        manifest,
        sourceFiles,
        uiBundleCode,
      })
    ).rejects.toMatchObject({
      name: "LockAcquisitionTimeoutError",
      lockName: `sandbox:lifecycle:frame:${frame.sId}`,
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
    });

    expect(published.isOk()).toBe(true);
    if (published.isErr()) {
      return;
    }
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      published.value.publicationId
    );
  });

  it("reconciles declared databases before activation", async () => {
    const { auth, frame } = await setupFrame();
    const databaseSchema = {
      relativePath: "databases/tasks.db.ts",
      content: Buffer.from("export const tasks = {};"),
      contentType: "text/typescript" as const,
    };

    const published = await publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest: manifestWithDatabase,
      sourceFiles: [...sourceFiles, databaseSchema],
      uiBundleCode,
    });

    expect(published.isOk()).toBe(true);
    expect(reconcileFramePublicationDatabases).toHaveBeenCalledWith(auth, {
      frame,
      manifest: manifestWithDatabase,
      sourceFiles: [...sourceFiles, databaseSchema],
    });
  });

  it("keeps the previous publication active when database reconciliation fails", async () => {
    const { auth, frame } = await setupFrame();
    const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    await frame.setActiveFramePublication({
      publicationId: activePublicationId,
      name: "Task List",
      description: "Track tasks.",
    });
    vi.mocked(reconcileFramePublicationDatabases).mockResolvedValueOnce(
      new Err(
        new SandboxFunctionError(
          "reconcile_blocked",
          'Database "tasks": destructive change.'
        )
      )
    );

    const published = await publishFramePublication(auth, {
      frame,
      functionArtifacts: [],
      manifest: manifestWithDatabase,
      sourceFiles: [
        ...sourceFiles,
        {
          relativePath: "databases/tasks.db.ts",
          content: Buffer.from("export const tasks = {};"),
          contentType: "text/typescript",
        },
      ],
      uiBundleCode,
    });

    expect(published.isErr() && published.error.code).toBe("reconcile_blocked");
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      activePublicationId
    );
  });

  it("keeps the active publication when function artifact storage fails", async () => {
    const { auth, frame } = await setupFrame();
    const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    await frame.setActiveFramePublication({
      publicationId: activePublicationId,
      name: "Task List",
      description: "Track tasks.",
    });
    fileStorageMock.setFileSaveFails((filePath) =>
      filePath.endsWith("/functions/add-task.ts")
    );

    await expect(
      publishFramePublication(auth, {
        frame,
        functionArtifacts,
        manifest: manifestWithFunction,
        sourceFiles: sourceFilesWithFunction,
        uiBundleCode,
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
    vi.spyOn(frame, "computeAuthorizedFileAccess").mockImplementation(
      async (_auth, { frameContent }) => {
        activationStarted.resolve();
        await releaseActivation.promise;
        return {
          generatedByUserId: auth.getNonNullableUser().id,
          frameContentHash: computeFrameContentHash(frameContent),
          refs: [],
        };
      }
    );

    const publicationPromise = publishFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode,
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
