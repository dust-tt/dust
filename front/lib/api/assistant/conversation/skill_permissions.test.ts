import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { updateConversationRequirementsForSkills } from "@app/lib/api/assistant/conversation/skill_permissions";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("updateConversationRequirementsForSkills", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let projectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;
  let anotherProjectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    projectSpace = await SpaceFactory.project(workspace);
    anotherProjectSpace = await SpaceFactory.project(workspace);

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const userJson = auth.getNonNullableUser().toJSON();

    for (const space of [projectSpace, anotherProjectSpace]) {
      const [group] = await space.fetchRegularAutoGroups(internalAdminAuth);
      if (group) {
        const addRes = await group.dangerouslyAddMember(internalAdminAuth, {
          user: userJson,
        });
        if (addRes.isErr()) {
          throw new Error(addRes.error.message);
        }
      }
    }

    await auth.refresh();
  });

  const fetchConversationWithoutContent = async (
    conversationSId: string
  ): Promise<ConversationWithoutContentType> => {
    const result = await getConversation(auth, conversationSId);
    if (result.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    return result.value;
  };

  const createRegularConversation =
    async (): Promise<ConversationWithoutContentType> => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });
      return fetchConversationWithoutContent(conversation.sId);
    };

  const createSkill = (requestedSpaceIds: number[]): Promise<SkillResource> =>
    SkillFactory.create(auth, {
      name: `Skill ${requestedSpaceIds.join("-")}-${Math.random()}`,
      requestedSpaceIds,
    });

  describe("regular conversations", () => {
    it("appends the skills' space requirements", async () => {
      const conversation = await createRegularConversation();
      const skill = await createSkill([projectSpace.id]);

      await updateConversationRequirementsForSkills(auth, {
        skills: [skill],
        conversation,
      });

      const updated = await fetchConversationWithoutContent(conversation.sId);
      expect(updated.requestedSpaceIds).toContain(projectSpace.sId);
    });

    it("merges requirements from multiple skills", async () => {
      const conversation = await createRegularConversation();
      const skillA = await createSkill([projectSpace.id]);
      const skillB = await createSkill([anotherProjectSpace.id]);

      await updateConversationRequirementsForSkills(auth, {
        skills: [skillA, skillB],
        conversation,
      });

      const updated = await fetchConversationWithoutContent(conversation.sId);
      expect(updated.requestedSpaceIds).toContain(projectSpace.sId);
      expect(updated.requestedSpaceIds).toContain(anotherProjectSpace.sId);
    });

    it("preserves existing requirements and does not duplicate", async () => {
      const conversation = await createRegularConversation();
      await ConversationResource.updateRequirements(auth, conversation.sId, [
        projectSpace.id,
      ]);
      const withInitial = await fetchConversationWithoutContent(
        conversation.sId
      );

      const skill = await createSkill([
        projectSpace.id,
        anotherProjectSpace.id,
      ]);

      await updateConversationRequirementsForSkills(auth, {
        skills: [skill],
        conversation: withInitial,
      });

      const updated = await fetchConversationWithoutContent(conversation.sId);
      expect(updated.requestedSpaceIds).toContain(projectSpace.sId);
      expect(updated.requestedSpaceIds).toContain(anotherProjectSpace.sId);
      expect(
        updated.requestedSpaceIds.filter((id) => id === projectSpace.sId)
      ).toHaveLength(1);
    });

    it("does nothing for skills without space requirements", async () => {
      const conversation = await createRegularConversation();
      const initialCount = conversation.requestedSpaceIds.length;
      const skill = await createSkill([]);

      await updateConversationRequirementsForSkills(auth, {
        skills: [skill],
        conversation,
      });

      const updated = await fetchConversationWithoutContent(conversation.sId);
      expect(updated.requestedSpaceIds).toHaveLength(initialCount);
    });
  });

  describe("project conversations", () => {
    it("does not append skill space requirements (requirements stay pinned to the project)", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        spaceId: projectSpace.id,
      });
      await ConversationResource.updateRequirements(auth, conversation.sId, [
        projectSpace.id,
      ]);
      const projectConversation = await fetchConversationWithoutContent(
        conversation.sId
      );

      const skill = await createSkill([anotherProjectSpace.id]);

      await updateConversationRequirementsForSkills(auth, {
        skills: [skill],
        conversation: projectConversation,
      });

      const updated = await fetchConversationWithoutContent(conversation.sId);
      expect(updated.requestedSpaceIds).toEqual([projectSpace.sId]);
    });
  });
});
