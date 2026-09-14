import { getEditors } from "@app/lib/api/assistant/editors";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { expect, it, vi } from "vitest";

it("serves legacy agent editors and logs grant mismatches", async () => {
  const { authenticator, user } = await createResourceTest({ role: "user" });
  const agent = await AgentConfigurationFactory.createTestAgent(authenticator, {
    scope: "hidden",
  });
  await FeatureFlagFactory.basic(authenticator, "group_permissions_shadow");

  const resource = await AgentResource.fetchByAgentConfiguration(
    authenticator,
    agent
  );
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

  const warn = vi.spyOn(logger, "warn");
  const editors = await getEditors(authenticator, agent);

  expect(editors.map((editor) => editor.id)).toEqual([user.id]);
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      check: "agent_editors",
      legacyResult: [user.id],
      candidateResult: [],
    }),
    "group_permissions_shadow_mismatch"
  );
});
