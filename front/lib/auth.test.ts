import { getFeatureFlags } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("getFeatureFlags", () => {
  describe("workspace-wide flags (groupIds = null)", () => {
    it("returns the flag for any user in the workspace", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });

      await FeatureFlagFactory.basic("labs_transcripts", workspace);

      const flags = await getFeatureFlags(authenticator);
      expect(flags).toContain("labs_transcripts");
    });

    it("returns an empty array when no flags are enabled", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const flags = await getFeatureFlags(authenticator);
      expect(flags).toEqual([]);
    });
  });

  describe("group-scoped flags (groupIds set)", () => {
    it("returns the flag when user belongs to a targeted group", async () => {
      const { workspace, authenticator, globalGroup } =
        await createResourceTest({ role: "user" });

      await FeatureFlagFactory.basic("labs_transcripts", workspace, {
        groupIds: [globalGroup.id],
      });

      const flags = await getFeatureFlags(authenticator);
      expect(flags).toContain("labs_transcripts");
    });

    it("does not return the flag when user is not in any targeted group", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create a separate group that the user is NOT a member of.
      const isolatedGroup = await GroupResource.makeNew({
        name: "isolated-group",
        workspaceId: workspace.id,
        kind: "regular",
      });

      await FeatureFlagFactory.basic("labs_transcripts", workspace, {
        groupIds: [isolatedGroup.id],
      });

      const flags = await getFeatureFlags(authenticator);
      expect(flags).not.toContain("labs_transcripts");
    });

    it("returns both workspace-wide and matching group-scoped flags", async () => {
      const { workspace, authenticator, globalGroup } =
        await createResourceTest({ role: "user" });

      // Workspace-wide flag.
      await FeatureFlagFactory.basic("labs_transcripts", workspace);

      // Group-scoped flag targeting the global group (user is a member).
      await FeatureFlagFactory.basic("email_agents", workspace, {
        groupIds: [globalGroup.id],
      });

      // Group-scoped flag targeting a group the user is NOT in.
      const otherGroup = await GroupResource.makeNew({
        name: "other-group",
        workspaceId: workspace.id,
        kind: "regular",
      });
      await FeatureFlagFactory.basic("discord_bot", workspace, {
        groupIds: [otherGroup.id],
      });

      const flags = await getFeatureFlags(authenticator);
      expect(flags).toContain("labs_transcripts");
      expect(flags).toContain("email_agents");
      expect(flags).not.toContain("discord_bot");
    });
  });
});
