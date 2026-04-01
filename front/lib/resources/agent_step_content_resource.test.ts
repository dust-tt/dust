import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("AgentStepContentResource", () => {
  describe("getAgentsWithFunctionCalls", () => {
    let auth: Authenticator;
    let workspace: LightWorkspaceType;
    let agent: LightAgentConfigurationType;

    beforeEach(async () => {
      const setup = await createResourceTest({ role: "builder" });
      auth = setup.authenticator;
      workspace = setup.workspace;
      agent = await AgentConfigurationFactory.createTestAgent(auth);
    });

    it("returns empty set when agentConfigurationIds is empty", async () => {
      const result = await AgentStepContentResource.getAgentsWithFunctionCalls(
        auth,
        { agentConfigurationIds: [] }
      );
      expect([...result]).toEqual([]);
    });

    it("returns agent sId when a function_call step exists for that agent", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        { workspace, conversation, agentConfig: agent }
      );
      await ConversationFactory.createFunctionCallStepForTest(
        auth,
        agentMessage.agentMessageId,
        { createdAt: new Date() }
      );

      const result = await AgentStepContentResource.getAgentsWithFunctionCalls(
        auth,
        { agentConfigurationIds: [agent.sId] }
      );
      expect(result.has(agent.sId)).toBe(true);
    });

    it("respects createdAfter by excluding older function_call steps", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        { workspace, conversation, agentConfig: agent }
      );
      await ConversationFactory.createFunctionCallStepForTest(
        auth,
        agentMessage.agentMessageId,
        { createdAt: daysAgo(20) }
      );

      const recentOnly =
        await AgentStepContentResource.getAgentsWithFunctionCalls(auth, {
          agentConfigurationIds: [agent.sId],
          createdAfter: daysAgo(10),
        });
      expect(recentOnly.has(agent.sId)).toBe(false);

      const includingOld =
        await AgentStepContentResource.getAgentsWithFunctionCalls(auth, {
          agentConfigurationIds: [agent.sId],
          createdAfter: daysAgo(30),
        });
      expect(includingOld.has(agent.sId)).toBe(true);
    });
  });
});
