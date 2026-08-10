import {
  resolveDimensionDisplayNames,
  resolveDimensionLabels,
} from "@app/lib/api/analytics/consumption/labels";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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

    expect(names.get("deleted_model")).toBe("deleted_model");
    expect(origins.get("deleted_origin")).toBe("deleted_origin");
    expect(skills.get("deleted_skill")).toBe("deleted_skill");
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
    });
  });

  it("labels agents with their name and picture", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Analytics agent" }
    );

    const labels = await resolveDimensionLabels(authenticator, "agent", [
      agent.sId,
    ]);

    expect(labels.get(agent.sId)).toEqual({
      name: "Analytics agent",
      pictureUrl: agent.pictureUrl,
    });
  });

  it("labels teams with their group name", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const team = await GroupFactory.regularManual(workspace, "Engineering");

    const labels = await resolveDimensionLabels(authenticator, "team", [
      team.sId,
    ]);

    expect(labels.get(team.sId)).toEqual({
      name: "Engineering",
      pictureUrl: null,
    });
  });
});
