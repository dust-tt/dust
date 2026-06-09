import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { frameContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function url(workspace: { sId: string }, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/share/grants`;
}

function getGrants(workspace: { sId: string }, fileId: string) {
  return honoApp.request(url(workspace, fileId));
}

function postGrants(workspace: { sId: string }, fileId: string, body: unknown) {
  return honoApp.request(url(workspace, fileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteGrant(
  workspace: { sId: string },
  fileId: string,
  body: unknown
) {
  return honoApp.request(url(workspace, fileId), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sharing grants endpoint", () => {
  it("should return 400 for non-interactive-content files", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await getGrants(workspace, file.sId);

    expect(response.status).toBe(400);
  });

  it("should return empty grants list for a new frame", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await getGrants(workspace, file.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).grants).toEqual([]);
  });

  it("should add grants for multiple emails", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com", "bob@example.com"],
    });

    expect(response.status).toBe(200);
    const { grants } = await response.json();
    expect(grants).toHaveLength(2);
    expect(grants.map((g: { email: string }) => g.email).sort()).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
  });

  it("should populate grantedBy with the granting user", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com"],
    });

    expect(response.status).toBe(200);
    const { grants } = await response.json();
    expect(grants).toHaveLength(1);
    expect(grants[0].grantedBy).not.toBeNull();
    expect(grants[0].grantedBy.sId).toBe(user.sId);
    expect(grants[0].grantedBy.email).toBe(user.email);
  });

  it("should be idempotent when adding the same email twice", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const first = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com"],
    });
    expect(first.status).toBe(200);
    const firstGrants = (await first.json()).grants;
    expect(firstGrants).toHaveLength(1);

    const second = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com"],
    });
    expect(second.status).toBe(200);
    const secondGrants = (await second.json()).grants;
    expect(secondGrants).toHaveLength(1);
    expect(secondGrants[0].id).toBe(firstGrants[0].id);
  });

  it("should normalize email to lowercase", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postGrants(workspace, file.sId, {
      emails: ["Alice@Example.COM"],
    });

    expect(response.status).toBe(200);
    expect((await response.json()).grants[0].email).toBe("alice@example.com");
  });

  it("should revoke a grant and no longer list it", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const addRes = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com"],
    });
    expect(addRes.status).toBe(200);
    const grantId = (await addRes.json()).grants[0].id;

    const delRes = await deleteGrant(workspace, file.sId, { grantId });
    expect(delRes.status).toBe(204);

    const listRes = await getGrants(workspace, file.sId);
    expect(listRes.status).toBe(200);
    expect((await listRes.json()).grants).toEqual([]);
  });

  describe("workspace_only sharing policy", () => {
    it("blocks inviting an external email", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await WorkspaceModel.update(
        { sharingPolicy: "workspace_only" },
        { where: { sId: workspace.sId } }
      );

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(403);
    });

    it("allows inviting a workspace member", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await WorkspaceModel.update(
        { sharingPolicy: "workspace_only" },
        { where: { sId: workspace.sId } }
      );

      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: [member.email],
      });

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe(member.email.toLowerCase());
    });

    it("marks existing external grants as blockedByPolicy on GET", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      // Add a grant while policy is still permissive.
      await file.addSharingGrants(auth, { emails: ["external@example.com"] });

      // Now restrict to workspace_only.
      await WorkspaceModel.update(
        { sharingPolicy: "workspace_only" },
        { where: { sId: workspace.sId } }
      );

      const response = await getGrants(workspace, file.sId);

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe("external@example.com");
      expect(grants[0].blockedByPolicy).toBe(true);
    });

    it("does not mark workspace member grants as blockedByPolicy on GET", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      await file.addSharingGrants(auth, { emails: [member.email] });

      await WorkspaceModel.update(
        { sharingPolicy: "workspace_only" },
        { where: { sId: workspace.sId } }
      );

      const response = await getGrants(workspace, file.sId);

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].blockedByPolicy).toBe(false);
    });

    it("blocks if any email in the batch is not a workspace member", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await WorkspaceModel.update(
        { sharingPolicy: "workspace_only" },
        { where: { sId: workspace.sId } }
      );

      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: [member.email, "external@example.com"],
      });

      expect(response.status).toBe(403);
    });
  });

  it("should return 404 when revoking a non-existent grant", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await deleteGrant(workspace, file.sId, {
      grantId: 999999,
    });

    expect(response.status).toBe(404);
  });

  it("should reject invalid email addresses", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postGrants(workspace, file.sId, {
      emails: ["not-an-email"],
    });

    expect(response.status).toBe(400);
  });
});
