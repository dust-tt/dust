import type { FramePublicationFunctionArtifact } from "@app/lib/api/frames/publication_storage";
import {
  activateFramePublication,
  loadFramePublicationManifest,
  loadFramePublicationSourceFile,
  publishFramePublication,
  storeFramePublication,
} from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import { computeFrameContentHash } from "@app/lib/api/viz/authorized_file_access_policy";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FrameManifestSchema } from "@app/types/api/frame_manifest";
import {
  getFramePublicationFunctionBundlePath,
  getFramePublicationFunctionSchemaPath,
  getFramePublicationManifestPath,
  getFramePublicationSourcePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import {
  frameContentType,
  frameV2ContentType,
  sandboxFunctionContentType,
} from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupFrame(): Promise<{
  frame: FileResource;
  workspaceId: string;
  auth: Authenticator;
}> {
  const { authenticator, workspace } = await createResourceTest({});
  const frame = await FileFactory.create(authenticator, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 0,
    status: "created",
    useCase: "project_context",
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

beforeEach(() => {
  fileStorageMock.reset();
});

describe("storeFramePublication", () => {
  it("stores the UI bundle and immutable source before the manifest commit marker", async () => {
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
      new Set([
        getFramePublicationUiBundlePath(identity),
        getFramePublicationSourcePath({
          ...identity,
          relativePath: "index.tsx",
        }),
        getFramePublicationSourcePath({
          ...identity,
          relativePath: "data.json",
        }),
      ])
    );
    expect(savedPaths.at(-1)).toBe(getFramePublicationManifestPath(identity));
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

  it("stores function artifacts before the manifest commit marker", async () => {
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
    const schemaPath = getFramePublicationFunctionSchemaPath({
      ...identity,
      functionName: "add-task",
    });
    const savedPaths = fileStorageMock.saveFileCalls.map(
      ({ filePath }) => filePath
    );

    expect(savedPaths).toContain(bundlePath);
    expect(savedPaths).toContain(schemaPath);
    expect(savedPaths.at(-1)).toBe(getFramePublicationManifestPath(identity));
    expect(fileStorageMock.getObject(bundlePath)).toBe(
      functionArtifacts[0].bundleCode
    );
    expect(fileStorageMock.getObject(schemaPath)).toBe(
      JSON.stringify({
        userIdentity: functionArtifacts[0].userIdentity,
        inputSchema: functionArtifacts[0].inputSchema,
        outputSchema: functionArtifacts[0].outputSchema,
      })
    );
    expect(
      fileStorageMock.saveFileCalls.find(
        ({ filePath }) => filePath === bundlePath
      )?.contentType
    ).toBe(sandboxFunctionContentType);
    expect(
      fileStorageMock.saveFileCalls.find(
        ({ filePath }) => filePath === schemaPath
      )?.contentType
    ).toBe("application/json");
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

  it("does not write the manifest after a partial source failure", async () => {
    const { auth, frame } = await setupFrame();
    fileStorageMock.setFileSaveFails((filePath) =>
      filePath.endsWith("/source/data.json")
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
        filePath.endsWith("/manifest.json")
      )
    ).toBe(false);
  });
});

describe("Frame publication reads", () => {
  it("loads the manifest and source of a committed publication", async () => {
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

    const loadedManifest = await loadFramePublicationManifest(auth, {
      frame,
      publicationId: stored.value.publicationId,
    });
    expect(loadedManifest).toEqual(new Ok(manifest));

    const loadedSource = await loadFramePublicationSourceFile(auth, {
      frame,
      publicationId: stored.value.publicationId,
      relativePath: "index.tsx",
    });
    expect(loadedSource.isOk() && loadedSource.value.toString("utf8")).toBe(
      "export default function App() {}"
    );
  });

  it("does not expose source without the manifest commit marker", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const publicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    fileStorageMock.setObject(
      getFramePublicationSourcePath({
        workspaceId,
        frameId: frame.sId,
        publicationId,
        relativePath: "index.tsx",
      }),
      "partial source"
    );
    fileStorageMock.setFetchFileContentNotFound(() => true);

    const result = await loadFramePublicationSourceFile(auth, {
      frame,
      publicationId,
      relativePath: "index.tsx",
    });

    expect(result.isErr() && result.error.code).toBe("publication_not_found");
  });

  it("rejects an invalid stored manifest", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const publicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    fileStorageMock.setObject(
      getFramePublicationManifestPath({
        workspaceId,
        frameId: frame.sId,
        publicationId,
      }),
      "not json"
    );

    const result = await loadFramePublicationManifest(auth, {
      frame,
      publicationId,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_manifest");
  });

  it("returns a typed error for a missing source file", async () => {
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
    fileStorageMock.setFetchFileContentNotFound(() => true);

    const result = await loadFramePublicationSourceFile(auth, {
      frame,
      publicationId: stored.value.publicationId,
      relativePath: "missing.ts",
    });

    expect(result.isErr() && result.error.code).toBe("source_not_found");
  });

  it("rejects unsafe source paths before reading", async () => {
    const { auth, frame } = await setupFrame();

    const result = await loadFramePublicationSourceFile(auth, {
      frame,
      publicationId: "b8c2b796-534a-4ad2-a5ad-071da692ca0b",
      relativePath: "../index.tsx",
    });

    expect(result.isErr() && result.error.code).toBe("invalid_source");
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

    expect(activated.isOk()).toBe(true);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      stored.value.publicationId
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
  });
});

describe("publishFramePublication", () => {
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

  it("keeps the active publication when function artifact storage fails", async () => {
    const { auth, frame } = await setupFrame();
    const activePublicationId = "b8c2b796-534a-4ad2-a5ad-071da692ca0b";
    await frame.setActiveFramePublication(activePublicationId);
    fileStorageMock.setFileSaveFails((filePath) =>
      filePath.endsWith("/schema.json")
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
        filePath.endsWith("/manifest.json")
      )
    ).toBe(false);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      activePublicationId
    );
  });
});
