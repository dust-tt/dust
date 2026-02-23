import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/workos/organization_primitives", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/workos/organization_primitives"
  );
  return {
    ...actual,
    listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
  };
});

import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";

describe("WorkspaceResource", () => {
  let workspace: WorkspaceType;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
  });

  describe("updateConversationsRetention", () => {
    it("should set retention days value", async () => {
      const result = await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        30
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.conversationsRetentionDays).toBe(30);
    });

    it("should convert -1 to null", async () => {
      // First set a value
      await WorkspaceResource.updateConversationsRetention(workspace.id, 60);

      // Then set -1 which should convert to null
      const result = await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        -1
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.conversationsRetentionDays).toBeNull();
    });
  });

  describe("disableSSOEnforcement", () => {
    it("should disable SSO when enabled", async () => {
      // Enable SSO first
      await WorkspaceResource.updateByModelIdAndCheckExistence(workspace.id, {
        ssoEnforced: true,
      });

      const result = await WorkspaceResource.disableSSOEnforcement(
        workspace.id
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.ssoEnforced).toBe(false);
    });

    it("should return error when SSO already disabled", async () => {
      // SSO is disabled by default, try to disable again
      const result = await WorkspaceResource.disableSSOEnforcement(
        workspace.id
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "SSO enforcement is already disabled."
        );
      }
    });
  });

  describe("canShareInteractiveContentPublicly", () => {
    it("should return true by default when no metadata", async () => {
      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(true);
    });

    it("should return false when metadata.allowContentCreationFileSharing is false", async () => {
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowContentCreationFileSharing: false,
      });

      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(false);
    });

    it("should return true when metadata.allowContentCreationFileSharing is true", async () => {
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowContentCreationFileSharing: true,
      });

      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(true);
    });
  });

  describe("verified domains", () => {
    describe("getVerifiedDomains", () => {
      it("should return empty array when no domains", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);

        const domains = await resource!.getVerifiedDomains();

        expect(domains).toEqual([]);
      });

      it("should return domains when added", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource!.upsertWorkspaceDomain({ domain: "example.com" });

        const domains = await resource!.getVerifiedDomains();

        expect(domains).toHaveLength(1);
        expect(domains[0].domain).toBe("example.com");
        expect(domains[0].domainAutoJoinEnabled).toBe(false);
      });
    });

    describe("upsertWorkspaceDomain", () => {
      it("should create a new domain", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);

        const result = await resource!.upsertWorkspaceDomain({
          domain: "newdomain.com",
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.domain).toBe("newdomain.com");
          expect(result.value.domainAutoJoinEnabled).toBe(false);
        }
      });

      it("should return existing domain if already linked to same workspace", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource!.upsertWorkspaceDomain({ domain: "existing.com" });

        const result = await resource!.upsertWorkspaceDomain({
          domain: "existing.com",
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.domain).toBe("existing.com");
        }
      });

      it("should return error if domain belongs to another workspace", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource!.upsertWorkspaceDomain({ domain: "taken.com" });

        const otherWorkspace = await WorkspaceFactory.basic();
        const otherResource = await WorkspaceResource.fetchById(
          otherWorkspace.sId
        );

        const result = await otherResource!.upsertWorkspaceDomain({
          domain: "taken.com",
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain("already exists in workspace");
        }
      });
    });

    describe("deleteDomain", () => {
      it("should delete an existing domain", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource!.upsertWorkspaceDomain({ domain: "todelete.com" });

        const result = await resource!.deleteDomain({ domain: "todelete.com" });

        expect(result.isOk()).toBe(true);
        const domains = await resource!.getVerifiedDomains();
        expect(domains).toEqual([]);
      });

      it("should return error when domain not found", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);

        const result = await resource!.deleteDomain({
          domain: "nonexistent.com",
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain("not found");
        }
      });
    });

    describe("updateDomainAutoJoinEnabled", () => {
      it("should enable auto-join for a domain", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource!.upsertWorkspaceDomain({ domain: "autojoin.com" });

        const result = await resource!.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: true,
          domain: "autojoin.com",
        });

        expect(result.isOk()).toBe(true);
        const domains = await resource!.getVerifiedDomains();
        expect(domains[0].domainAutoJoinEnabled).toBe(true);
      });

      it("should disable auto-join for a domain", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource!.upsertWorkspaceDomain({ domain: "autojoin2.com" });
        await resource!.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: true,
          domain: "autojoin2.com",
        });

        const result = await resource!.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: false,
          domain: "autojoin2.com",
        });

        expect(result.isOk()).toBe(true);
        const domains = await resource!.getVerifiedDomains();
        expect(domains[0].domainAutoJoinEnabled).toBe(false);
      });

      it("should return error when workspace has no verified domains", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);

        const result = await resource!.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: true,
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toBe(
            "The workspace does not have any verified domain."
          );
        }
      });
    });

    describe("fetchByDomain", () => {
      it("should return workspace when domain exists", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource!.upsertWorkspaceDomain({ domain: "findme.com" });

        const found = await WorkspaceResource.fetchByDomain("findme.com");

        expect(found).not.toBeNull();
        expect(found!.sId).toBe(workspace.sId);
      });

      it("should return null when domain does not exist", async () => {
        const found = await WorkspaceResource.fetchByDomain("doesnotexist.com");

        expect(found).toBeNull();
      });
    });
  });
});
