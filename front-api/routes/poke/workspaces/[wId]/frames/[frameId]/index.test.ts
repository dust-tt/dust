import { loadFramePublicationDescriptor } from "@app/lib/api/frames/publication_storage";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The active publication descriptor lives in GCS.
vi.mock(import("@app/lib/api/frames/publication_storage"), async (orig) => {
  const mod = await orig();
  return { ...mod, loadFramePublicationDescriptor: vi.fn() };
});

function frameUrl(workspaceId: string, frameId: string) {
  return `/api/poke/workspaces/${workspaceId}/frames/${frameId}`;
}

describe("GET /api/poke/workspaces/:wId/frames/:frameId", () => {
  // The mock is module-scoped: without this, the published-frame test's call leaks into the
  // unpublished test's `not.toHaveBeenCalled()` assertion.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the overview, storage locations and the active publication", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    vi.mocked(loadFramePublicationDescriptor).mockResolvedValue(
      new Ok({
        schemaVersion: 1,
        manifest: {
          uiEntryPoint: "app.tsx",
          functions: [],
          databases: [],
        },
        publishedAt: "2026-09-01T00:00:00.000Z",
        publisherId: null,
        sourceFiles: [{ path: "app.tsx", contentSha256: "a".repeat(64) }],
        ui: { bundleSha256: "b".repeat(64) },
        functions: [],
        databases: [],
      } as never)
    );

    const response = await honoApp.request(frameUrl(workspace.sId, frame.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.frame.sId).toBe(frame.sId);
    expect(data.sandbox).toBeNull();
    expect(data.publication).toMatchObject({
      publicationId: "publication-1",
      publishedAt: "2026-09-01T00:00:00.000Z",
      sourceFiles: [{ path: "app.tsx", contentSha256: "a".repeat(64) }],
    });
    const frameRoot = data.storage.find(
      (location: { label: string }) => location.label === "Frame root"
    );
    expect(frameRoot.gcsUri).toContain(`/frames/${frame.sId}/`);
  });

  it("returns a null publication for a Frame that has never been published", async () => {
    const { workspace, adminAuth } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const unpublished = await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: "unpublished.json",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "con_test" },
    });

    const response = await honoApp.request(
      frameUrl(workspace.sId, unpublished.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.publication).toBeNull();
    expect(loadFramePublicationDescriptor).not.toHaveBeenCalled();
  });

  it("404s for a file that is not a Frame v2", async () => {
    const { workspace, adminAuth } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const legacy = await FileFactory.create(adminAuth, null, {
      contentType: frameContentType,
      fileName: "legacy.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(frameUrl(workspace.sId, legacy.sId));

    expect(response.status).toBe(404);
  });

  it("returns the Frame's share scope and every grant, revoked included", async () => {
    const { workspace, frame, adminAuth } = await makeTestFrameFunction({
      isSuperUser: true,
    });
    await frame.setShareScope(adminAuth, "emails_only");
    await frame.addSharingGrantsAndGetCreatedEmails(adminAuth, {
      emails: ["active@dust.tt", "revoked@dust.tt"],
    });

    const grants = await frame.listAllSharingGrants();
    const toRevoke = grants.find((grant) => grant.email === "revoked@dust.tt");
    if (!toRevoke) {
      throw new Error("Expected the grant to revoke to exist.");
    }
    const revokeResult = await frame.revokeSharingGrant({
      grantId: toRevoke.id,
    });
    expect(revokeResult.isOk()).toBe(true);

    vi.mocked(loadFramePublicationDescriptor).mockResolvedValue(
      new Ok({
        schemaVersion: 1,
        manifest: { uiEntryPoint: "app.tsx", functions: [], databases: [] },
        publishedAt: "2026-09-01T00:00:00.000Z",
        publisherId: null,
        sourceFiles: [{ path: "app.tsx", contentSha256: "a".repeat(64) }],
        ui: { bundleSha256: "b".repeat(64) },
        functions: [],
        databases: [],
      } as never)
    );

    const response = await honoApp.request(frameUrl(workspace.sId, frame.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sharing).toMatchObject({ scope: "emails_only" });
    expect(data.sharing.shareUrl).toBeTruthy();

    // Revoked grants must still be returned: they answer "they used to have access". The length
    // assertion matters — without it, dropping revoked grants would leave `.get()` undefined and
    // `not.toBeNull()` would pass anyway.
    expect(data.sharingGrants).toHaveLength(2);
    const revokedAtByEmail = new Map(
      data.sharingGrants.map(
        (grant: { email: string; revokedAt: number | null }) => [
          grant.email,
          grant.revokedAt,
        ]
      )
    );
    expect(revokedAtByEmail.get("active@dust.tt")).toBeNull();
    expect(revokedAtByEmail.get("revoked@dust.tt")).toEqual(expect.any(Number));
  });
});
