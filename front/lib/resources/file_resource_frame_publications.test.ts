import { FileResource } from "@app/lib/resources/file_resource";
import { createTestFrameFile } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

async function setupLiveFrame() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const frame = await createTestFrameFile(auth, {
    space,
    activePublicationId: "publication-live",
  });
  return { auth, frame };
}

async function reloadMetadata(
  auth: Parameters<typeof FileResource.fetchById>[0],
  sId: string
) {
  return (await FileResource.fetchById(auth, sId))?.useCaseMetadata;
}

describe("Frame publication pointers", () => {
  it("serves the draft as latest while one is pending", async () => {
    const { auth, frame } = await setupLiveFrame();
    expect(frame.latestFramePublicationId).toBe("publication-live");

    await frame.setDraftFramePublication({
      publicationId: "publication-draft",
    });

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.latestFramePublicationId).toBe("publication-draft");
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      "publication-live"
    );
  });

  it("clears the draft", async () => {
    const { auth, frame } = await setupLiveFrame();
    await frame.setDraftFramePublication({
      publicationId: "publication-draft",
    });

    await frame.clearDraftFramePublication();

    expect(
      (await reloadMetadata(auth, frame.sId))?.draftPublicationId
    ).toBeUndefined();
  });

  it("clears the draft when a publication is activated", async () => {
    const { auth, frame } = await setupLiveFrame();
    await frame.setDraftFramePublication({
      publicationId: "publication-draft",
    });

    await frame.setActiveFramePublication({
      publicationId: "publication-next",
      description: "Track tasks.",
    });

    const metadata = await reloadMetadata(auth, frame.sId);
    expect(metadata?.activePublicationId).toBe("publication-next");
    expect(metadata?.draftPublicationId).toBeUndefined();
  });

  it("records the agent on a draft", async () => {
    const { auth, frame } = await setupLiveFrame();

    await frame.setDraftFramePublication({
      publicationId: "publication-draft",
      publishedByAgentConfigurationId: "agent-1",
    });

    expect(
      (await reloadMetadata(auth, frame.sId))?.lastEditedByAgentConfigurationId
    ).toBe("agent-1");
  });
});
