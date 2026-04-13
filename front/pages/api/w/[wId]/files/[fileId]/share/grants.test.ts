import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { frameContentType } from "@app/types/files";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./grants";

describe("sharing grants endpoint", () => {
  describe("without email_restricted_sharing feature flag", () => {
    it("should return 403", async () => {
      const { req, res, auth, user } = await createPrivateApiMockRequest({
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
      req.query = { ...req.query, fileId: file.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });
  });

  describe("with email_restricted_sharing feature flag", () => {
    it("should return 400 for non-interactive-content files", async () => {
      const { req, res, auth, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: "application/pdf",
        fileName: "test.pdf",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      req.query = { ...req.query, fileId: file.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("should return empty grants list for a new frame", async () => {
      const { req, res, auth, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });
      req.query = { ...req.query, fileId: file.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().grants).toEqual([]);
    });

    it("should add grants for multiple emails", async () => {
      const { req, res, auth, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });
      req.query = { ...req.query, fileId: file.sId };
      req.body = { emails: ["alice@example.com", "bob@example.com"] };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const { grants } = res._getJSONData();
      expect(grants).toHaveLength(2);
      expect(grants.map((g: { email: string }) => g.email).sort()).toEqual([
        "alice@example.com",
        "bob@example.com",
      ]);
    });

    it("should populate grantedBy with the granting user", async () => {
      const { req, res, auth, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });
      req.query = { ...req.query, fileId: file.sId };
      req.body = { emails: ["alice@example.com"] };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const { grants } = res._getJSONData();
      expect(grants).toHaveLength(1);
      expect(grants[0].grantedBy).not.toBeNull();
      expect(grants[0].grantedBy.sId).toBe(user.sId);
      expect(grants[0].grantedBy.email).toBe(user.email);
    });

    it("should be idempotent when adding the same email twice", async () => {
      const { req, res, auth, workspace, user } =
        await createPrivateApiMockRequest({
          method: "POST",
          role: "user",
        });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      // First request: add alice.
      req.query = { ...req.query, fileId: file.sId };
      req.body = { emails: ["alice@example.com"] };
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const firstGrants = res._getJSONData().grants;
      expect(firstGrants).toHaveLength(1);

      // Second request: add alice again (reuse same workspace session).
      const { req: req2, res: res2 } = createMocks<
        NextApiRequest,
        NextApiResponse
      >({
        method: "POST",
        query: { wId: workspace.sId, fileId: file.sId },
        body: { emails: ["alice@example.com"] },
      });
      await handler(req2, res2);

      expect(res2._getStatusCode()).toBe(200);
      const secondGrants = res2._getJSONData().grants;
      expect(secondGrants).toHaveLength(1);
      expect(secondGrants[0].id).toBe(firstGrants[0].id);
    });

    it("should normalize email to lowercase", async () => {
      const { req, res, auth, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });
      req.query = { ...req.query, fileId: file.sId };
      req.body = { emails: ["Alice@Example.COM"] };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().grants[0].email).toBe("alice@example.com");
    });

    it("should revoke a grant and no longer list it", async () => {
      const { req, res, workspace, auth, user } =
        await createPrivateApiMockRequest({
          method: "POST",
          role: "user",
        });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      // Add a grant.
      req.query = { ...req.query, fileId: file.sId };
      req.body = { emails: ["alice@example.com"] };
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const grantId = res._getJSONData().grants[0].id;

      // Revoke the grant.
      const { req: delReq, res: delRes } = createMocks<
        NextApiRequest,
        NextApiResponse
      >({
        method: "DELETE",
        query: { wId: workspace.sId, fileId: file.sId },
        body: { grantId },
      });
      await handler(delReq, delRes);

      expect(delRes._getStatusCode()).toBe(204);

      // List grants — should be empty.
      const { req: listReq, res: listRes } = createMocks<
        NextApiRequest,
        NextApiResponse
      >({
        method: "GET",
        query: { wId: workspace.sId, fileId: file.sId },
      });
      await handler(listReq, listRes);

      expect(listRes._getStatusCode()).toBe(200);
      expect(listRes._getJSONData().grants).toEqual([]);
    });

    describe("workspace_only sharing policy", () => {
      it("blocks inviting an external email", async () => {
        const { req, res, auth, user, workspace } =
          await createPrivateApiMockRequest({ method: "POST", role: "user" });

        await FeatureFlagFactory.basic(auth, "email_restricted_sharing");
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
        req.query = { ...req.query, fileId: file.sId };
        req.body = { emails: ["external@example.com"] };

        await handler(req, res);

        expect(res._getStatusCode()).toBe(403);
      });

      it("allows inviting a workspace member", async () => {
        const { req, res, auth, user, workspace } =
          await createPrivateApiMockRequest({ method: "POST", role: "user" });

        await FeatureFlagFactory.basic(auth, "email_restricted_sharing");
        await WorkspaceModel.update(
          { sharingPolicy: "workspace_only" },
          { where: { sId: workspace.sId } }
        );

        // Create a second workspace member to invite.
        const member = await UserFactory.basic();
        await MembershipFactory.associate(workspace, member, { role: "user" });

        const file = await FileFactory.create(auth, user, {
          contentType: frameContentType,
          fileName: "test-frame.tsx",
          fileSize: 1024,
          status: "ready",
          useCase: "conversation",
        });
        req.query = { ...req.query, fileId: file.sId };
        req.body = { emails: [member.email] };

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData().grants).toHaveLength(1);
        expect(res._getJSONData().grants[0].email).toBe(
          member.email.toLowerCase()
        );
      });

      it("marks existing external grants as blockedByPolicy on GET", async () => {
        const { auth, user, workspace } = await createPrivateApiMockRequest({
          method: "POST",
          role: "user",
        });

        await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

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

        // GET should return the grant with blockedByPolicy: true.
        const { req: getReq, res: getRes } = createMocks<
          NextApiRequest,
          NextApiResponse
        >({
          method: "GET",
          query: { wId: workspace.sId, fileId: file.sId },
        });
        await handler(getReq, getRes);

        expect(getRes._getStatusCode()).toBe(200);
        const { grants } = getRes._getJSONData();
        expect(grants).toHaveLength(1);
        expect(grants[0].email).toBe("external@example.com");
        expect(grants[0].blockedByPolicy).toBe(true);
      });

      it("does not mark workspace member grants as blockedByPolicy on GET", async () => {
        const { auth, user, workspace } = await createPrivateApiMockRequest({
          method: "POST",
          role: "user",
        });

        await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

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

        const { req: getReq, res: getRes } = createMocks<
          NextApiRequest,
          NextApiResponse
        >({
          method: "GET",
          query: { wId: workspace.sId, fileId: file.sId },
        });
        await handler(getReq, getRes);

        expect(getRes._getStatusCode()).toBe(200);
        const { grants } = getRes._getJSONData();
        expect(grants).toHaveLength(1);
        expect(grants[0].blockedByPolicy).toBe(false);
      });

      it("blocks if any email in the batch is not a workspace member", async () => {
        const { req, res, auth, user, workspace } =
          await createPrivateApiMockRequest({ method: "POST", role: "user" });

        await FeatureFlagFactory.basic(auth, "email_restricted_sharing");
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
        req.query = { ...req.query, fileId: file.sId };
        req.body = { emails: [member.email, "external@example.com"] };

        await handler(req, res);

        expect(res._getStatusCode()).toBe(403);
      });
    });

    it("should return 404 when revoking a non-existent grant", async () => {
      const { req, res, auth, user } = await createPrivateApiMockRequest({
        method: "DELETE",
        role: "user",
      });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });
      req.query = { ...req.query, fileId: file.sId };
      req.body = { grantId: 999999 };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("should reject invalid email addresses", async () => {
      const { req, res, auth, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await FeatureFlagFactory.basic(auth, "email_restricted_sharing");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });
      req.query = { ...req.query, fileId: file.sId };
      req.body = { emails: ["not-an-email"] };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });
  });
});
