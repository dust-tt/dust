import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import {
  createTestAuthorFrameWithDraft,
  makeTestFrameFunction,
  storeTestDraftPublicationAllowlist,
} from "@app/tests/utils/FrameFunctionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { FramePublicationAllowlist } from "@app/types/api/frame_publication";
import type { AuthorizedFileRef } from "@app/types/files";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it } from "vitest";

const DRAFT_ONLY_REF: AuthorizedFileRef = {
  kind: "frame_relative_path",
  ref: "./data/draft_only.csv",
  fileName: "draft_only.csv",
};

// An allowlist the live bundle does not have.
const DRAFT_ALLOWLIST: FramePublicationAllowlist = {
  shareScope: "workspace_and_emails",
  allowlist: {
    generatedByUserId: null,
    frameContentHash: "draft-hash",
    refs: [DRAFT_ONLY_REF],
  },
};

function getShare(workspace: { sId: string }, fileId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/files/${fileId}/share`);
}

describe("GET /files/:fileId/share draftViewerFiles", () => {
  it("lists the draft's files for an editor, leaving viewerFiles as the live list", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest();
    const { frame } = await createTestAuthorFrameWithDraft(auth, {
      messagesCreatedAt: [],
      draftAuthorizedFileAccess: DRAFT_ALLOWLIST,
    });

    const response = await getShare(workspace, frame.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.viewerFiles).toEqual([]);
    expect(body.draftViewerFiles).toHaveLength(1);
    expect(body.draftViewerFiles[0]).toMatchObject({
      ref: DRAFT_ONLY_REF.ref,
      name: "draft_only.csv",
      sourceKind: "frame",
    });
  });

  it("is null for an editor when the draft row has no stored allowlist", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest();
    const { frame } = await createTestAuthorFrameWithDraft(auth, {
      messagesCreatedAt: [],
    });
    const draftPublicationId = frame.pendingDraftPublicationId;
    assert(draftPublicationId, "Expected the Frame to have a pending draft.");
    await FramePublicationResource.makeNew(auth, {
      frame,
      publicationId: draftPublicationId,
    });

    const response = await getShare(workspace, frame.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).draftViewerFiles).toBeNull();
  });

  it("is null when no draft is pending", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest();
    const { frame } = await createTestAuthorFrameWithDraft(auth, {
      messagesCreatedAt: [],
      draftAuthorizedFileAccess: DRAFT_ALLOWLIST,
    });
    await frame.setActiveFramePublication({
      publicationId: "publication-live",
      description: "Live.",
    });

    const response = await getShare(workspace, frame.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).draftViewerFiles).toBeNull();
  });

  it("is null for a caller who cannot write the Frame", async () => {
    const { adminAuth, auth, frame, space, workspace } =
      await makeTestFrameFunction();
    // Everyone in the workspace can read the Pod, but only its members can write the source.
    const { globalGroup } = await GroupFactory.defaults(workspace);
    await SpaceFactory.attachGroup(space, globalGroup, "project_viewer");
    await frame.setLatestFramePublication({
      publicationId: "publication-draft",
    });
    await storeTestDraftPublicationAllowlist(adminAuth, {
      frame,
      authorizedFileAccess: DRAFT_ALLOWLIST,
    });
    expect(await canWriteFrameV2Source(auth, frame)).toBe(false);

    const response = await getShare(workspace, frame.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).draftViewerFiles).toBeNull();
  });
});
