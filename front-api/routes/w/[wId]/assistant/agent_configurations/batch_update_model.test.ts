import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it } from "vitest";

const INITIAL_MODEL = {
  providerId: "openai",
  modelId: "gpt-5-mini",
} as const;

function postBatchUpdateModel(workspace: { sId: string }, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/batch_update_model`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

// A selectable model that differs from the one the test agents start with.
async function findTargetModel(auth: Authenticator) {
  const { models } = await getModelsForAuth(auth);
  const target = models.find(
    (m) => m.isSelectable && m.modelId !== INITIAL_MODEL.modelId
  );
  assert(target, "Expected another selectable model to be available.");
  return target;
}

async function setupTest(role: MembershipRoleType) {
  const { workspace, auth } = await createPrivateApiMockRequest({ role });

  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    model: { ...INITIAL_MODEL },
  });

  const tag = await TagResource.makeNew(auth, {
    name: "Test Tag",
    kind: "standard",
  });
  await tag.addToAgent(auth, agent);

  return { workspace, auth, agent, tag };
}

describe("POST /api/w/:wId/assistant/agent_configurations/batch_update_model", () => {
  it("updates an agent of another member built on a restricted space, keeping its space and skills", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    // The agent is authored and edited by another member, and both the agent and its skill
    // require a space the acting admin is not a member of: what "Show hidden agents" surfaces.
    const agentOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, {
      role: "user",
    });
    const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const skill = await SkillFactory.create(agentOwnerAuth, {
      name: "Restricted skill",
      requestedSpaceIds: [restrictedSpace.id],
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      {
        name: "Restricted space agent",
        model: { ...INITIAL_MODEL },
        requestedSpaceIds: [restrictedSpace.id],
      }
    );
    await skill.addToAgent(agentOwnerAuth, agent);

    const targetModel = await findTargetModel(auth);
    const response = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId],
      modelId: targetModel.modelId,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      updatedAgentIds: [agent.sId],
      skippedAgentIds: [],
    });

    // Fetched as "full" so the skills of the new version can be listed from it below.
    const updatedAgent = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
      dangerouslySkipPermissionFiltering: true,
    });
    assert(updatedAgent);
    expect(updatedAgent.model.modelId).toBe(targetModel.modelId);
    expect(updatedAgent.version).toBe(agent.version + 1);
    // The new version stays restricted to the space and keeps the skill.
    expect(updatedAgent.requestedSpaceIds).toEqual([restrictedSpace.sId]);
    const updatedSkills = await SkillResource.listByAgentConfiguration(
      auth,
      updatedAgent,
      { permissionFiltering: "dangerously_skip" }
    );
    expect(updatedSkills.map((s) => s.sId)).toEqual([skill.sId]);
  });

  it("saves a new version of the selected agents with the new model", async () => {
    const { workspace, auth, agent, tag } = await setupTest("admin");
    const target = await findTargetModel(auth);

    const res = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId],
      modelId: target.modelId,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedAgentIds).toEqual([agent.sId]);
    expect(body.skippedAgentIds).toEqual([]);

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.providerId).toBe(target.providerId);
    expect(updated?.model.modelId).toBe(target.modelId);
    // Reasoning effort defaults to the target model's own default.
    expect(updated?.model.reasoningEffort).toBe(target.defaultReasoningEffort);

    // A new version was created, and everything else was carried over.
    expect(updated?.version).toBe(agent.version + 1);
    expect(updated?.name).toBe(agent.name);
    expect(updated?.description).toBe(agent.description);
    expect(updated?.instructions).toBe(agent.instructions);
    expect(updated?.scope).toBe(agent.scope);
    expect(updated?.tags.map((t) => t.sId)).toEqual([tag.sId]);
  });

  it("updates what it can and reports the rest as skipped", async () => {
    const { workspace, auth, agent } = await setupTest("admin");
    const target = await findTargetModel(auth);

    // An archived agent cannot be re-saved: a new version would make it active again.
    const archivedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Archived Test Agent",
        model: { ...INITIAL_MODEL },
      }
    );
    await archiveAgentConfiguration(auth, archivedAgent.sId);

    const res = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId, archivedAgent.sId],
      modelId: target.modelId,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedAgentIds).toEqual([agent.sId]);
    expect(body.skippedAgentIds).toEqual([archivedAgent.sId]);

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.modelId).toBe(target.modelId);

    const skipped = await getAgentConfiguration(auth, {
      agentId: archivedAgent.sId,
      variant: "light",
    });
    expect(skipped?.model.modelId).toBe(INITIAL_MODEL.modelId);
    expect(skipped?.status).toBe("archived");
    expect(skipped?.version).toBe(archivedAgent.version);
  });

  it("rejects a model that is not available in the workspace", async () => {
    const { workspace, auth, agent } = await setupTest("admin");

    const res = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId],
      modelId: "not-a-model",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("not available");

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.modelId).toBe(INITIAL_MODEL.modelId);
  });

  it("updates an agent the admin is not an editor of", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");

    // Authored by, and only editable by, someone else.
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { model: { ...INITIAL_MODEL } }
    );
    const target = await findTargetModel(auth);

    const res = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId],
      modelId: target.modelId,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedAgentIds).toEqual([agent.sId]);
    expect(body.skippedAgentIds).toEqual([]);

    const updated = await getAgentConfiguration(agentOwnerAuth, {
      agentId: agent.sId,
      variant: "light",
    });
    assert(updated, "Expected the updated agent to be found.");
    expect(updated.model.modelId).toBe(target.modelId);

    // The editors were carried over untouched: the admin did not silently join the editor group
    // on the way.
    const editorGroup = await GroupResource.findEditorGroupForAgent(
      agentOwnerAuth,
      updated
    );
    assert(editorGroup.isOk(), "Expected the agent to have an editor group.");
    const editors = await editorGroup.value.getActiveMembers(agentOwnerAuth);
    expect(editors.map((e) => e.sId)).toEqual([
      agentOwnerAuth.getNonNullableUser().sId,
    ]);
  });

  it("rejects non-admin members", async () => {
    const { workspace, auth, agent } = await setupTest("user");
    const target = await findTargetModel(auth);

    const res = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId],
      modelId: target.modelId,
    });

    expect(res.status).toBe(403);

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.modelId).toBe(INITIAL_MODEL.modelId);
  });
});
