import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest() {
  const { workspace, key } = await createPublicApiMockRequest();

  await SpaceFactory.defaults(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );

  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "builder" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);

  return { workspace, key, agentConfig };
}

function patchAgentConfiguration(
  workspace: { sId: string },
  key: { secret: string },
  agentId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/agent_configurations/${agentId}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${key.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH /api/v1/w/[wId]/assistant/agent_configurations/[sId]", () => {
  it("applies configuration patch fields beyond userFavorite (regression dust-tt/dust#26698)", async () => {
    const { workspace, key, agentConfig } = await setupTest();

    const response = await patchAgentConfiguration(
      workspace,
      key,
      agentConfig.sId,
      { instructions: "Updated instructions" }
    );

    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.instructions).toBe("Updated instructions");
    expect(data.agentConfiguration.version).toBe(agentConfig.version + 1);
  });

  it("returns 404 when the agent configuration does not exist", async () => {
    const { workspace, key } = await setupTest();

    const response = await patchAgentConfiguration(workspace, key, "unknown", {
      instructions: "Updated instructions",
    });

    expect(response.status).toBe(404);
  });
});
