import { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceSharingPolicy } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return {
    ...actual,
    emitAuditLogEvent: mockEmitAuditLogEvent,
  };
});

// The permission gate we exercise here runs before the frame content pipeline. Stub the two
// downstream helpers so the endpoint completes without reading frame content from storage —
// that pipeline is covered by lib/api/viz/authorized_file_access.test.ts.
vi.mock("@app/lib/api/viz/authorized_file_access", () => ({
  ensureAuthorizedFileAccessForShare: vi.fn().mockResolvedValue(new Ok({})),
}));
vi.mock("@app/lib/api/viz/share_frame_viewer_files", () => ({
  buildShareFileResponse: vi.fn(async (_auth: unknown, file: FileResource) => ({
    scope: await file.getShareScope(),
    sharedAt: Date.now(),
    shareUrl: "https://example.com/share",
    viewerFiles: [],
  })),
}));

function url(workspace: { sId: string }, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/share`;
}

async function grantPublishToEveryone(workspace: { sId: string }) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await GroupPermissionResource.setForEverybody(adminAuth, {
    grantType: "publish",
    resourceType: "frame",
  });
}

async function setSharingPolicy(
  workspace: { sId: string },
  sharingPolicy: WorkspaceSharingPolicy
) {
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource) {
    throw new Error(`Workspace ${workspace.sId} not found.`);
  }
  await workspaceResource.updateWorkspaceSettings({ sharingPolicy });
}

function postShare(workspace: { sId: string }, fileId: string, body: unknown) {
  return honoApp.request(url(workspace, fileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("share scope endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("publish permission (public scope)", () => {
    it("blocks publishing a frame publicly without the publish permission", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      // The workspace policy allows public sharing...
      await setSharingPolicy(workspace, "all_scopes");

      // ...but the caller was never granted the "publish" frame permission.
      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postShare(workspace, file.sId, {
        shareScope: "public",
      });

      expect(response.status).toBe(403);
    });

    it("allows publishing a frame publicly with the publish permission", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      await setSharingPolicy(workspace, "all_scopes");
      await grantPublishToEveryone(workspace);

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postShare(workspace, file.sId, {
        shareScope: "public",
      });

      expect(response.status).toBe(200);
      expect((await response.json()).scope).toBe("public");
      expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "frame.share_scope_updated",
          metadata: {
            frame_name: "test-frame.tsx",
            share_scope: "public",
          },
          targets: [
            expect.objectContaining({ type: "workspace", id: workspace.sId }),
            expect.objectContaining({ type: "frame", id: file.sId }),
          ],
        })
      );
    });

    it("allows an admin to publish a frame publicly without an explicit publish grant", async () => {
      // Admins hold every governance capability by default.
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
      await setSharingPolicy(workspace, "all_scopes");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postShare(workspace, file.sId, {
        shareScope: "public",
      });

      expect(response.status).toBe(200);
      expect((await response.json()).scope).toBe("public");
    });

    it("blocks publishing publicly when the workspace policy forbids public sharing, even with the publish permission", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      await setSharingPolicy(workspace, "workspace_and_emails");
      await grantPublishToEveryone(workspace);

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postShare(workspace, file.sId, {
        shareScope: "public",
      });

      expect(response.status).toBe(403);
    });

    it("blocks an admin from publishing publicly when the workspace policy forbids public sharing (policy overrides admin)", async () => {
      // The workspace policy is checked before the permission/admin bypass, so even an admin
      // cannot publish publicly when the workspace policy does not allow public sharing.
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
      await setSharingPolicy(workspace, "workspace_and_emails");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postShare(workspace, file.sId, {
        shareScope: "public",
      });

      expect(response.status).toBe(403);
    });

    it("allows setting an internal scope without the publish permission", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      await setSharingPolicy(workspace, "all_scopes");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postShare(workspace, file.sId, {
        shareScope: "workspace_and_emails",
      });

      expect(response.status).toBe(200);
      expect((await response.json()).scope).toBe("workspace_and_emails");
    });

    it("rejects Frames v2 scope mutations", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      const file = await FileFactory.create(auth, user, {
        contentType: frameV2ContentType,
        fileName: "manifest.json",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });
      const initialScope = await file.getShareScope();

      const response = await postShare(workspace, file.sId, {
        shareScope: "emails_only",
      });

      expect(response.status).toBe(400);
      expect(await file.getShareScope()).toBe(initialScope);
      expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
    });
  });
});
