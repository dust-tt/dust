import { getInternalMCPServerIconByName } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  resolveDimensionDisplayNames,
  resolveDimensionLabels,
} from "@app/lib/api/analytics/consumption/labels";
import { resolveConsumptionGroupLabels } from "@app/lib/api/analytics/consumption/top";
import { getAgentModelDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import { getModelMaker } from "@app/types/assistant/models/providers";
import { beforeEach, describe, expect, it } from "vitest";

describe("resolveDimensionDisplayNames", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  it("names models from their display names", async () => {
    const [model] = getSupportedModelConfigs();

    const names = await resolveDimensionDisplayNames(auth, "model", [
      model.modelId,
    ]);

    expect(names.get(model.modelId)).toBe(model.displayName);
  });

  it("names sources from their origin labels", async () => {
    const names = await resolveDimensionDisplayNames(auth, "source", [
      "slack",
      "web",
    ]);

    expect(names.get("slack")).toBe("Slack");
    expect(names.get("web")).toBe("Conversation");
  });

  it("keeps API key names as indexed", async () => {
    const names = await resolveDimensionDisplayNames(auth, "api_key", [
      "Production key",
    ]);

    expect(names.get("Production key")).toBe("Production key");
  });

  it("names tools from their server names", async () => {
    const names = await resolveDimensionDisplayNames(auth, "tool", [
      "image_generation",
    ]);

    expect(names.get("image_generation")).toBe("Create Images");
  });

  it("names users from their full names", async () => {
    const user = await UserFactory.basic();

    const names = await resolveDimensionDisplayNames(auth, "user", [user.sId]);

    expect(names.get(user.sId)).toBe(user.fullName());
  });

  it("keeps unresolvable keys as-is", async () => {
    const names = await resolveDimensionDisplayNames(auth, "model", [
      "deleted_model",
    ]);
    const origins = await resolveDimensionDisplayNames(auth, "source", [
      "deleted_origin",
    ]);
    const skills = await resolveDimensionDisplayNames(auth, "skill", [
      "deleted_skill",
    ]);
    const agents = await resolveDimensionDisplayNames(auth, "agent", [
      "deleted_agent",
    ]);

    expect(names.get("deleted_model")).toBe("deleted_model");
    expect(origins.get("deleted_origin")).toBe("deleted_origin");
    expect(skills.get("deleted_skill")).toBe("deleted_skill");
    expect(agents.get("deleted_agent")).toBe("deleted_agent");
  });

  it("returns nothing for an empty breakdown", async () => {
    expect(await resolveDimensionDisplayNames(auth, "agent", [])).toEqual(
      new Map()
    );
  });

  it("names agent tags from their tag names", async () => {
    const workspace = auth.getNonNullableWorkspace();
    const tag = await TagFactory.create(workspace, { name: "Support" });

    const names = await resolveDimensionDisplayNames(auth, "tag", [tag.sId]);

    expect(names.get(tag.sId)).toBe("Support");
  });

  it("falls back to the key for an unresolvable tag", async () => {
    const tags = await resolveDimensionDisplayNames(auth, "tag", [
      "deleted_tag",
    ]);

    expect(tags.get("deleted_tag")).toBe("deleted_tag");
  });

  it("drops a conversation it cannot resolve, rather than falling back to the key", async () => {
    const conversations = await resolveDimensionDisplayNames(
      auth,
      "conversation",
      ["deleted_conversation"]
    );

    expect(conversations.has("deleted_conversation")).toBe(false);
  });
});

