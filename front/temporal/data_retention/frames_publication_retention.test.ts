import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { purgeStaleFramePublicationsActivity } from "@app/temporal/data_retention/activities";
import { createTestFrameFile } from "@app/tests/utils/FrameFunctionFactory";
import { storeTestFramePublication } from "@app/tests/utils/FramePublicationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  heartbeat: vi.fn(),
}));

async function setupFrameWithStalePublication(): Promise<{
  auth: Authenticator;
  frame: FileResource;
  stalePublicationId: string;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const frame = await createTestFrameFile(auth, { space });
  const stalePublicationId = await storeTestFramePublication(auth, frame, {
    publishedDaysAgo: 30,
  });
  const activePublicationId = await storeTestFramePublication(auth, frame, {
    publishedDaysAgo: 30,
  });
  await frame.setActiveFramePublication({
    publicationId: activePublicationId,
    description: "Track tasks.",
  });

  return { auth, frame, stalePublicationId };
}

describe("purgeStaleFramePublicationsActivity", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("purges superseded publications of frames from every workspace", async () => {
    const first = await setupFrameWithStalePublication();
    const second = await setupFrameWithStalePublication();

    const result = await purgeStaleFramePublicationsActivity({
      afterModelId: null,
    });

    expect(result.scannedFrameCount).toBe(2);
    expect(result.deletedPublicationCount).toBe(2);
    expect(result.deletedFunctionCount).toBe(2);
    // Fewer frames than one batch holds: nothing left to resume from.
    expect(result.nextAfterModelId).toBeNull();

    for (const { auth, frame, stalePublicationId } of [first, second]) {
      expect(
        await SandboxFunctionResource.listByFramePublication(auth, {
          frame,
          publicationId: stalePublicationId,
        })
      ).toEqual([]);
    }
  });

  it("resumes after the frames of a previous batch", async () => {
    const { frame } = await setupFrameWithStalePublication();

    const result = await purgeStaleFramePublicationsActivity({
      afterModelId: frame.id,
    });

    expect(result.scannedFrameCount).toBe(0);
    expect(result.deletedPublicationCount).toBe(0);
    expect(result.nextAfterModelId).toBeNull();
  });
});
