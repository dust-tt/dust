import { purgeStaleFramePublications } from "@app/lib/api/frames/publication_retention";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { FramePublicationModel } from "@app/lib/resources/storage/models/frame_publication";
import { createTestFrameFile } from "@app/tests/utils/FrameFunctionFactory";
import { storeTestFramePublication } from "@app/tests/utils/FramePublicationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  getFramePublicationDescriptorPath,
  getFramePublicationsBasePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { beforeEach, describe, expect, it } from "vitest";

const RETENTION_MS = 7 * ONE_DAY_MS;

/**
 * A frame whose active publication was published `activePublishedDaysAgo` ago, with the storage
 * listing wired to return the active publication plus `otherPublicationIds`.
 */
async function setupFrame({
  activePublishedDaysAgo = 30,
}: {
  activePublishedDaysAgo?: number;
} = {}) {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const frame = await createTestFrameFile(auth, { space });
  const active = await storeTestFramePublication(auth, frame, {
    publishedDaysAgo: activePublishedDaysAgo,
  });
  await frame.setActiveFramePublication({
    publicationId: active,
    description: "Track tasks.",
  });

  const listPublications = (otherPublicationIds: string[]) => {
    const publicationsPrefix = getFramePublicationsBasePath({
      workspaceId: workspace.sId,
      frameId: frame.sId,
    });
    fileStorageMock.setSubdirectoryNames((prefix) =>
      prefix === publicationsPrefix ? [...otherPublicationIds, active] : null
    );
  };

  return { active, auth, frame, listPublications, workspaceId: workspace.sId };
}

async function functionRowCount(
  auth: Authenticator,
  frame: FileResource,
  publicationId: string
): Promise<number> {
  const rows = await SandboxFunctionResource.listByFramePublication(auth, {
    frame,
    publicationId,
  });

  return rows.length;
}

async function publicationRowIds(frame: FileResource): Promise<string[]> {
  const rows = await FramePublicationModel.findAll({
    attributes: ["publicationId"],
    where: { workspaceId: frame.workspaceId, fileId: frame.id },
  });

  return rows.map(({ publicationId }) => publicationId);
}

function hasUiBundle(
  workspaceId: string,
  frame: FileResource,
  publicationId: string
): boolean {
  return (
    fileStorageMock.getObject(
      getFramePublicationUiBundlePath({
        workspaceId,
        frameId: frame.sId,
        publicationId,
      })
    ) !== undefined
  );
}

describe("purgeStaleFramePublications", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("deletes a superseded publication past the retention window", async () => {
    const { active, auth, frame, listPublications, workspaceId } =
      await setupFrame();
    const stale = await storeTestFramePublication(auth, frame, {
      publishedDaysAgo: 30,
    });
    listPublications([stale]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result).toEqual({
      deletedFunctionCount: 1,
      deletedPublicationCount: 1,
      unreadablePublicationCount: 0,
    });
    expect(await functionRowCount(auth, frame, stale)).toBe(0);
    expect(await functionRowCount(auth, frame, active)).toBe(1);
    expect(hasUiBundle(workspaceId, frame, stale)).toBe(false);
    expect(hasUiBundle(workspaceId, frame, active)).toBe(true);
    expect(await publicationRowIds(frame)).toEqual([active]);
  });

  it("deletes every stale publication of the Frame in one sweep", async () => {
    const { active, auth, frame, listPublications, workspaceId } =
      await setupFrame();
    const stale = [
      await storeTestFramePublication(auth, frame, { publishedDaysAgo: 30 }),
      await storeTestFramePublication(auth, frame, { publishedDaysAgo: 20 }),
    ];
    listPublications(stale);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result).toEqual({
      deletedFunctionCount: 2,
      deletedPublicationCount: 2,
      unreadablePublicationCount: 0,
    });
    for (const publicationId of stale) {
      expect(await functionRowCount(auth, frame, publicationId)).toBe(0);
      expect(hasUiBundle(workspaceId, frame, publicationId)).toBe(false);
    }
    expect(await publicationRowIds(frame)).toEqual([active]);
  });

  it("keeps a superseded publication published inside the retention window", async () => {
    const { auth, frame, listPublications } = await setupFrame({
      activePublishedDaysAgo: 0,
    });
    const recent = await storeTestFramePublication(auth, frame, {
      publishedDaysAgo: 1,
    });
    listPublications([recent]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.deletedPublicationCount).toBe(0);
    expect(await functionRowCount(auth, frame, recent)).toBe(1);
  });

  it("keeps a superseded publication whose functions still have invocations", async () => {
    const { auth, frame, listPublications } = await setupFrame();
    const stale = await storeTestFramePublication(auth, frame, {
      publishedDaysAgo: 30,
    });
    const [sandboxFunction] =
      await SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: stale,
      });
    await SandboxFunctionInvocationResource.makeNew(auth, {
      sandboxFunction,
      input: { message: "hello" },
    });
    listPublications([stale]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.deletedPublicationCount).toBe(0);
    expect(await functionRowCount(auth, frame, stale)).toBe(1);
  });

  it("keeps the active publication however old it is", async () => {
    const { active, auth, frame, listPublications } = await setupFrame({
      activePublishedDaysAgo: 365,
    });
    listPublications([]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.deletedPublicationCount).toBe(0);
    expect(await functionRowCount(auth, frame, active)).toBe(1);
  });

  it("reports, without deleting, a publication whose descriptor cannot be read", async () => {
    const { auth, frame, listPublications, workspaceId } = await setupFrame();
    const stale = await storeTestFramePublication(auth, frame, {
      publishedDaysAgo: 30,
      withFunctionRows: false,
    });
    // Stands in for a publish that wrote its bundles and never committed its descriptor.
    fileStorageMock.setObject(
      getFramePublicationDescriptorPath({
        workspaceId,
        frameId: frame.sId,
        publicationId: stale,
      }),
      ""
    );
    listPublications([stale]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.unreadablePublicationCount).toBe(1);
    expect(result.deletedPublicationCount).toBe(0);
    expect(hasUiBundle(workspaceId, frame, stale)).toBe(true);
  });
});
