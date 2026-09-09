import type { Authenticator } from "@app/lib/auth";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("TagResource", () => {
  let workspace: LightWorkspaceType;
  let authenticator: Authenticator;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "admin" });
    workspace = testSetup.workspace;
    authenticator = testSetup.authenticator;
  });

  it("refreshes search metadata for tag attachments, renames, and removals", async () => {
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const first = await TagFactory.create(workspace, { name: "First tag" });
    const second = await TagFactory.create(workspace, { name: "Second tag" });
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    await first.addToAgent(authenticator, agent);
    await first.updateTag({ name: "Renamed tag", kind: "protected" });
    await TagResource.addToAgents(authenticator, [second], [agent]);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(3);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        authenticator,
        agent.sId
      )
    ).toMatchObject({
      tags: [first.sId, second.sId].sort(),
      metadata: {
        tags: expect.arrayContaining([
          { sId: first.sId, name: "Renamed tag", kind: "protected" },
          { sId: second.sId, name: "Second tag", kind: "standard" },
        ]),
      },
    });

    await first.removeFromAgent(authenticator, agent);
    await TagResource.removeFromAgents(authenticator, [second], [agent]);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(5);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenLastCalledWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        authenticator,
        agent.sId
      )
    ).toMatchObject({
      tags: [],
      metadata: { tags: [] },
    });
  });

  it("captures logical agent targets before tag deletion and never indexes a rollback", async () => {
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const nextVersion = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      agent.sId
    );
    const tag = await TagFactory.create(workspace, {
      name: "Shared across versions",
    });
    await TagResource.addToAgents(authenticator, [tag], [agent, nextVersion]);
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const rollback = new Error("Roll back tag deletion");

    await expect(
      withTransaction(
        async (transaction) => {
          await tag.delete(authenticator, { transaction });
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(await TagResource.fetchById(authenticator, tag.sId)).not.toBeNull();
    expect(
      (await TagResource.listForAgent(authenticator, nextVersion.id)).map(
        (t) => t.sId
      )
    ).toEqual([tag.sId]);
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();

    expect((await tag.delete(authenticator)).isOk()).toBe(true);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
    expect(await TagResource.fetchById(authenticator, tag.sId)).toBeNull();
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        authenticator,
        agent.sId
      )
    ).toMatchObject({ tags: [] });
  });

  describe("listForAgentVersion", () => {
    it("returns the tags attached to a given agent version", async () => {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const tag1 = await TagFactory.create(workspace, { name: "tag-1" });
      const tag2 = await TagFactory.create(workspace, { name: "tag-2" });
      await tag1.addToAgent(authenticator, agent);
      await tag2.addToAgent(authenticator, agent);

      const tags = await TagResource.listForAgentVersion(
        authenticator,
        agent.sId,
        agent.version
      );

      expect(tags.map((t) => t.sId).sort()).toEqual(
        [tag1.sId, tag2.sId].sort()
      );
    });

    it("returns an empty array when the agent version has no tags", async () => {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const tags = await TagResource.listForAgentVersion(
        authenticator,
        agent.sId,
        agent.version
      );

      expect(tags).toEqual([]);
    });

    it("only returns the tags attached to the requested version", async () => {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const tagV0 = await TagFactory.create(workspace, { name: "tag-v0" });
      await tagV0.addToAgent(authenticator, agent);

      const updatedAgent = await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agent.sId
      );
      const tagV1 = await TagFactory.create(workspace, { name: "tag-v1" });
      await tagV1.addToAgent(authenticator, updatedAgent);

      expect(updatedAgent.version).not.toBe(agent.version);

      const tagsV0 = await TagResource.listForAgentVersion(
        authenticator,
        agent.sId,
        agent.version
      );
      const tagsV1 = await TagResource.listForAgentVersion(
        authenticator,
        updatedAgent.sId,
        updatedAgent.version
      );

      expect(tagsV0.map((t) => t.sId)).toEqual([tagV0.sId]);
      expect(tagsV1.map((t) => t.sId)).toEqual([tagV1.sId]);
    });

    it("does not return tags from another workspace", async () => {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const tag = await TagFactory.create(workspace, { name: "tag" });
      await tag.addToAgent(authenticator, agent);

      const otherSetup = await createResourceTest({ role: "admin" });

      const tags = await TagResource.listForAgentVersion(
        otherSetup.authenticator,
        agent.sId,
        agent.version
      );

      expect(tags).toEqual([]);
    });
  });
});
