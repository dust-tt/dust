import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/v1/w/:wId/assistant/agent_configurations/search", () => {
  it("returns the published agents whose name contains the query", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    for (const [name, scope] of [
      ["Sales Helper", "visible"],
      ["Pre-sales Desk", "visible"],
      ["Hidden Sales", "hidden"],
      ["Support", "visible"],
    ] as const) {
      await AgentConfigurationFactory.createTestAgent(auth, { name, scope });
    }

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/agent_configurations/search?q=sales`,
      { headers: { authorization: `Bearer ${key.secret}` } }
    );

    expect(response.status).toBe(200);
    const { agentConfigurations } = await response.json();
    expect(
      agentConfigurations.map((a: { name: string }) => a.name).sort()
    ).toEqual(["Pre-sales Desk", "Sales Helper"]);
    for (const agentConfiguration of agentConfigurations) {
      expect(agentConfiguration).toMatchObject({
        actions: [],
        instructionsHtml: null,
      });
    }
  });
});
