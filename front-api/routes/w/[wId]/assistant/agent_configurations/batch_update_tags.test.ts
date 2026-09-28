import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { afterEach, describe, expect, it, vi } from "vitest";

function batchUpdateTags(workspace: { sId: string }, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/batch_update_tags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

// Tags are attached to a specific configuration version, so a batch tag edit creates a new version
// per agent; read the tags of the current version by re-fetching the agent.
async function currentTagIds(
  auth: Authenticator,
  agentId: string
): Promise<string[]> {
  const agent = await AgentResource.fetchById(auth, agentId);
  if (!agent) {
    return [];
  }
  const tags = await agent.listTags(auth);
  return tags.map((tag) => tag.sId).sort();
}

describe("POST /api/w/:wId/assistant/agent_configurations/batch_update_tags", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds and removes tags as a new version, ignoring duplicate additions", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const firstAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "First agent",
    });
    const secondAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Second agent",
    });
    const tagToAdd = await TagFactory.create(workspace, { name: "to-add" });
    const tagToRemove = await TagFactory.create(workspace, {
      name: "to-remove",
    });
    await TagFactory.addToAgent(auth, tagToAdd, firstAgent);
    await TagFactory.addToAgent(auth, tagToRemove, firstAgent);
    await TagFactory.addToAgent(auth, tagToRemove, secondAgent);

    const response = await batchUpdateTags(workspace, {
      agentIds: [firstAgent.sId, secondAgent.sId],
      addTagIds: [tagToAdd.sId],
      removeTagIds: [tagToRemove.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      updatedAgentIds: expect.arrayContaining([
        firstAgent.sId,
        secondAgent.sId,
      ]),
      skippedAgentIds: [],
    });

    // Both agents end up with only the added tag: the removal took, and re-adding a tag the first
    // agent already had is not duplicated.
    expect(await currentTagIds(auth, firstAgent.sId)).toEqual([tagToAdd.sId]);
    expect(await currentTagIds(auth, secondAgent.sId)).toEqual([tagToAdd.sId]);

    // The change is a new version, not an in-place mutation of the current one.
    const after = await AgentResource.fetchById(auth, firstAgent.sId);
    expect(after?.isFull() && after.content.version).toBe(
      firstAgent.version + 1
    );
  });

  it("tags an unpublished agent of another member built on a restricted space", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    // The agent is authored and edited by another member, is unpublished, and requires a space the
    // acting admin is not a member of: exactly what "Show hidden agents" surfaces. The admin holds
    // neither `write` nor `read` on it, but may still tag it (see `tags-change-requires-edit`).
    const agentOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, {
      role: "user",
    });
    const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      {
        name: "Hidden agent",
        scope: "hidden",
        requestedSpaceIds: [restrictedSpace.id],
      }
    );
    const tag = await TagFactory.create(workspace, { name: "governance" });

    const response = await batchUpdateTags(workspace, {
      agentIds: [agent.sId],
      addTagIds: [tag.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      updatedAgentIds: [agent.sId],
      skippedAgentIds: [],
    });
    expect(await currentTagIds(agentOwnerAuth, agent.sId)).toEqual([tag.sId]);
  });

  it("returns 404 when a tag id is unknown", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await batchUpdateTags(workspace, {
      agentIds: [agent.sId],
      addTagIds: ["tag_does_not_exist"],
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "agent_configuration_not_found",
        message: "One or more specified tags were not found.",
      },
    });
  });

  it("skips an archived agent rather than tagging it", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const tag = await TagFactory.create(workspace, { name: "governance" });
    await (await AgentResource.fetchById(auth, agent.sId))!.archive(auth);

    const response = await batchUpdateTags(workspace, {
      agentIds: [agent.sId],
      addTagIds: [tag.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      updatedAgentIds: [],
      skippedAgentIds: [agent.sId],
    });
  });
});
