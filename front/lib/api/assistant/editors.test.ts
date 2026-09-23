import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import {
  getAgentEditors,
  getAgentsEditors,
  getEditors,
} from "@app/lib/api/assistant/editors";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { expect, it } from "vitest";

it("serves single, batch, and context editor reads from grants", async () => {
  const { authenticator, user } = await createResourceTest({ role: "user" });
  const agent = await AgentConfigurationFactory.createTestAgent(authenticator, {
    scope: "hidden",
  });

  // The author holds the editor grant created alongside the agent.
  expect((await getEditors(authenticator, agent)).map(({ id }) => id)).toEqual([
    user.id,
  ]);

  const resource = await AgentResource.fetchById(authenticator, agent.sId);
  assert(resource !== null);
  assert(resource.id !== null);
  const revokeResult = await GroupPermissionResource.revokeFromUser(
    authenticator,
    {
      user: user.toJSON(),
      grantType: "editor",
      resourceType: "agent",
      resourceId: resource.id,
    }
  );
  assert(revokeResult.isOk());

  // Revoking the grant drops the editor from all three read paths.
  expect(await getEditors(authenticator, agent)).toEqual([]);

  const batch = await getAgentsEditors(authenticator, [agent]);
  expect(batch[agent.sId]).toEqual([]);

  const context = await getAgentConfigurationContext(authenticator, agent.sId);
  assert(context.isOk());
  expect(context.value.editorUsers).toEqual([]);
});

it("reports global agents as having no editor group", async () => {
  const { authenticator } = await createResourceTest({ role: "user" });
  const agent = await AgentConfigurationFactory.createTestAgent(authenticator, {
    scope: "hidden",
  });
  const globalAgent = { ...agent, scope: "global" as const };

  const result = await getAgentEditors(authenticator, globalAgent);
  assert(result.isErr());
  expect(result.error.code).toBe("group_not_found");

  // `getEditors` swallows the error, and the batch read skips global agents.
  expect(await getEditors(authenticator, globalAgent)).toEqual([]);
  expect(await getAgentsEditors(authenticator, [globalAgent])).toEqual({});
});
