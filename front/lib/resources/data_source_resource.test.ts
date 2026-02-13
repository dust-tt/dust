import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock config to avoid requiring environment variables
vi.mock("@app/lib/api/config", () => ({
  default: {
    getConnectorsAPIConfig: () => ({
      url: "http://localhost:3002",
      secret: "test-secret",
      webhookSecret: "test-webhook-secret",
    }),
  },
}));

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
