import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getProjectContextDataSourceView } from "@app/lib/api/assistant/jit_actions";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

describe("JIT Actions - Project Context Integration", () => {
  let auth: Authenticator;
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let space: SpaceResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    user = await UserFactory.basic();
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create a space with conversations enabled (project).
    const group = await GroupResource.makeNew({
      name: "Test Group",
      workspaceId: workspace.id,
      kind: "regular",
    });

    space = await SpaceResource.makeNew(
      {
        name: "Test Project",
        kind: "regular",
        workspaceId: workspace.id,
        conversationsEnabled: true,
      },
      [group]
    );
  });

  describe("getProjectContextDataSourceView", () => {
    it("should return null for conversation without spaceId", async () => {
      const conversation: ConversationWithoutContentType = {
        id: 1,
        sId: "conv123",
        created: Date.now(),
        updated: Date.now(),
        unread: false,
        actionRequired: false,
        hasError: false,
        title: null,
        spaceId: null,
        depth: 0,
        requestedSpaceIds: [],
      };

      const view = await getProjectContextDataSourceView(auth, conversation);
      expect(view).toBeNull();
    });

    it("should return null when no project context datasource exists", async () => {
      const conversation: ConversationWithoutContentType = {
        id: 1,
        sId: "conv123",
        created: Date.now(),
        updated: Date.now(),
        unread: false,
        actionRequired: false,
        hasError: false,
        title: null,
        spaceId: space.sId,
        depth: 0,
        requestedSpaceIds: [],
      };

      // Should return null since no datasource was created.
      const view = await getProjectContextDataSourceView(auth, conversation);
      expect(view).toBeNull();
    });

    it("should return datasource view when project context datasource exists", async () => {
      // Create project context datasource and default view.
      const view =
        await DataSourceViewResource.createDataSourceAndDefaultView(
          {
            name: `__project_context__${space.id}`,
            description: "Project context datasource",
            assistantDefaultSelected: true,
            dustAPIProjectId: "dust-project-id-test",
            dustAPIDataSourceId: "dust-datasource-id-test",
            workspaceId: workspace.id,
          },
          space
        );

      const conversation: ConversationWithoutContentType = {
        id: 1,
        sId: "conv123",
        created: Date.now(),
        updated: Date.now(),
        unread: false,
        actionRequired: false,
        hasError: false,
        title: null,
        spaceId: space.sId,
        depth: 0,
        requestedSpaceIds: [],
      };

      // Should find and return the view.
      const result = await getProjectContextDataSourceView(auth, conversation);
      expect(result).not.toBeNull();
      expect(result?.sId).toBe(view.sId);

      // Clean up.
      await view.delete(auth, { hardDelete: true });
      await view.dataSource.delete(auth, { hardDelete: true });
    });
  });

  describe("Project context file integration", () => {
    it("should map project context files to datasource view", async () => {
      // Create project context datasource and default view.
      const view =
        await DataSourceViewResource.createDataSourceAndDefaultView(
          {
            name: `__project_context__${space.id}`,
            description: "Project context datasource",
            assistantDefaultSelected: true,
            dustAPIProjectId: "dust-project-id-test",
            dustAPIDataSourceId: "dust-datasource-id-test",
            workspaceId: workspace.id,
          },
          space
        );

      // Create a project context file.
      const file = await FileResource.makeNew({
        contentType: "text/csv",
        fileName: "test-data.csv",
        fileSize: 1024,
        userId: user.id,
        workspaceId: workspace.id,
        useCase: "project_context",
        useCaseMetadata: { spaceId: space.sId },
      });
      await file.markAsReady();

      // Test that getJITServers would correctly map this file
      // This would require calling getJITServers with appropriate attachments
      // For now, this serves as a placeholder for integration testing

      // Clean up.
      await file.delete(auth);
      await view.delete(auth, { hardDelete: true });
      await view.dataSource.delete(auth, { hardDelete: true });
    });
  });
});