describe("resolveDimensionLabels", () => {
  it("labels users with their name and picture", async () => {
    const { authenticator, user } = await createResourceTest({ role: "admin" });

    const labels = await resolveDimensionLabels(authenticator, "user", [
      user.sId,
    ]);

    expect(labels.get(user.sId)).toEqual({
      name: user.fullName(),
      pictureUrl: user.imageUrl ?? null,
      description: null,
    });
  });

  it("labels agents with their name, picture and description", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Analytics agent", description: "Answers analytics questions" }
    );

    const labels = await resolveDimensionLabels(authenticator, "agent", [
      agent.sId,
    ]);

    expect(labels.get(agent.sId)).toEqual({
      name: "Analytics agent",
      pictureUrl: agent.pictureUrl,
      description: "Answers analytics questions",
      modelId: agent.model.modelId,
      modelDisplayName: getAgentModelDisplayName(agent.model),
      scope: agent.scope,
    });
  });

  it("preserves scope for fallback agent labels", async () => {
    const { authenticator: editorAuth, workspace } = await createResourceTest({
      role: "user",
    });
    const space = await SpaceFactory.regular(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Restricted agent",
      scope: "hidden",
      requestedSpaceIds: [space.id],
    });
    const manager = await UserFactory.basic();
    await MembershipFactory.associate(workspace, manager, { role: "manager" });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      workspace.sId
    );

    const labels = await resolveDimensionLabels(managerAuth, "agent", [
      agent.sId,
    ]);

    expect(labels.get(agent.sId)).toEqual(
      expect.objectContaining({
        name: "Restricted agent",
        scope: "hidden",
      })
    );
  });

  it("labels models with their maker and tier", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const model = getSupportedModelConfigs().find(
      (config) =>
        getTierForModel(config.modelId, config.defaultReasoningEffort) !== null
    );
    expect(model).toBeDefined();
    if (!model) {
      return;
    }
    const tier = getTierForModel(model.modelId, model.defaultReasoningEffort);
    expect(tier).not.toBeNull();
    if (!tier) {
      return;
    }

    const labels = await resolveDimensionLabels(authenticator, "model", [
      model.modelId,
    ]);

    expect(labels.get(model.modelId)).toEqual({
      name: model.displayName,
      pictureUrl: null,
      description: null,
      maker: getModelMaker(model),
      tier,
    });
  });

  it("labels skills with their name and user-facing description", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(authenticator, {
      name: "Research",
      userFacingDescription: "Researches a topic in depth",
    });

    const labels = await resolveDimensionLabels(authenticator, "skill", [
      skill.sId,
    ]);

    expect(labels.get(skill.sId)).toEqual({
      name: "Research",
      pictureUrl: null,
      description: "Researches a topic in depth",
      icon: skill.icon,
    });
  });

  it("labels groups with their name and current member count", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Engineering");
    const addMemberResult = await GroupFactory.withMembers(
      authenticator,
      group,
      [user]
    );
    expect(addMemberResult.isOk()).toBe(true);

    const labels = await resolveDimensionLabels(authenticator, "group", [
      group.sId,
    ]);

    expect(labels.get(group.sId)).toEqual({
      name: "Engineering",
      pictureUrl: null,
      description: null,
      memberCount: 1,
    });
  });

  it("labels internal and remote tools by server name", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Customer records",
    });

    const labels = await resolveDimensionLabels(authenticator, "tool", [
      "image_generation",
      server.cachedName,
    ]);

    expect(labels.get("image_generation")).toEqual({
      name: "Create Images",
      pictureUrl: null,
      description: null,
      icon: getInternalMCPServerIconByName("image_generation"),
    });
    expect(labels.get(server.cachedName)).toEqual({
      name: "Customer records",
      pictureUrl: null,
      description: null,
      icon: server.icon,
    });
  });
});

describe("resolveConsumptionGroupLabels and private conversations", () => {
  it("omits a private conversation's id and credits from a workspace-manager ranking", async () => {
    const { authenticator: ownerAuth, workspace } = await createResourceTest({
      role: "user",
    });

    const manager = await UserFactory.basic();
    await MembershipFactory.associate(workspace, manager, { role: "manager" });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      workspace.sId
    );

    const privateSpace = await SpaceFactory.regular(workspace);
    const privateConversation = await ConversationFactory.create(ownerAuth, {
      agentConfigurationId: "unused",
      messagesCreatedAt: [],
    });
    await ConversationFactory.setRequestedSpaceIdsForTest(
      privateConversation.id,
      workspace.id,
      [privateSpace.id]
    );

    const readableConversation = await ConversationFactory.create(ownerAuth, {
      agentConfigurationId: "unused",
      messagesCreatedAt: [],
    });

    const rows = await resolveConsumptionGroupLabels(
      managerAuth,
      "conversation",
      [
        {
          key: privateConversation.sId,
          credits: 12,
          count: 3,
          previousCredits: null,
        },
        {
          key: readableConversation.sId,
          credits: 4,
          count: 1,
          previousCredits: null,
        },
      ]
    );

    expect(rows.map((row) => row.key)).toEqual([readableConversation.sId]);
    expect(rows.some((row) => row.name === privateConversation.sId)).toBe(
      false
    );
  });
});
