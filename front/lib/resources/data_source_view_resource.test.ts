import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

describe("DataSourceViewResource", () => {
  describe("listByWorkspace", () => {
    it("should only return views for the current workspace", async () => {
      // Create two workspaces
      const workspace1 = await WorkspaceFactory.basic();
      const workspace2 = await WorkspaceFactory.basic();

      // Create spaces for each workspace
      const space1 = await SpaceFactory.regular(workspace1);
      const space2 = await SpaceFactory.regular(workspace2);
      await SpaceFactory.conversations(workspace1);
      await SpaceFactory.conversations(workspace2);

      // Create data source views for both workspaces
      await DataSourceViewFactory.folder(workspace1, space1);
      await DataSourceViewFactory.folder(workspace1, space1);
      await DataSourceViewFactory.folder(workspace2, space2);
      await DataSourceViewFactory.folder(workspace2, space2);

      // Create a user for workspace1
      const { globalGroup } = await GroupFactory.defaults(workspace1);
      const user1 = await UserFactory.superUser();
      await MembershipFactory.associate(workspace1, user1, { role: "user" });
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
    });

    it("should respect fetchDataSourceViewOptions parameters", async () => {
      // Create workspace and spaces
      const workspace = await WorkspaceFactory.basic();
      const space = await SpaceFactory.regular(workspace);
      await SpaceFactory.conversations(workspace);

      // Create data source views
      const editor = await UserFactory.basic();
      const view1 = await DataSourceViewFactory.folder(
        workspace,
        space,
        editor
      );
      const view2 = await DataSourceViewFactory.folder(
        workspace,
        space,
        editor
      );
      const view3 = await DataSourceViewFactory.folder(
        workspace,
        space,
        editor
      );

      // Create auth
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Test limit parameter
      const limitedViews = await DataSourceViewResource.listByWorkspace(auth, {
        limit: 2,
      });
      expect(limitedViews).toHaveLength(2);

      // Test order parameter
      const orderedViews = await DataSourceViewResource.listByWorkspace(auth, {
        order: [["createdAt", "DESC"]],
      });
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
    });

    it("should respect includeConversationDataSources parameter", async () => {
      // Create workspace
      const workspace = await WorkspaceFactory.basic();

      // Create regular space and conversation space
      const regularSpace = await SpaceFactory.regular(workspace);
      const conversationSpace = await SpaceFactory.conversations(workspace);

      // Create data source views in both spaces
      await DataSourceViewFactory.folder(workspace, regularSpace);
      await DataSourceViewFactory.folder(workspace, conversationSpace);

      // Create auth
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

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
    });
  });

  describe("removeChildrenIfEnclosedBy", () => {
    it("should return empty array for empty input", () => {
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy([]);
      expect(result).toEqual([]);
    });

    it("should return single path unchanged", () => {
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy([
        "a.b.c",
      ]);
      expect(result).toEqual(["a.b.c"]);
    });

    it("should remove children when parent is present", () => {
      const input = ["a.b", "a.b.c", "a.b.c.d"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result).toEqual(["a.b"]);
    });

    it("should handle multiple independent paths", () => {
      const input = ["a.b", "x.y", "m.n.o"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result.sort()).toEqual(["a.b", "m.n.o", "x.y"]);
    });

    it("should handle mixed parent-child relationships", () => {
      const input = ["a.b.c", "a.b", "x.y.z", "x.y", "m.n"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result.sort()).toEqual(["a.b", "m.n", "x.y"]);
    });

    it("should preserve paths that are not children of others", () => {
      const input = ["a.b.c", "a.b.d", "a.x.y"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result.sort()).toEqual(["a.b.c", "a.b.d", "a.x.y"]);
    });

    it("should handle deep nesting correctly", () => {
      const input = ["a", "a.b", "a.b.c", "a.b.c.d", "a.b.c.d.e"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result).toEqual(["a"]);
    });

    it("should handle similar prefixes that are not actual parents", () => {
      const input = ["abc", "ab.c", "ab.cd"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result.sort()).toEqual(["ab.c", "ab.cd", "abc"]);
    });

    it("should handle complex mixed scenarios", () => {
      const input = [
        "folder1.subfolder1.file1",
        "folder1.subfolder1",
        "folder1.subfolder2.file2",
        "folder2.file3",
        "folder1",
        "folder3.sub.deep.very.nested",
      ];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result.sort()).toEqual([
        "folder1",
        "folder2.file3",
        "folder3.sub.deep.very.nested",
      ]);
    });

    it("should handle paths with same prefix but different structures", () => {
      const input = ["a.b", "a.bc", "a.b.c"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result.sort()).toEqual(["a.b", "a.bc"]);
    });

    it("should handle unordered input correctly", () => {
      const input = ["x.y.z.w", "a.b", "x.y", "a.b.c.d", "x"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result.sort()).toEqual(["a.b", "x"]);
    });

    it("should handle duplicate paths", () => {
      const input = ["a.b", "a.b.c", "a.b", "a.b.c"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result).toEqual(["a.b"]);
    });

    it("should handle single character paths", () => {
      const input = ["a", "a.b", "b", "b.c"];
      const result = DataSourceViewResource.removeChildrenIfEnclosedBy(input);
      expect(result.sort()).toEqual(["a", "b"]);
    });
  });
});
