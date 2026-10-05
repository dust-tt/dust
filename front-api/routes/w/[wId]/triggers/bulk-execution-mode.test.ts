import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest({
  role = "admin",
  withWorkspacePoolGrant = true,
}: {
  role?: MembershipRoleType;
  withWorkspacePoolGrant?: boolean;
}) {
  const { workspace, user } = await createPrivateApiMockRequest({
    plan: "creditPriced",
    method: "POST",
    role,
  });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  if (withWorkspacePoolGrant) {
    await GroupPermissionResource.setForEverybody(adminAuth, {
      grantType: "use_workspace_pool",
      resourceType: "trigger",
    });
  }
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  return { workspace, auth, agentId: agent.sId };
}

function postBulkExecutionMode(wId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${wId}/triggers/bulk-execution-mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/triggers/bulk-execution-mode", () => {
  it("returns 403 for regular users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postBulkExecutionMode(workspace.sId, {
      selection: { mode: "ids", triggerIds: ["trg1"] },
      executionMode: "workspace_pool",
    });

    expect(response.status).toBe(403);
  });

  it("moves the selected triggers to the workspace pool", async () => {
    const { workspace, auth, agentId } = await setupTest({});
    const triggers = await Promise.all([
      TriggerFactory.webhook(auth, {
        agentConfigurationId: agentId,
        executionMode: "user_pool",
      }),
      TriggerFactory.webhook(auth, {
        agentConfigurationId: agentId,
        executionMode: "user_pool",
      }),
    ]);

    const response = await postBulkExecutionMode(workspace.sId, {
      selection: {
        mode: "ids",
        triggerIds: triggers.map((trigger) => trigger.sId),
      },
      executionMode: "workspace_pool",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      updatedCount: 2,
      skippedCount: 0,
    });

    const updated = await TriggerResource.fetchByIds(
      auth,
      triggers.map((trigger) => trigger.sId)
    );
    expect(updated.map((trigger) => trigger.executionMode)).toEqual([
      "workspace_pool",
      "workspace_pool",
    ]);
  });

  it("skips every trigger when the workspace pool is not granted", async () => {
    const { workspace, auth, agentId } = await setupTest({
      role: "manager",
      withWorkspacePoolGrant: false,
    });
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agentId,
      executionMode: "user_pool",
    });

    const response = await postBulkExecutionMode(workspace.sId, {
      selection: { mode: "ids", triggerIds: [trigger.sId] },
      executionMode: "workspace_pool",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      updatedCount: 0,
      skippedCount: 1,
    });
  });
});
