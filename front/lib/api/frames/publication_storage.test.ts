import {
  loadFramePublicationManifest,
  loadFramePublicationSourceFile,
  storeFramePublication,
} from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FrameManifestSchema } from "@app/types/api/frame_manifest";
import {
  getFramePublicationManifestPath,
  getFramePublicationSourcePath,
} from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it } from "vitest";

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

beforeEach(() => {
  fileStorageMock.reset();
});

describe("storeFramePublication", () => {
  it("stores immutable source files before the manifest commit marker", async () => {
    const { auth, frame, workspaceId } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      manifest,
      sourceFiles,
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
    expect(
      fileStorageMock.saveFileCalls.some(({ filePath }) =>
        filePath.startsWith("files/w/")
      )
    ).toBe(false);
  });

  it("rejects a publication whose UI entry point is missing", async () => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      manifest,
      sourceFiles: sourceFiles.slice(1),
    });

    expect(result.isErr() && result.error.code).toBe("invalid_source");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it.each([
    ["an invalid path", [{ ...sourceFiles[0], relativePath: "../index.tsx" }]],
    ["a duplicate path", [sourceFiles[0], sourceFiles[0]]],
  ])("rejects %s before writing", async (_name, invalidSourceFiles) => {
    const { auth, frame } = await setupFrame();

    const result = await storeFramePublication(auth, {
      frame,
      manifest,
      sourceFiles: invalidSourceFiles,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_source");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a Frame from another workspace before writing", async () => {
    const { frame } = await setupFrame();
    const { authenticator: otherAuth } = await createResourceTest({});

    const result = await storeFramePublication(otherAuth, {
      frame,
      manifest,
      sourceFiles,
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
      storeFramePublication(auth, { frame, manifest, sourceFiles })
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
      manifest,
      sourceFiles,
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
      manifest,
      sourceFiles,
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
