import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { processWorkOSEventActivity } from "@app/temporal/workos_events_queue/activities";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";
import type {
  DsyncGroupUserRemovedEvent,
  OrganizationDomainDeletedEvent,
} from "@workos-inc/node";
import {
  NotFoundException,
  OrganizationDomainState,
  OrganizationDomainVerificationStrategy,
} from "@workos-inc/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetGroup, mockListDirectories, mockListUsers } = vi.hoisted(() => ({
  mockGetGroup: vi.fn(),
  mockListDirectories: vi.fn(),
  mockListUsers: vi.fn(),
}));

vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    directorySync: {
      getGroup: mockGetGroup,
      listDirectories: mockListDirectories,
    },
    userManagement: { listUsers: mockListUsers },
  }),
}));

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual("@app/lib/api/audit/workos_audit");
  return { ...actual, emitAuditLogEventDirect: vi.fn() };
});

vi.mock("@app/lib/api/workos/organization_primitives", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/workos/organization_primitives"
  );
  return {
    ...actual,
    listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
  };
});

describe("processWorkOSEventActivity", () => {
  it("idempotently deletes the workspace domain when WorkOS deletes it", async () => {
    const workspace = await WorkspaceFactory.basic();
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource || !workspace.workOSOrganizationId) {
      throw new Error("Expected a workspace with a WorkOS organization");
    }

    const domain = "deleted.example.com";
    const upsertResult = await workspaceResource.upsertWorkspaceDomain({
      domain,
    });
    expect(upsertResult.isOk()).toBe(true);

    const now = new Date().toISOString();
    const event: OrganizationDomainDeletedEvent = {
      id: "evt_domain_deleted",
      event: "organization_domain.deleted",
      context: undefined,
      createdAt: now,
      data: {
        object: "organization_domain",
        id: "org_domain_deleted",
        organizationId: workspace.workOSOrganizationId,
        domain,
        state: OrganizationDomainState.Verified,
        verificationStrategy: OrganizationDomainVerificationStrategy.Manual,
        createdAt: now,
        updatedAt: now,
      },
    };

    await processWorkOSEventActivity({ eventPayload: event });
    await processWorkOSEventActivity({ eventPayload: event });

    await expect(workspaceResource.getVerifiedDomains()).resolves.toEqual([]);
    expect(workosAudit.emitAuditLogEventDirect).toHaveBeenCalledTimes(1);
    expect(workosAudit.emitAuditLogEventDirect).toHaveBeenCalledWith({
      workspace: expect.objectContaining({
        sId: workspace.sId,
        name: workspace.name,
      }),
      action: "domain.removed",
      actor: { type: "system", id: "workos", name: "WorkOS" },
      targets: [{ type: "workspace", id: workspace.sId, name: workspace.name }],
      context: { location: "system" },
      metadata: { domain },
    });
  });
  describe("dsync.group.user_removed", () => {
    const directoryId = "directory_test";
    const groupId = "directory_group_test";

    beforeEach(() => {
      vi.clearAllMocks();
      mockListDirectories.mockResolvedValue({ data: [{ id: directoryId }] });
    });

    async function setupMemberWithWorkOSUser() {
      const workspace = await WorkspaceFactory.enterprise();
      if (!workspace.workOSOrganizationId) {
        throw new Error("Expected a workspace with a WorkOS organization");
      }
      const workOSUserId = faker.string.uuid();
      const user = await UserFactory.withWorkOSId(workOSUserId);
      await MembershipFactory.associate(workspace, user, { role: "user" });
      mockListUsers.mockResolvedValue({
        data: [{ id: workOSUserId, email: user.email }],
      });

      return { workspace, user };
    }

    function makeUserRemovedEvent(
      workspace: WorkspaceType,
      email: string
    ): DsyncGroupUserRemovedEvent {
      const now = new Date().toISOString();
      return {
        id: "evt_group_user_removed",
        event: "dsync.group.user_removed",
        context: undefined,
        createdAt: now,
        data: {
          directoryId,
          user: {
            object: "directory_user",
            id: "directory_user_test",
            directoryId,
            organizationId: workspace.workOSOrganizationId,
            rawAttributes: {},
            customAttributes: {},
            idpId: "idp_user_test",
            firstName: "Test",
            lastName: "User",
            email,
            emails: [{ primary: true, value: email }],
            username: email,
            jobTitle: null,
            state: "active",
            createdAt: now,
            updatedAt: now,
          },
          group: {
            id: groupId,
            idpId: "idp_group_test",
            directoryId,
            organizationId: workspace.workOSOrganizationId,
            name: "Deleted group",
            createdAt: now,
            updatedAt: now,
            rawAttributes: {},
          },
        },
      };
    }

    it("skips the removal when the group is gone locally and in WorkOS", async () => {
      const { workspace, user } = await setupMemberWithWorkOSUser();
      mockGetGroup.mockRejectedValue(
        new NotFoundException({
          path: `/directory_groups/${groupId}`,
          requestID: "req_test",
        })
      );

      await expect(
        processWorkOSEventActivity({
          eventPayload: makeUserRemovedEvent(workspace, user.email),
        })
      ).resolves.toBeUndefined();

      expect(mockGetGroup).toHaveBeenCalledWith(groupId);
      expect(workosAudit.emitAuditLogEventDirect).not.toHaveBeenCalled();
    });

    it("still fails when the group is missing locally but exists in WorkOS", async () => {
      const { workspace, user } = await setupMemberWithWorkOSUser();
      mockGetGroup.mockResolvedValue({ id: groupId });

      await expect(
        processWorkOSEventActivity({
          eventPayload: makeUserRemovedEvent(workspace, user.email),
        })
      ).rejects.toThrow(`Group not found for workOSId "${groupId}"`);
    });

    it("rethrows unexpected WorkOS errors from the group lookup", async () => {
      const { workspace, user } = await setupMemberWithWorkOSUser();
      mockGetGroup.mockRejectedValue(new Error("WorkOS unavailable"));

      await expect(
        processWorkOSEventActivity({
          eventPayload: makeUserRemovedEvent(workspace, user.email),
        })
      ).rejects.toThrow("WorkOS unavailable");
    });
  });
});
