import { softDeleteDataSourceAndLaunchScrubWorkflow } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { CoreAPI } from "@app/types/core/core_api";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock distributed lock to avoid Redis dependency
vi.mock("@app/lib/lock", () => ({
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  executeWithLock: vi.fn(async (_lockName, fn) => {
    // Simply execute the function without locking in tests
    return fn();
  }),
}));

// Mock config to avoid requiring environment variables
vi.mock("@app/lib/api/config", () => ({
  default: {
    getCoreAPIConfig: () => ({
      url: "http://localhost:3001",
      logger: console,
    }),
  },
}));

// Mock CoreAPI methods to avoid requiring the Core service
// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
vi.spyOn(CoreAPI.prototype, "createProject").mockImplementation(async () => {
  return new Ok({
    project: {
      project_id: Math.floor(Math.random() * 1000000),
    },
  });
});

vi.spyOn(CoreAPI.prototype, "createDataSource").mockImplementation(
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async ({ name }) => {
    return new Ok({
      data_source: {
        created: Date.now(),
        data_source_id: `mock-datasource-${Math.random().toString(36).substring(7)}`,
        data_source_internal_id: `internal-${Math.random().toString(36).substring(7)}`,
        name,
        config: {
          embedder_config: {
            embedder: {
              provider_id: "openai",
              model_id: "text-embedding-ada-002",
              splitter_id: "base_v0",
              max_chunk_size: 512,
            },
          },
          qdrant_config: {
            cluster: "cluster-0",
            shadow_write_cluster: null,
          },
        },
      },
    });
  }
);

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

    // Create a folder data source owned by the builder in their workspace
    const dataSourceView = await DataSourceViewFactory.folder(
      builderSetup.workspace,
      builderSetup.globalSpace,
      builderSetup.user
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
        { dataSource: otherUserDataSourceView.dataSource }
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
        { dataSource: connectorDataSource }
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("unauthorized_deletion");
      }
      expect(launchScrubDataSourceWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("successful deletions", () => {
    it("should allow builder to delete folder data source", async () => {
      const result = await softDeleteDataSourceAndLaunchScrubWorkflow(
        builderAuth,
        { dataSource: folderDataSource }
      );

      expect(result.isOk()).toBe(true);
      expect(launchScrubDataSourceWorkflow).toHaveBeenCalledWith(
        builderAuth.workspace(),
        folderDataSource
      );
      expect(launchScrubDataSourceWorkflow).toHaveBeenCalledTimes(1);
    });

    it("should soft delete all data source views before deleting data source", async () => {
      // Create multiple views for the data source
      const view1 = {
        id: 1,
        delete: vi.fn().mockResolvedValue({ isErr: () => false }),
      };
      const view2 = {
        id: 2,
        delete: vi.fn().mockResolvedValue({ isErr: () => false }),
      };

      vi.spyOn(DataSourceViewResource, "listForDataSources").mockResolvedValue([
        view1,
        view2,
      ] as any);

      const result = await softDeleteDataSourceAndLaunchScrubWorkflow(
        builderAuth,
        { dataSource: folderDataSource }
      );

      expect(result.isOk()).toBe(true);
      expect(view1.delete).toHaveBeenCalledWith(builderAuth, {
        transaction: undefined,
        hardDelete: false,
      });
      expect(view2.delete).toHaveBeenCalledWith(builderAuth, {
        transaction: undefined,
        hardDelete: false,
      });
      expect(launchScrubDataSourceWorkflow).toHaveBeenCalled();
    });

    it("should launch scrub workflow with correct workspace and data source", async () => {
      const result = await softDeleteDataSourceAndLaunchScrubWorkflow(
        builderAuth,
        { dataSource: folderDataSource }
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sId).toBe(folderDataSource.sId);
      }
      expect(launchScrubDataSourceWorkflow).toHaveBeenCalledWith(
        builderAuth.workspace(),
        folderDataSource
      );
    });
  });
});
