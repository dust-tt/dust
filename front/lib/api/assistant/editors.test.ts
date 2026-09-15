import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import { getAgentsEditors, getEditors } from "@app/lib/api/assistant/editors";
import * as legacyAcls from "@app/lib/api/permissions/legacy_acls";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

it.each([
  false,
  true,
])("selects editor lists and configuration context (grants: %s)", async (grants) => {
  const { authenticator, user } = await createResourceTest({ role: "user" });
  const agent = await AgentConfigurationFactory.createTestAgent(authenticator, {
    scope: "hidden",
  });
  await FeatureFlagFactory.basic(authenticator, "group_permissions_shadow");

  const resource = AgentResource.fromAgentConfiguration(authenticator, agent);
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

  vi.spyOn(legacyAcls, "isLegacyAclsEnabled").mockReturnValue(!grants);
  const warn = vi.spyOn(logger, "warn");
  const editors = await getEditors(authenticator, agent);

  const expectedEditorIds = grants ? [] : [user.id];
  expect(editors.map((editor) => editor.id)).toEqual(expectedEditorIds);
  const batch = await getAgentsEditors(authenticator, [agent]);
  expect(batch[agent.sId].map((editor) => editor.id)).toEqual(
    expectedEditorIds
  );
  const context = await getAgentConfigurationContext(authenticator, agent.sId);
  assert(context.isOk());
  expect(context.value.editorUsers.map((editor) => editor.id)).toEqual(
    expectedEditorIds
  );

  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      check: "agent_editors",
      legacyResult: [user.id],
      candidateResult: [],
      servedSource: grants ? "grants" : "legacy",
    }),
    "group_permissions_shadow_mismatch"
  );
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      check: "agent_editors_batch",
      legacyResult: [[agent.sId, [user.id]]],
      candidateResult: [[agent.sId, []]],
      servedSource: grants ? "grants" : "legacy",
    }),
    "group_permissions_shadow_mismatch"
  );
});
