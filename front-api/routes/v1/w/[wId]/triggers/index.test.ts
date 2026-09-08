import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// `TriggerResource.makeNew` requires a user editor, not the internal-admin auth.
async function userAuthForWorkspace(workspace: WorkspaceType) {
  const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const { systemSpace } = await SpaceFactory.defaults(internalAdminAuth);

  const owner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, owner, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    owner.sId,
    workspace.sId
  );

  return { auth, systemSpace };
}

function listTriggers(
  workspace: { sId: string },
  key: { secret: string },
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/triggers${qs ? `?${qs}` : ""}`,
    { headers: { authorization: `Bearer ${key.secret}` } }
  );
}

describe("GET /api/v1/w/:wId/triggers", () => {
  it("returns 403 for a non-admin key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "builder",
    });

    const response = await listTriggers(workspace, key);

    expect(response.status).toBe(403);
  });

  it("returns the workspace's triggers across agents", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const { auth } = await userAuthForWorkspace(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const trigger = await TriggerFactory.schedule(auth, {
      agentConfigurationId: agent.sId,
      configuration: { type: "cron", cron: "0 9 * * *", timezone: "UTC" },
    });

    const response = await listTriggers(workspace, key);
    expect(response.status).toBe(200);
    const { triggers } = await response.json();
    expect(triggers).toHaveLength(1);
    expect(triggers[0].sId).toBe(trigger.sId);
    expect(triggers[0].kind).toBe("schedule");
  });

  it("filters by kind and includes a webhookSource label for webhook triggers", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const { auth, systemSpace } = await userAuthForWorkspace(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const view = await new WebhookSourceViewFactory(workspace).create(
      systemSpace
    );

    await TriggerFactory.schedule(auth, {
      agentConfigurationId: agent.sId,
      configuration: { type: "cron", cron: "0 9 * * *", timezone: "UTC" },
    });
    const webhookTrigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      webhookSourceViewId: view.id,
    });

    const response = await listTriggers(workspace, key, {
      kind: "webhook",
    });
    expect(response.status).toBe(200);

    const { triggers } = await response.json();
    expect(triggers).toHaveLength(1);
    expect(triggers[0].sId).toBe(webhookTrigger.sId);
    expect(triggers[0].webhookSource).toEqual({
      name: view.name,
      provider: "custom",
    });
    expect(triggers[0].editor).toBeUndefined();
    expect(triggers[0].webhookSourceViewId).toBeUndefined();
  });
});
