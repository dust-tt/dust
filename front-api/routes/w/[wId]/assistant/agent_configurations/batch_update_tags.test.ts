import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Err } from "@app/types/shared/result";
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

describe("POST /api/w/:wId/assistant/agent_configurations/batch_update_tags", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds and removes tags while ignoring duplicate additions", async () => {
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
    await tagToAdd.addToAgent(auth, firstAgent);
    await tagToRemove.addToAgent(auth, firstAgent);
    await tagToRemove.addToAgent(auth, secondAgent);

    const response = await batchUpdateTags(workspace, {
      agentIds: [firstAgent.sId, secondAgent.sId],
      addTagIds: [tagToAdd.sId],
      removeTagIds: [tagToRemove.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const tagsByAgent = await TagResource.listForAgents(auth, [
      firstAgent.id,
      secondAgent.id,
    ]);
    for (const agent of [firstAgent, secondAgent]) {
      expect(tagsByAgent[agent.id]?.map((tag) => tag.sId)).toEqual([
        tagToAdd.sId,
      ]);
    }
  });

  it("tags an unpublished agent of another member built on a restricted space", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    // The agent is authored and edited by another member, is unpublished, and requires a space the
    // acting admin is not a member of: exactly what "Show hidden agents" surfaces.
    const agentOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, {
      role: "builder",
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
    const tagsByAgent = await TagResource.listForAgents(auth, [agent.id]);
    expect(tagsByAgent[agent.id]?.map((t) => t.sId)).toEqual([tag.sId]);
  });

  it("returns 400 when adding tags fails", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    vi.spyOn(TagResource, "addToAgents").mockResolvedValue(
      new Err(new Error("Failed to add tags"))
    );

    const response = await batchUpdateTags(workspace, { agentIds: [] });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Failed to add tags",
      },
    });
  });

  it("rejects a batch containing an archived agent", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const tag = await TagFactory.create(workspace, { name: "governance" });
    await archiveAgentConfiguration(auth, agent.sId);

    const response = await batchUpdateTags(workspace, {
      agentIds: [agent.sId],
      addTagIds: [tag.sId],
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(agent.name);
  });

  it("returns 400 when removing tags fails", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    vi.spyOn(TagResource, "removeFromAgents").mockResolvedValue(
      new Err(new Error("Failed to remove tags"))
    );

    const response = await batchUpdateTags(workspace, { agentIds: [] });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Failed to remove tags",
      },
    });
  });
});
