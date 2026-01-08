import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOrCreateProjectContextDataSourceFromFile } from "@app/lib/api/data_sources";
import { getProjectContextDatasourceName } from "@app/lib/api/projects";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType } from "@app/types";
import { CoreAPI, Ok } from "@app/types";

// Mock distributed lock to avoid Redis dependency
vi.mock("@app/lib/lock", () => ({
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
vi.spyOn(CoreAPI.prototype, "createProject").mockImplementation(async () => {
  return new Ok({
    project: {
      project_id: Math.floor(Math.random() * 1000000),
    },
  });
});

vi.spyOn(CoreAPI.prototype, "createDataSource").mockImplementation(
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

describe("Project Context DataSource", () => {
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

    // Create a project space
    space = await SpaceFactory.project(workspace);
  });

  afterEach(async () => {
    // Clean up datasources created during tests
    const dataSources = await DataSourceResource.listByWorkspace(auth);
    for (const ds of dataSources) {
      if (ds.name === getProjectContextDatasourceName(space.id)) {
        await ds.delete(auth, { hardDelete: true });
      }
    }
  });

  describe("getOrCreateProjectContextDataSourceFromFile", () => {
    it("should create a new datasource for a project context file", async () => {
      const file = await FileResource.makeNew({
        contentType: "text/plain",
        fileName: "test-file.txt",
        fileSize: 1024,
        userId: user.id,
        workspaceId: workspace.id,
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space.sId,
        },
      });

      const result = await getOrCreateProjectContextDataSourceFromFile(
        auth,
        file
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const dataSource = result.value;
        expect(dataSource.name).toBe(getProjectContextDatasourceName(space.id));
        expect(dataSource.vaultId).toBe(space.id);
      }

      await file.delete(auth);
    });

    it("should return the same datasource when called twice", async () => {
      // Create two files with the same space
      const file1 = await FileResource.makeNew({
        contentType: "text/plain",
        fileName: "test-file-1.txt",
        fileSize: 1024,
        userId: user.id,
        workspaceId: workspace.id,
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space.sId,
        },
      });

      const file2 = await FileResource.makeNew({
        contentType: "text/plain",
        fileName: "test-file-2.txt",
        fileSize: 2048,
        userId: user.id,
        workspaceId: workspace.id,
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space.sId,
        },
      });

      // Get datasource for both files
      const result1 = await getOrCreateProjectContextDataSourceFromFile(
        auth,
        file1
      );
      const result2 = await getOrCreateProjectContextDataSourceFromFile(
        auth,
        file2
      );

      expect(result1.isOk()).toBe(true);
      expect(result2.isOk()).toBe(true);

      if (result1.isOk() && result2.isOk()) {
        expect(result1.value.id).toBe(result2.value.id);
        expect(result1.value.name).toBe(result2.value.name);
      }

      // Clean up
      await file1.delete(auth);
      await file2.delete(auth);
    });

    it("should return an error if spaceId is missing from metadata", async () => {
      // Create a file without spaceId in metadata
      const file = await FileResource.makeNew({
        contentType: "text/plain",
        fileName: "test-file.txt",
        fileSize: 1024,
        userId: user.id,
        workspaceId: workspace.id,
        useCase: "project_context",
        useCaseMetadata: {},
      });

      // Attempt to get datasource
      const result = await getOrCreateProjectContextDataSourceFromFile(
        auth,
        file
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("invalid_request_error");
        expect(result.error.message).toContain("spaceId");
      }

      await file.delete(auth);
    });

    it("should create different datasources for different spaces", async () => {
      // Create a second project space
      const space2 = await SpaceFactory.project(workspace);

      // Create files in different spaces
      const file1 = await FileResource.makeNew({
        contentType: "text/plain",
        fileName: "test-file-1.txt",
        fileSize: 1024,
        userId: user.id,
        workspaceId: workspace.id,
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space.sId,
        },
      });

      const file2 = await FileResource.makeNew({
        contentType: "text/plain",
        fileName: "test-file-2.txt",
        fileSize: 2048,
        userId: user.id,
        workspaceId: workspace.id,
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space2.sId,
        },
      });

      const result1 = await getOrCreateProjectContextDataSourceFromFile(
        auth,
        file1
      );
      const result2 = await getOrCreateProjectContextDataSourceFromFile(
        auth,
        file2
      );

      expect(result1.isOk()).toBe(true);
      expect(result2.isOk()).toBe(true);

      if (result1.isOk() && result2.isOk()) {
        expect(result1.value.id).not.toBe(result2.value.id);
        expect(result1.value.name).toBe(
          getProjectContextDatasourceName(space.id)
        );
        expect(result1.value.space.sId).toBe(space.sId);
        expect(result2.value.name).toBe(
          getProjectContextDatasourceName(space2.id)
        );
        expect(result2.value.space.sId).toBe(space2.sId);
      }

      // Clean up
      await file1.delete(auth);
      await file2.delete(auth);
    });
  });

  describe("DataSourceResource.fetchByName", () => {
    it("should fetch a datasource by name", async () => {
      const file = await FileResource.makeNew({
        contentType: "text/plain",
        fileName: "test-file.txt",
        fileSize: 1024,
        userId: user.id,
        workspaceId: workspace.id,
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space.sId,
        },
      });

      const createResult = await getOrCreateProjectContextDataSourceFromFile(
        auth,
        file
      );
      expect(createResult.isOk()).toBe(true);

      if (createResult.isOk()) {
        const fetchedDataSource = await DataSourceResource.fetchByProjectId(
          auth,
          space.id
        );

        expect(fetchedDataSource?.name).toBe(
          getProjectContextDatasourceName(space.id)
        );
        expect(fetchedDataSource?.id).toBe(createResult.value.id);
      }

      // Clean up
      await file.delete(auth);
    });
  });
});
