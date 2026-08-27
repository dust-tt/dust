import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DataSourceResource.hardDelete", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;
  let space: SpaceResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();

    // Set up default groups and spaces
    const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);

    await MembershipFactory.associate(workspace, adminUser, {
      role: "admin",
    });

    // Create internal admin auth to set up default spaces
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
      globalGroup,
      systemGroup,
    });

    // Now create admin authenticator
    adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    // Create a test space
    space = await SpaceFactory.regular(workspace);
  });

  it("should call connectorsAPI.deleteConnector with correct args for dust_project connector", async () => {
    // Create a data source with dust_project connector
    const dataSourceView =
      await DataSourceViewResource.createDataSourceAndDefaultView(
        {
          name: "test-dust-project-datasource",
          assistantDefaultSelected: false,
          connectorProvider: "dust_project",
          dustAPIProjectId: "test-project-id",
          dustAPIDataSourceId: "test-datasource-id",
          workspaceId: workspace.id,
        },
        space,
        adminAuth.user()
      );

    const dataSource = dataSourceView.dataSource;
    const mockConnectorId = "test-connector-id-123";
    await dataSource.setConnectorId(mockConnectorId);

    // Mock ConnectorsAPI.deleteConnector
    const deleteConnectorSpy = vi
      .spyOn(ConnectorsAPI.prototype, "deleteConnector")
      .mockResolvedValue(new Ok({ success: true }));

    // Call hardDelete through delete method
    const result = await dataSource.delete(adminAuth, { hardDelete: true });

    expect(result.isOk()).toBe(true);

    // Verify deleteConnector was called with correct arguments
    expect(deleteConnectorSpy).toHaveBeenCalledTimes(1);
    expect(deleteConnectorSpy).toHaveBeenCalledWith(
      mockConnectorId,
      true // force delete
    );

    deleteConnectorSpy.mockRestore();
  });

  it("should not call connectorsAPI.deleteConnector for non-dust_project connector", async () => {
    // Create a data source without dust_project connector
    const dataSourceView =
      await DataSourceViewResource.createDataSourceAndDefaultView(
        {
          name: "test-regular-datasource",
          assistantDefaultSelected: false,
          connectorProvider: null,
          dustAPIProjectId: "test-project-id",
          dustAPIDataSourceId: "test-datasource-id",
          workspaceId: workspace.id,
        },
        space,
        adminAuth.user()
      );

    const dataSource = dataSourceView.dataSource;

    // Mock ConnectorsAPI.deleteConnector
    const deleteConnectorSpy = vi
      .spyOn(ConnectorsAPI.prototype, "deleteConnector")
      .mockResolvedValue(new Ok({ success: true }));

    // Call hardDelete through delete method
    const result = await dataSource.delete(adminAuth, { hardDelete: true });

    expect(result.isOk()).toBe(true);

    // Verify deleteConnector was NOT called
    expect(deleteConnectorSpy).not.toHaveBeenCalled();

    deleteConnectorSpy.mockRestore();
  });

  it("should not call connectorsAPI.deleteConnector when connectorId is null", async () => {
    // Create a data source with dust_project connector but no connectorId
    const dataSourceView =
      await DataSourceViewResource.createDataSourceAndDefaultView(
        {
          name: "test-dust-project-datasource-no-connector-id",
          assistantDefaultSelected: false,
          connectorProvider: "dust_project",
          dustAPIProjectId: "test-project-id",
          dustAPIDataSourceId: "test-datasource-id",
          workspaceId: workspace.id,
        },
        space,
        adminAuth.user()
      );

    const dataSource = dataSourceView.dataSource;
    // Ensure connectorId is null
    expect(dataSource.connectorId).toBeNull();

    // Mock ConnectorsAPI.deleteConnector
    const deleteConnectorSpy = vi
      .spyOn(ConnectorsAPI.prototype, "deleteConnector")
      .mockResolvedValue(new Ok({ success: true }));

    // Call hardDelete through delete method
    const result = await dataSource.delete(adminAuth, { hardDelete: true });

    expect(result.isOk()).toBe(true);

    // Verify deleteConnector was NOT called when connectorId is null
    expect(deleteConnectorSpy).not.toHaveBeenCalled();

    deleteConnectorSpy.mockRestore();
  });

  it("should handle connector deletion failure gracefully when connector not found", async () => {
    // Create a data source with dust_project connector
    const dataSourceView =
      await DataSourceViewResource.createDataSourceAndDefaultView(
        {
          name: "test-dust-project-datasource-not-found",
          assistantDefaultSelected: false,
          connectorProvider: "dust_project",
          dustAPIProjectId: "test-project-id",
          dustAPIDataSourceId: "test-datasource-id",
          workspaceId: workspace.id,
        },
        space,
        adminAuth.user()
      );

    const dataSource = dataSourceView.dataSource;
    const mockConnectorId = "test-connector-id-456";
    await dataSource.setConnectorId(mockConnectorId);

    // Mock ConnectorsAPI.deleteConnector to return connector_not_found error
    const deleteConnectorSpy = vi
      .spyOn(ConnectorsAPI.prototype, "deleteConnector")
      .mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
        error: {
          type: "connector_not_found",
          message: "Connector not found",
        },
      } as any);

    // Call hardDelete through delete method
    const result = await dataSource.delete(adminAuth, { hardDelete: true });

    // Should still succeed even if connector not found
    expect(result.isOk()).toBe(true);

    // Verify deleteConnector was called
    expect(deleteConnectorSpy).toHaveBeenCalledTimes(1);
    expect(deleteConnectorSpy).toHaveBeenCalledWith(mockConnectorId, true);

    deleteConnectorSpy.mockRestore();
  });

  it("should fail when connector deletion fails with non-not-found error", async () => {
    // Create a data source with dust_project connector
    const dataSourceView =
      await DataSourceViewResource.createDataSourceAndDefaultView(
        {
          name: "test-dust-project-datasource-error",
          assistantDefaultSelected: false,
          connectorProvider: "dust_project",
          dustAPIProjectId: "test-project-id",
          dustAPIDataSourceId: "test-datasource-id",
          workspaceId: workspace.id,
        },
        space,
        adminAuth.user()
      );

    const dataSource = dataSourceView.dataSource;
    const mockConnectorId = "test-connector-id-789";
    await dataSource.setConnectorId(mockConnectorId);

    // Mock ConnectorsAPI.deleteConnector to return a different error
    const deleteConnectorSpy = vi
      .spyOn(ConnectorsAPI.prototype, "deleteConnector")
      .mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
        error: {
          type: "internal_error",
          message: "Failed to delete connector",
        },
      } as any);

    // Call hardDelete through delete method
    const result = await dataSource.delete(adminAuth, { hardDelete: true });

    // Should fail when connector deletion fails with non-not-found error
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Failed to delete connector");
    }

    // Verify deleteConnector was called
    expect(deleteConnectorSpy).toHaveBeenCalledTimes(1);
    expect(deleteConnectorSpy).toHaveBeenCalledWith(mockConnectorId, true);

    deleteConnectorSpy.mockRestore();
  });
});

