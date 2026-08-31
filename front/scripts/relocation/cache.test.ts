import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { afterEach, describe, expect, it, vi } from "vitest";

import { invalidateRelocatedWorkspaceCaches } from "./cache";

describe("invalidateRelocatedWorkspaceCaches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates the workspace and subscription caches", async () => {
    const workspace = await WorkspaceFactory.basic();
    const invalidateWorkspaceCache = vi
      .spyOn(WorkspaceResource, "invalidateCache")
      .mockResolvedValue();
    const invalidateSubscriptionCache = vi
      .spyOn(SubscriptionResource, "invalidateSubscriptionCache")
      .mockResolvedValue();

    await invalidateRelocatedWorkspaceCaches(workspace.sId);

    expect(invalidateWorkspaceCache).toHaveBeenCalledExactlyOnceWith(
      workspace.sId
    );
    expect(invalidateSubscriptionCache).toHaveBeenCalledExactlyOnceWith(
      workspace.id
    );
  });

  it("fails when the relocated workspace is missing", async () => {
    await expect(
      invalidateRelocatedWorkspaceCaches("missing-workspace")
    ).rejects.toThrow("Workspace not found: missing-workspace");
  });
});
