import { isAuthorizedForSkillSuggestion } from "@app/lib/api/skills/suggestion_authorization";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { describe, expect, it } from "vitest";

describe("skill suggestion authorization", () => {
  it("requires `make_discoverable` only to make a skill auto-discoverable", async () => {
    const { authenticator, user, workspace } = await createResourceTest({
      role: "user",
    });
    // The factory grants `publish` for this availability, not `make_discoverable`.
    const skill = await SkillFactory.create(authenticator, {
      availability: "workspace_users",
    });
    await authenticator.refresh();

    expect(
      isAuthorizedForSkillSuggestion(authenticator, skill, {
        kind: "availability",
        suggestion: { availability: "editors" },
      })
    ).toBe(true);
    expect(
      isAuthorizedForSkillSuggestion(authenticator, skill, {
        kind: "availability",
        suggestion: { availability: "users_and_agents" },
      })
    ).toBe(false);

    await grantWorkspacePermission(workspace, user, {
      grantType: "make_discoverable",
      resourceType: "skill",
    });
    await authenticator.refresh();

    expect(
      isAuthorizedForSkillSuggestion(authenticator, skill, {
        kind: "availability",
        suggestion: { availability: "users_and_agents" },
      })
    ).toBe(true);
  });
});
