import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { activationSkill } from "@app/lib/resources/skill/code_defined/global/activation";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("activationSkill", () => {
  it("includes skill creation in the context when the user has the capability", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    const instructionsWithoutCapability = await activationSkill.fetchInstructions(
      authenticator,
      { spaceIds: [] }
    );
    expect(instructionsWithoutCapability.split("# Overview")[0]).not.toContain(
      "The user can create Skills in this workspace."
    );

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await GroupPermissionResource.setForEverybody(adminAuth, {
      grantType: "create",
      resourceType: "skill",
    });
    const authWithCapability = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const instructionsWithCapability = await activationSkill.fetchInstructions(
      authWithCapability,
      { spaceIds: [] }
    );
    expect(instructionsWithCapability.split("# Overview")[0]).toContain(
      "The user can create Skills in this workspace."
    );
  });
});
