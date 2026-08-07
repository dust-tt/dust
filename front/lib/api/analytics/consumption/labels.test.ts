import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("resolveDimensionLabels", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  it("names models from their display names", async () => {
    const [model] = getSupportedModelConfigs();

    const names = await resolveDimensionLabels(auth, "model", [model.modelId]);

    expect(names.get(model.modelId)).toBe(model.displayName);
  });

  it("names sources from their origin labels", async () => {
    const names = await resolveDimensionLabels(auth, "source", [
      "slack",
      "web",
    ]);

    expect(names.get("slack")).toBe("Slack");
    expect(names.get("web")).toBe("Conversation");
  });

  it("names tools from their server names", async () => {
    const names = await resolveDimensionLabels(auth, "tool", [
      "image_generation",
    ]);

    expect(names.get("image_generation")).toBe("Create Images");
  });

  it("names users from their full names", async () => {
    const user = await UserFactory.basic();

    const names = await resolveDimensionLabels(auth, "user", [user.sId]);

    expect(names.get(user.sId)).toBe(user.fullName());
  });

  it("keeps unresolvable keys as-is", async () => {
    const names = await resolveDimensionLabels(auth, "model", [
      "deleted_model",
    ]);
    const origins = await resolveDimensionLabels(auth, "source", [
      "deleted_origin",
    ]);
    const skills = await resolveDimensionLabels(auth, "skill", [
      "deleted_skill",
    ]);

    expect(names.get("retired")).toBe("deleted_model");
    expect(origins.get("unknown_origin")).toBe("deleted_origin");
    expect(skills.get("skl_deleted")).toBe("deleted_skill");
  });

  it("returns nothing for an empty breakdown", async () => {
    expect(await resolveDimensionLabels(auth, "agent", [])).toEqual(new Map());
  });
});
