import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// `TriggerResource.makeNew` requires a user editor, not the internal-admin auth.
async function userAuthForWorkspace(workspace: WorkspaceType) {
  const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await SpaceFactory.defaults(internalAdminAuth);

  const owner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, owner, { role: "admin" });
  return Authenticator.fromUserIdAndWorkspaceId(owner.sId, workspace.sId);
}

function getTrigger(
  workspace: { sId: string },
  key: { secret: string },
  tId: string
) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/triggers/${tId}`, {
    headers: { authorization: `Bearer ${key.secret}` },
  });
}

describe("GET /api/v1/w/:wId/triggers/:tId", () => {
  it("returns 403 for a non-admin key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "builder",
    });

    const response = await getTrigger(workspace, key, "trigger-0");

    expect(response.status).toBe(403);
  });

  it("returns 404 for an unknown trigger", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await getTrigger(workspace, key, "trigger-unknown");

    expect(response.status).toBe(404);
  });

  it("returns the trigger for an admin key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const auth = await userAuthForWorkspace(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.schedule(auth, {
      agentConfigurationId: agent.sId,
      configuration: { type: "cron", cron: "0 9 * * *", timezone: "UTC" },
    });

    const response = await getTrigger(workspace, key, trigger.sId);
    expect(response.status).toBe(200);

    const { trigger: serialized } = await response.json();
    expect(serialized.sId).toBe(trigger.sId);
    expect(serialized.kind).toBe("schedule");
  });
});
