import type { Authenticator } from "@app/lib/auth";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { TagModel } from "@app/lib/models/tags";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("TagResource", () => {
  let workspace: LightWorkspaceType;
  let authenticator: Authenticator;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "admin" });
    workspace = testSetup.workspace;
    authenticator = testSetup.authenticator;
  });

  describe("listForAgentVersion", () => {
    it("returns the tags attached to a given agent version", async () => {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const tag1 = await TagFactory.create(workspace, { name: "tag-1" });
      const tag2 = await TagFactory.create(workspace, { name: "tag-2" });
      await TagFactory.addToAgent(authenticator, tag1, agent);
      await TagFactory.addToAgent(authenticator, tag2, agent);

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
      await TagFactory.addToAgent(authenticator, tagV0, agent);

      const updatedAgent = await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agent.sId
      );
      const tagV1 = await TagFactory.create(workspace, { name: "tag-v1" });
      await TagFactory.addToAgent(authenticator, tagV1, updatedAgent);

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
      await TagFactory.addToAgent(authenticator, tag, agent);

      const otherSetup = await createResourceTest({ role: "admin" });

      const tags = await TagResource.listForAgentVersion(
        otherSetup.authenticator,
        agent.sId,
        agent.version
      );

      expect(tags).toEqual([]);
    });
  });

  describe("delete", () => {
    it("soft-deletes the tag and hides it from every read", async () => {
      const tag = await TagFactory.create(workspace, { name: "to-delete" });
      const { sId } = tag;

      const result = await tag.delete(authenticator);
      expect(result.isOk()).toBe(true);

      expect(await TagResource.fetchById(authenticator, sId)).toBeNull();
      expect(
        await TagResource.findByName(authenticator, "to-delete")
      ).toBeNull();
      expect(await TagResource.findAll(authenticator)).toEqual([]);
    });

    it("stops surfacing a deleted tag on agents without creating a new version", async () => {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const tag = await TagFactory.create(workspace, { name: "agent-tag" });
      await TagFactory.addToAgent(authenticator, tag, agent);

      const before = await TagResource.listForAgentVersion(
        authenticator,
        agent.sId,
        agent.version
      );
      expect(before.map((t) => t.sId)).toEqual([tag.sId]);

      const result = await tag.delete(authenticator);
      expect(result.isOk()).toBe(true);

      // No new version: the agent is untouched, the soft-deleted tag is just excluded from reads.
      const current = await AgentResource.fetchById(authenticator, agent.sId);
      expect(current).not.toBeNull();
      expect(current!.currentVersion).toBe(agent.version);

      const currentTags = await TagResource.listForAgentVersion(
        authenticator,
        agent.sId,
        agent.version
      );
      expect(currentTags).toEqual([]);
    });

    it("excludes a deleted tag from the batch agent listing", async () => {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const kept = await TagFactory.create(workspace, { name: "kept" });
      const deleted = await TagFactory.create(workspace, { name: "deleted" });
      await TagFactory.addToAgent(authenticator, kept, agent);
      await TagFactory.addToAgent(authenticator, deleted, agent);

      const result = await deleted.delete(authenticator);
      expect(result.isOk()).toBe(true);

      const tagsPerAgent = await TagResource.listForAgents(authenticator, [
        agent.id,
      ]);
      expect(tagsPerAgent[agent.id].map((t) => t.sId)).toEqual([kept.sId]);
    });
  });

  describe("deleteAllForWorkspace", () => {
    it("hard-deletes every tag and its tag_agents links", async () => {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const tag = await TagFactory.create(workspace, { name: "to-scrub" });
      await TagFactory.addToAgent(authenticator, tag, agent);
      const deleted = await TagFactory.create(workspace, { name: "gone" });
      await deleted.delete(authenticator);

      await TagResource.deleteAllForWorkspace(authenticator);

      // Rows are permanently removed, including the already soft-deleted one.
      expect(
        await TagModel.findAll({
          where: { workspaceId: workspace.id },
          includeDeleted: true,
        })
      ).toEqual([]);
      expect(
        await TagAgentModel.count({ where: { workspaceId: workspace.id } })
      ).toBe(0);
    });
  });

  describe("makeNew", () => {
    it("restores a soft-deleted tag when its name is recreated", async () => {
      const tag = await TagFactory.create(workspace, { name: "reused" });
      const { sId } = tag;
      await tag.delete(authenticator);
      expect(await TagResource.fetchById(authenticator, sId)).toBeNull();

      const recreated = await TagResource.makeNew(authenticator, {
        name: "reused",
        kind: "standard",
      });

      // The same row is undeleted rather than a duplicate inserted.
      expect(recreated.sId).toBe(sId);
      expect(await TagResource.fetchById(authenticator, sId)).not.toBeNull();
    });
  });
});
