import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("getAgentFeedbacks", () => {
  it("refuses a manager who cannot read the agent", async () => {
    const { authenticator: editorAuth, workspace } = await createResourceTest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Hidden agent",
      scope: "hidden",
    });
    const manager = await UserFactory.basic();
    await MembershipFactory.associate(workspace, manager, { role: "manager" });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      workspace.sId
    );

    const getFeedbacks = (auth: Authenticator) =>
      getAgentFeedbacks({
        auth,
        agentConfigurationId: agent.sId,
        withMetadata: true,
        paginationParams: {
          limit: 10,
          orderColumn: "id",
          orderDirection: "desc",
        },
      });

    const asManager = await getFeedbacks(managerAuth);
    const asEditor = await getFeedbacks(editorAuth);

    expect(asManager.isErr()).toBe(true);
    expect(asEditor.isOk()).toBe(true);
  });
});
