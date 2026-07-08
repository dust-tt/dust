import { seedWorkspaceCapabilities } from "@app/lib/api/permissions/governance_seeding";
import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("seedWorkspaceCapabilities", () => {
  it("is a safe no-op with the empty Phase 0 seeder list", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Empty registry: resolves without touching the database.
    await expect(seedWorkspaceCapabilities(auth)).resolves.toBeUndefined();
  });
});
