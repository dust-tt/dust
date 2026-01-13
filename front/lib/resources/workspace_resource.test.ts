import { beforeEach, describe, expect, it } from "vitest";

import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types";

describe("WorkspaceResource", () => {
  let workspace: WorkspaceType;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
  });

  describe("updateConversationsRetention", () => {
    it("should set retention days value", async () => {
      const result = await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        30
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.conversationsRetentionDays).toBe(30);
    });

    it("should convert -1 to null", async () => {
      // First set a value
      await WorkspaceResource.updateConversationsRetention(workspace.id, 60);

      // Then set -1 which should convert to null
      const result = await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        -1
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.conversationsRetentionDays).toBeNull();
    });
  });

  describe("disableSSOEnforcement", () => {
    it("should disable SSO when enabled", async () => {
      // Enable SSO first
      await WorkspaceResource.updateByModelIdAndCheckExistence(workspace.id, {
        ssoEnforced: true,
      });

      const result = await WorkspaceResource.disableSSOEnforcement(
        workspace.id
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.ssoEnforced).toBe(false);
    });

    it("should return error when SSO already disabled", async () => {
      // SSO is disabled by default, try to disable again
      const result = await WorkspaceResource.disableSSOEnforcement(
        workspace.id
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "SSO enforcement is already disabled."
        );
      }
    });
  });

  describe("canShareInteractiveContentPublicly", () => {
    it("should return true by default when no metadata", async () => {
      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(true);
    });

    it("should return false when metadata.allowContentCreationFileSharing is false", async () => {
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowContentCreationFileSharing: false,
      });

      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(false);
    });

    it("should return true when metadata.allowContentCreationFileSharing is true", async () => {
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowContentCreationFileSharing: true,
      });

      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(true);
    });
  });
});
