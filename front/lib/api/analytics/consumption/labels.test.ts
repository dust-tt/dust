import {
  resolveDimensionDisplayNames,
  resolveDimensionLabels,
} from "@app/lib/api/analytics/consumption/labels";
import { getAgentModelDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
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

  it("labels remote tools with their server icon", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    const workspace = authenticator.getNonNullableWorkspace();
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "CRM tools",
      viewName: "Sales tools",
    });

    const labels = await resolveDimensionLabels(authenticator, "tool", [
      "Sales tools",
      "CRM tools",
      server.sId,
    ]);

    expect(labels.get("Sales tools")).toEqual({
      name: "Sales Tools",
      pictureUrl: null,
      description: null,
      icon: server.icon,
    });
    expect(labels.get("CRM tools")).toEqual({
      name: "CRM tools",
      pictureUrl: null,
      description: null,
      icon: server.icon,
    });
    expect(labels.get(server.sId)).toEqual({
      name: "CRM tools",
      pictureUrl: null,
      description: null,
      icon: server.icon,
    });
  });

  it("labels groups with their group name", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Engineering");

    const labels = await resolveDimensionLabels(authenticator, "group", [
      group.sId,
    ]);

    expect(labels.get(group.sId)).toEqual({
      name: "Engineering",
      pictureUrl: null,
      description: null,
    });
  });
});