describe("DataSourceResource cross-workspace fetch", () => {
  it("unsafeFetchByDustAPIProjectId resolves the space and its groups across workspaces for super users", async () => {
    // Workspace A owns the space and the data source.
    const workspaceA = await WorkspaceFactory.basic();
    const spaceA = await SpaceFactory.regular(workspaceA);
    const dustAPIProjectId = "cross-ws-project-super-user";
    await DataSourceViewFactory.folder(workspaceA, spaceA, null, {
      dustAPIProjectId,
    });

    // The lookup is authenticated against workspace B as a super user (the
    // only cross-workspace path canFetch allows): the space groupSpaces join
    // must resolve the groups of the space's own workspace, not the
    // authenticated one.
    const workspaceB = await WorkspaceFactory.basic();
    const superUser = await UserFactory.superUser();
    await MembershipFactory.associate(workspaceB, superUser, {
      role: "admin",
    });
    const authB = await Authenticator.fromUserIdAndWorkspaceId(
      superUser.sId,
      workspaceB.sId
    );

    const dataSource = await DataSourceResource.unsafeFetchByDustAPIProjectId(
      authB,
      dustAPIProjectId
    );

    expect(dataSource).not.toBeNull();
    expect(dataSource?.space.id).toBe(spaceA.id);
    expect(
      (await dataSource?.space.fetchGrantReferences())?.length
    ).toBeGreaterThan(0);
  });

  it("unsafeFetchByDustAPIProjectId filters out other-workspace resources for non super users", async () => {
    const workspaceA = await WorkspaceFactory.basic();
    const spaceA = await SpaceFactory.regular(workspaceA);
    const dustAPIProjectId = "cross-ws-project-regular-user";
    await DataSourceViewFactory.folder(workspaceA, spaceA, null, {
      dustAPIProjectId,
    });

    const workspaceB = await WorkspaceFactory.basic();
    const authB = await Authenticator.internalAdminForWorkspace(workspaceB.sId);

    const dataSource = await DataSourceResource.unsafeFetchByDustAPIProjectId(
      authB,
      dustAPIProjectId
    );

    expect(dataSource).toBeNull();
  });

  it("resolves every space when one bypassed query spans multiple workspaces", async () => {
    // Two data sources sharing the same dustAPIProjectId in two different
    // workspaces: the bypassed blob query returns both in a single call, so
    // the space fetch must resolve spaces (and their groups) across both
    // workspaces — a miss throws "Unreachable: space not found.".
    const dustAPIProjectId = "multi-ws-project-id";
    const workspaceA = await WorkspaceFactory.basic();
    const spaceA = await SpaceFactory.regular(workspaceA);
    await DataSourceViewFactory.folder(workspaceA, spaceA, null, {
      dustAPIProjectId,
    });

    const workspaceB = await WorkspaceFactory.basic();
    const spaceB = await SpaceFactory.regular(workspaceB);
    await DataSourceViewFactory.folder(workspaceB, spaceB, null, {
      dustAPIProjectId,
    });

    const superUser = await UserFactory.superUser();
    await MembershipFactory.associate(workspaceB, superUser, {
      role: "admin",
    });
    const authB = await Authenticator.fromUserIdAndWorkspaceId(
      superUser.sId,
      workspaceB.sId
    );

    const dataSource = await DataSourceResource.unsafeFetchByDustAPIProjectId(
      authB,
      dustAPIProjectId
    );

    expect(dataSource).not.toBeNull();
    expect(dataSource?.space.workspaceId).toBe(dataSource?.workspaceId);
    expect(
      (await dataSource?.space.fetchGrantReferences())?.length
    ).toBeGreaterThan(0);
    expect(
      (await dataSource?.space.fetchGrantReferences())?.every(
        (group) => group.workspaceId === dataSource!.workspaceId
      )
    ).toBe(true);
  });

  it("scopes fetchById to the authenticated workspace, even for super users", async () => {
    const workspaceA = await WorkspaceFactory.basic();
    const spaceA = await SpaceFactory.regular(workspaceA);
    const dataSourceView = await DataSourceViewFactory.folder(
      workspaceA,
      spaceA
    );

    const workspaceB = await WorkspaceFactory.basic();
    const superUser = await UserFactory.superUser();
    await MembershipFactory.associate(workspaceB, superUser, {
      role: "admin",
    });
    const authB = await Authenticator.fromUserIdAndWorkspaceId(
      superUser.sId,
      workspaceB.sId
    );

    const dataSource = await DataSourceResource.fetchById(
      authB,
      dataSourceView.dataSource.sId
    );

    expect(dataSource).toBeNull();
  });
});
