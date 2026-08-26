import { storeFramePublication } from "@app/lib/api/frames/publication_storage";
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

    const { publicationId } = await storeFramePublication(auth, {
      frame,
      manifest,
      sourceFiles,
    });
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

    await expect(
      storeFramePublication(auth, {
        frame,
        manifest,
        sourceFiles: sourceFiles.slice(1),
      })
    ).rejects.toThrow("Frame UI entry point not found");
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
