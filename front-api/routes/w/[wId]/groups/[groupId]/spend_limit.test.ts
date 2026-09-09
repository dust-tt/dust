import { GroupResource } from "@app/lib/resources/group_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";

async function makeMetronomeWorkspaceWithCustomer(): Promise<WorkspaceType> {
  return WorkspaceFactory.metronome({
    metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
  });
}

async function makeProvisionedGroup(
  workspace: WorkspaceType
): Promise<GroupResource> {
  return GroupResource.makeNew({
    name: "Sales",
    workspaceId: workspace.id,
    kind: "provisioned",
    workOSGroupId: "fake-sales",
  });
}

function groupSpendLimitUrl(wId: string, groupId: string) {
  return `/api/w/${wId}/groups/${groupId}/spend_limit`;
}

function putLimit(wId: string, groupId: string, body: Record<string, unknown>) {
  return honoApp.request(groupSpendLimitUrl(wId, groupId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/w/[wId]/groups/[groupId]/spend_limit", () => {
  describe("auth", () => {
    it("returns 403 when caller is neither an admin nor a manager", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      await createPrivateApiMockRequest({
        method: "PUT",
        role: "user",
        workspace,
      });

      const response = await putLimit(workspace.sId, group.sId, {
        kind: "limited",
        awuCredits: 1500,
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });

    it("lets a manager set the cap on a provisioned group", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      const { auth } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "manager",
        workspace,
      });

      const response = await putLimit(workspace.sId, group.sId, {
        kind: "limited",
        awuCredits: 1500,
      });

      expect(response.status).toBe(200);

      const reloaded = await GroupResource.fetchById(auth, group.sId);
      if (reloaded.isErr()) {
        throw reloaded.error;
      }
      expect(reloaded.value.poolCapAwuCredits).toBe(1500);
    });
  });

  describe("input validation", () => {
    it("returns 400 on out-of-bounds awuCredits", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      for (const awuCredits of [-1, 1.5, 100_000_000]) {
        const response = await putLimit(workspace.sId, group.sId, {
          kind: "limited",
          awuCredits,
        });
        expect(response.status).toBe(400);
      }
    });

    it("returns 404 when the group does not exist", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await putLimit(workspace.sId, "nonexistent-group-id", {
        kind: "limited",
        awuCredits: 1500,
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe("group_not_found");
    });

    it("returns 400 on a non-provisioned group", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const regularGroup = await GroupResource.makeNew({
        name: "Space group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await putLimit(workspace.sId, regularGroup.sId, {
        kind: "limited",
        awuCredits: 1500,
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });
  });

  describe("PUT", () => {
    it("persists the cap for limited", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      const { auth } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await putLimit(workspace.sId, group.sId, {
        kind: "limited",
        awuCredits: 25_000,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        limit: { kind: "limited", awuCredits: 25_000 },
      });

      // The pool-only cap is persisted on the group.
      const reloaded = await GroupResource.fetchById(auth, group.sId);
      if (reloaded.isErr()) {
        throw reloaded.error;
      }
      expect(reloaded.value.poolCapAwuCredits).toBe(25_000);
    });

    it("clears the cap for unlimited", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      const { auth } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      await group.updatePoolCap(25_000);

      const response = await putLimit(workspace.sId, group.sId, {
        kind: "unlimited",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ limit: { kind: "unlimited" } });

      const reloaded = await GroupResource.fetchById(auth, group.sId);
      if (reloaded.isErr()) {
        throw reloaded.error;
      }
      expect(reloaded.value.poolCapAwuCredits).toBeNull();
    });
  });
});
