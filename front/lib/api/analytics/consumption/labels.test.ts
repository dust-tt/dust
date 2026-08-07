import {
  resolveConsumptionGroupLabels,
  resolveConsumptionGroupNames,
} from "@app/lib/api/analytics/consumption/labels";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("resolveConsumptionGroupNames", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  it("names models from the model catalog", async () => {
    const [model] = getSupportedModelConfigs();

    const names = await resolveConsumptionGroupNames(auth, "model", [
      model.modelId,
    ]);

    expect(names.get(model.modelId)).toBe(model.displayName);
  });

  it("names sources from their origin label", async () => {
    const names = await resolveConsumptionGroupNames(auth, "source", [
      "slack",
      "web",
    ]);

    expect(names.get("slack")).toBe("Slack");
    expect(names.get("web")).toBe("Conversation");
  });

  it("names tools from their server name", async () => {
    const names = await resolveConsumptionGroupNames(auth, "tool", [
      "image_generation",
    ]);

    expect(names.get("image_generation")).toBe("Create Images");
  });

  it("names users from the workspace directory", async () => {
    const user = await UserFactory.basic();

    const names = await resolveConsumptionGroupNames(auth, "user", [user.sId]);

    expect(names.get(user.sId)).toBe(user.fullName());
  });

  it("keeps unresolvable keys rather than dropping their series", async () => {
    // Ids that outlive what they point to: the catalog entry, the origin and
    // the skill are all gone, but the consumption stays indexed.
    const names = await resolveConsumptionGroupNames(auth, "model", [
      "retired",
    ]);
    const origins = await resolveConsumptionGroupNames(auth, "source", [
      "unknown_origin",
    ]);
    const skills = await resolveConsumptionGroupNames(auth, "skill", [
      "skl_deleted",
    ]);

    expect(names.get("retired")).toBe("retired");
    expect(origins.get("unknown_origin")).toBe("unknown_origin");
    expect(skills.get("skl_deleted")).toBe("skl_deleted");
  });

  it("returns nothing for an empty breakdown", async () => {
    expect(await resolveConsumptionGroupNames(auth, "agent", [])).toEqual(
      new Map()
    );
  });

  it("carries a picture for the dimensions that have one, null for the rest", async () => {
    const user = await UserFactory.basic();

    const users = await resolveConsumptionGroupLabels(auth, "user", [user.sId]);
    const sources = await resolveConsumptionGroupLabels(auth, "source", [
      "slack",
    ]);

    expect(users.get(user.sId)).toEqual({
      name: user.fullName(),
      pictureUrl: user.imageUrl,
      scope: null,
      modelMaker: null,
      tier: null,
    });
    expect(sources.get("slack")).toEqual({
      name: "Slack",
      pictureUrl: null,
      scope: null,
      modelMaker: null,
      tier: null,
    });
  });

  it("carries a maker and pricing tier for models, null for the rest", async () => {
    const [model] = getSupportedModelConfigs();

    const labels = await resolveConsumptionGroupLabels(auth, "model", [
      model.modelId,
    ]);

    const label = labels.get(model.modelId);
    expect(label?.modelMaker).toBe(model.modelMaker ?? model.providerId);
    expect(label?.tier).not.toBeNull();
  });

  it("carries a visibility scope for agents, derived from their real scope", async () => {
    // Needs an author, unlike the rest of this file's admin-only `auth`.
    const { authenticator } = await createResourceTest({ role: "admin" });

    const published = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Published Agent", scope: "visible" }
    );
    const unpublished = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Unpublished Agent", scope: "hidden" }
    );

    const labels = await resolveConsumptionGroupLabels(authenticator, "agent", [
      published.sId,
      unpublished.sId,
    ]);

    expect(labels.get(published.sId)?.scope).toBe("visible");
    expect(labels.get(unpublished.sId)?.scope).toBe("hidden");
  });
});
