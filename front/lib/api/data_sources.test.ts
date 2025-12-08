import { beforeEach, describe, expect, it, vi } from "vitest";

import { softDeleteDataSourceAndLaunchScrubWorkflow } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { UserFactory } from "@app/tests/utils/UserFactory";

// Mock the dependencies
vi.mock("@app/poke/temporal/client", () => ({
  launchScrubDataSourceWorkflow: vi.fn(),
}));

describe("softDeleteDataSourceAndLaunchScrubWorkflow", () => {
  let builderAuth: Authenticator;
  let userAuth: Authenticator;
  let folderDataSource: DataSourceResource;

  beforeEach(async () => {
    // Setup builder user
    const builderSetup = await createResourceTest({ role: "builder" });
    builderAuth = builderSetup.authenticator;

    // Setup regular user
    const userSetup = await createResourceTest({
      role: "user",
    });
    userAuth = userSetup.authenticator;

    // Create a folder data source owned by the regular user
    const dataSourceView = await DataSourceViewFactory.folder(
      userSetup.workspace,
      userSetup.globalSpace,
      userSetup.user
    );
    folderDataSource = dataSourceView.dataSource;

    // Spy on the view listing to return empty array by default
    vi.spyOn(DataSourceViewResource, "listForDataSources").mockResolvedValue(
      []
    );

    // Clear mocks before each test
    vi.clearAllMocks();
  });

  describe("authorization checks", () => {
    it("should allow builder to delete any data source", async () => {
      const result = await softDeleteDataSourceAndLaunchScrubWorkflow(
        builderAuth,
        folderDataSource
      );

      expect(result.isOk()).toBe(true);
      expect(launchScrubDataSourceWorkflow).toHaveBeenCalledOnce();
    });

    it("should allow user to delete their own folder data source", async () => {
      const result = await softDeleteDataSourceAndLaunchScrubWorkflow(
        userAuth,
        folderDataSource
      );

      expect(result.isOk()).toBe(true);
      expect(launchScrubDataSourceWorkflow).toHaveBeenCalledOnce();
    });

    it("should not allow user to delete folder created by another user", async () => {
      // Create another user
      const anotherUser = await UserFactory.basic();
      const anotherUserSetup = await createResourceTest({ role: "user" });

      // Create a folder owned by the other user
      const otherUserDataSourceView = await DataSourceViewFactory.folder(
        anotherUserSetup.workspace,
        anotherUserSetup.globalSpace,
        anotherUser
      );

      const result = await softDeleteDataSourceAndLaunchScrubWorkflow(
        userAuth,
        otherUserDataSourceView.dataSource
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("unauthorized_deletion");
        expect(result.error.message).toContain(
          "Only builders can delete data sources"
        );
      }
      expect(launchScrubDataSourceWorkflow).not.toHaveBeenCalled();
    });

    it("should not allow user to delete connector-based data source", async () => {
      // Create a mock connector data source
      const connectorDataSource = {
        ...folderDataSource,
        connectorProvider: "slack",
        connectorId: "conn-123",
      } as unknown as DataSourceResource;

      const result = await softDeleteDataSourceAndLaunchScrubWorkflow(
        userAuth,
        connectorDataSource
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("unauthorized_deletion");
      }
      expect(launchScrubDataSourceWorkflow).not.toHaveBeenCalled();
    });
  });
});
