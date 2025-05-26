import { describe, expect } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

describe("DataSourceViewResource", () => {
  describe("listByWorkspace", () => {
    itInTransaction(
      "should only return views for the current workspace",
      async (t) => {
        // Create two workspaces
        const workspace1 = await WorkspaceFactory.basic();
        const workspace2 = await WorkspaceFactory.basic();

        // Create spaces for each workspace
        const space1 = await SpaceFactory.regular(workspace1, t);
        const space2 = await SpaceFactory.regular(workspace2, t);
        await SpaceFactory.conversations(workspace1, t);
        await SpaceFactory.conversations(workspace2, t);

        // Create data source views for both workspaces
        await DataSourceViewFactory.folder(workspace1, space1, t);
        await DataSourceViewFactory.folder(workspace1, space1, t);
        await DataSourceViewFactory.folder(workspace2, space2, t);
        await DataSourceViewFactory.folder(workspace2, space2, t);

        // Create a user for workspace1
        const { globalGroup } = await GroupFactory.defaults(workspace1);
        const user1 = await UserFactory.superUser();
        await MembershipFactory.associate(workspace1, user1, "user");
        await GroupSpaceFactory.associate(space1, globalGroup);

        const auth = await Authenticator.fromUserIdAndWorkspaceId(
          user1.sId,
          workspace1.sId
        );

        // List views for workspace1
        const views1 = await DataSourceViewResource.listByWorkspace(auth);

        // Verify we only get views for workspace1
        expect(views1).toHaveLength(2);
        expect(views1[0].workspaceId).toBe(workspace1.id);
        expect(views1[1].workspaceId).toBe(workspace1.id);

        // Create auth for workspace2
        const auth2 = await Authenticator.internalAdminForWorkspace(
          workspace2.sId
        );

        // List views for workspace2
        const views2 = await DataSourceViewResource.listByWorkspace(auth2);

        // Verify we only get views for workspace2
        expect(views2).toHaveLength(2);
        expect(views2[0].workspaceId).toBe(workspace2.id);
        expect(views2[1].workspaceId).toBe(workspace2.id);
      }
    );

    itInTransaction(
      "should respect fetchDataSourceViewOptions parameters",
      async (t) => {
        // Create workspace and spaces
        const workspace = await WorkspaceFactory.basic();
        const space = await SpaceFactory.regular(workspace, t);
        await SpaceFactory.conversations(workspace, t);

        // Create data source views
        const editor = await UserFactory.basic();
        const view1 = await DataSourceViewFactory.folder(
          workspace,
          space,
          t,
          editor
        );
        const view2 = await DataSourceViewFactory.folder(
          workspace,
          space,
          t,
          editor
        );
        const view3 = await DataSourceViewFactory.folder(
          workspace,
          space,
          t,
          editor
        );

        // Create auth
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        // Test limit parameter
        const limitedViews = await DataSourceViewResource.listByWorkspace(
          auth,
          {
            limit: 2,
          }
        );
        expect(limitedViews).toHaveLength(2);

        // Test order parameter
        const orderedViews = await DataSourceViewResource.listByWorkspace(
          auth,
          {
            order: [["createdAt", "DESC"]],
          }
        );
        expect(orderedViews).toHaveLength(3);
        expect(orderedViews[0].id).toBe(view3.id);
        expect(orderedViews[1].id).toBe(view2.id);
        expect(orderedViews[2].id).toBe(view1.id);

        // Test includeEditedBy parameter
        const viewsWithEditedBy = await DataSourceViewResource.listByWorkspace(
          auth,
          {
            includeEditedBy: true,
          }
        );
        expect(viewsWithEditedBy).toHaveLength(3);
        expect(viewsWithEditedBy[0].editedByUser).toBeDefined();
      }
    );

    itInTransaction(
      "should respect includeConversationDataSources parameter",
      async (t) => {
        // Create workspace
        const workspace = await WorkspaceFactory.basic();

        // Create regular space and conversation space
        const regularSpace = await SpaceFactory.regular(workspace, t);
        const conversationSpace = await SpaceFactory.conversations(
          workspace,
          t
        );

        // Create data source views in both spaces
        await DataSourceViewFactory.folder(workspace, regularSpace, t);
        await DataSourceViewFactory.folder(workspace, conversationSpace, t);

        // Create auth
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        // Test without including conversation data sources
        const viewsWithoutConversations =
          await DataSourceViewResource.listByWorkspace(auth, undefined, false);
        expect(viewsWithoutConversations).toHaveLength(1);
        expect(viewsWithoutConversations[0].space.id).toBe(regularSpace.id);

        // Test including conversation data sources
        const viewsWithConversations =
          await DataSourceViewResource.listByWorkspace(auth, undefined, true);
        expect(viewsWithConversations).toHaveLength(2);
        expect(viewsWithConversations.map((v) => v.space.id).sort()).toEqual(
          [regularSpace.id, conversationSpace.id].sort()
        );
      }
    );
  });
});
