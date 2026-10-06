import { fetchVersionMarkers } from "@app/lib/api/assistant/observability/version_markers";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/assistant/observability/version_markers"), () => ({
  fetchVersionMarkers: vi.fn(),
}));

function getVersionMarkers(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/observability/version-markers`
  );
}

async function setupHiddenAgent(role: MembershipRoleType) {
  const { workspace } = await createPrivateApiMockRequest({ role });
  const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
  const agent = await AgentConfigurationFactory.createTestAgent(
    agentOwnerAuth,
    { scope: "hidden" }
  );
  return { workspace, agent };
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/observability/version-markers", () => {
  beforeEach(() => {
    vi.mocked(fetchVersionMarkers).mockReset();
    vi.mocked(fetchVersionMarkers).mockResolvedValue(new Ok([]));
  });

  it("returns the version markers to a reader of the agent", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await getVersionMarkers(workspace, agent.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ versionMarkers: [] });
  });

  it("returns 404 to a manager for a hidden agent they cannot read", async () => {
    const { workspace, agent } = await setupHiddenAgent("manager");

    const response = await getVersionMarkers(workspace, agent.sId);

    expect(response.status).toBe(404);
    expect(vi.mocked(fetchVersionMarkers)).not.toHaveBeenCalled();
  });

  it("lets an admin read a hidden agent they cannot read", async () => {
    const { workspace, agent } = await setupHiddenAgent("admin");

    const response = await getVersionMarkers(workspace, agent.sId);

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchVersionMarkers)).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: agent.sId })
    );
  });
});
