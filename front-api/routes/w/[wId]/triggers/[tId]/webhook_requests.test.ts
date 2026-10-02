import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getWebhookRequests(workspace: { sId: string }, tId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/triggers/${tId}/webhook_requests`
  );
}

async function setup(role: MembershipRoleType) {
  const { workspace, user } = await createPrivateApiMockRequest({
    plan: "creditPriced",
    method: "GET",
    role,
  });
  const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
  return { workspace, user, agentOwnerAuth };
}

// `includePayload: false` keeps the handler away from GCS; access checks run before it.
async function createTrigger(
  auth: Authenticator,
  { scope = "visible" }: { scope?: "visible" | "hidden" } = {}
) {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    scope,
  });
  return TriggerFactory.webhook(auth, {
    agentConfigurationId: agent.sId,
    configuration: { includePayload: false },
  });
}

describe("GET /api/w/:wId/triggers/:tId/webhook_requests", () => {
  it("returns the requests of a trigger the caller can read", async () => {
    const { workspace, user } = await setup("user");
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const trigger = await createTrigger(auth);

    const response = await getWebhookRequests(workspace, trigger.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requests: [] });
  });

  it("returns 404 for a trigger on an agent the caller cannot read", async () => {
    const { workspace, agentOwnerAuth } = await setup("user");
    const trigger = await createTrigger(agentOwnerAuth, { scope: "hidden" });

    const response = await getWebhookRequests(workspace, trigger.sId);

    expect(response.status).toBe(404);
  });

  it("lets an admin read a trigger on an agent they cannot read", async () => {
    const { workspace, agentOwnerAuth } = await setup("admin");
    const trigger = await createTrigger(agentOwnerAuth, { scope: "hidden" });

    const response = await getWebhookRequests(workspace, trigger.sId);

    expect(response.status).toBe(200);
  });
});
