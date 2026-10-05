import { getAgentConfigurationAsYAMLConfig } from "@app/lib/api/assistant/configuration/yaml_export";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("POST /api/v1/w/:wId/assistant/agent_configurations/import", () => {
  it("creates the agent and returns its full configuration with skills", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const source = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Exported",
      instructions: "Answer politely.",
    });
    const exported = await getAgentConfigurationAsYAMLConfig(auth, source.sId);
    if (exported.isErr()) {
      throw new Error(exported.error.api_error.message);
    }

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/agent_configurations/import`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key.secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...exported.value,
          agent: { ...exported.value.agent, handle: "Imported" },
        }),
      }
    );

    expect(response.status).toBe(200);
    const { agentConfiguration } = await response.json();
    expect(agentConfiguration.sId).not.toBe(source.sId);
    expect(agentConfiguration.name).toBe("Imported");
    expect(agentConfiguration.instructions).toBe("Answer politely.");
    expect(agentConfiguration.skills).toEqual([]);
  });
});
