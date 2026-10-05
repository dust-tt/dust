import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
}));

function restore(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/restore`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Archives the agent as its owner (who holds the `admin` verb via the editor grant), so the restore
// tests start from an archived agent.
async function archiveAgent(auth: Authenticator, sId: string) {
  const agent = await AgentResource.fetchById(auth, sId);
  assert(agent);
  const result = await agent.archive(auth);
  assert(result.isOk());
}

async function fetchStatus(workspace: { sId: string }, sId: string) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const agent = await AgentResource.fetchById(auth, sId);
  return agent?.status;
}

async function setup(
  opts: {
    requestUserRole?: MembershipRoleType;
    agentOwnerRole?: MembershipRoleType;
    scope?: "visible" | "hidden";
  } = {}
) {
  const requestUserRole = opts.requestUserRole ?? "admin";
  const agentOwnerRole = opts.agentOwnerRole ?? requestUserRole;
  const scope = opts.scope ?? "visible";

  const { workspace, user: requestUser } = await createPrivateApiMockRequest({
    role: requestUserRole,
  });

  // When the owner shares the requester's role, the requester owns (and edits) the agent; otherwise
  // a distinct member owns it and the requester is not an editor.
  let agentOwnerAuth: Authenticator;
  if (agentOwnerRole === requestUserRole) {
    agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      requestUser.sId,
      workspace.sId
    );
  } else {
    const owner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, owner, {
      role: agentOwnerRole,
    });
    agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      owner.sId,
      workspace.sId
    );
  }

  const agent = await AgentConfigurationFactory.createTestAgent(
    agentOwnerAuth,
    {
      scope,
    }
  );
  return { workspace, requestUser, agentOwnerAuth, agent };
}

describe("POST /api/w/:wId/assistant/agent_configurations/:aId/restore", () => {
  it("restores an archived agent for a workspace admin", async () => {
    const { workspace, agentOwnerAuth, agent } = await setup({
      requestUserRole: "admin",
    });
    await archiveAgent(agentOwnerAuth, agent.sId);

    const res = await restore(workspace, agent.sId);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await fetchStatus(workspace, agent.sId)).toBe("active");
  });

  it("restores an archived agent for a non-admin editor of the agent", async () => {
    // The requester is a plain member and the agent's editor, so it holds the agent `admin` verb
    // through the editor grant even without the workspace admin role. The agent is hidden, so
    // restoring it is not a (re)publish and needs no `publish` capability.
    const { workspace, agentOwnerAuth, agent } = await setup({
      requestUserRole: "user",
      agentOwnerRole: "user",
      scope: "hidden",
    });
    await archiveAgent(agentOwnerAuth, agent.sId);

    const res = await restore(workspace, agent.sId);

    expect(res.status).toBe(200);
    expect(await fetchStatus(workspace, agent.sId)).toBe("active");
  });

  it("rejects restoration by a member who is neither an editor nor an admin", async () => {
    // The requester is a plain member who is not an editor of the (visible) agent: it can read the
    // agent but lacks the `admin` verb required to restore.
    const { workspace, agentOwnerAuth, agent } = await setup({
      requestUserRole: "user",
      agentOwnerRole: "admin",
    });
    await archiveAgent(agentOwnerAuth, agent.sId);

    const res = await restore(workspace, agent.sId);

    expect(res.status).toBe(403);
    expect(await fetchStatus(workspace, agent.sId)).toBe("archived");
  });

  it("returns 404 for a non-existent agent", async () => {
    const { workspace } = await setup();

    const res = await restore(workspace, "agent_does_not_exist");

    expect(res.status).toBe(404);
  });

  it("returns an error when the agent is not archived", async () => {
    const { workspace, agent } = await setup({ requestUserRole: "admin" });

    const res = await restore(workspace, agent.sId);

    expect(res.status).toBe(500);
    expect(await fetchStatus(workspace, agent.sId)).toBe("active");
  });

  it("rejects restoration when an active agent already holds the name", async () => {
    const { workspace, agentOwnerAuth, agent } = await setup({
      requestUserRole: "admin",
    });
    await archiveAgent(agentOwnerAuth, agent.sId);
    // A different active agent now holds the archived agent's name, so restoring would collide on
    // the (workspaceId, name) unique index.
    await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
      name: agent.name,
    });

    const res = await restore(workspace, agent.sId);

    expect(res.status).toBe(400);
    expect(await fetchStatus(workspace, agent.sId)).toBe("archived");
  });
});
