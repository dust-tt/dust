import type { Authenticator } from "@app/lib/auth";
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
