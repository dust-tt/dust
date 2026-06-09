import { internalFetch } from "@app/lib/api/internal_fetch";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { Readable } from "stream";
import { describe, expect, it, vi } from "vitest";

const CORE_TABLES_FAKE_RESPONSE = {
  response: {
    table: {
      project: { project_id: 47 },
      data_source_id:
        "21ab3a9994350d8bbd3f76e4c5d233696d6793b271f19407d60d7db825a16381",
      data_source_internal_id:
        "7f93516e45f485f18f889040ed13764a418acf422c34f4f0d3e9474ccccb5386",
      created: 1738254966701,
      table_id: "test-table",
      name: "Test Table",
      description: "Test Description",
      timestamp: 1738254966701,
      tags: [],
      title: "Test Title",
      mime_type: "text/csv",
      provider_visibility: null,
      parent_id: null,
      parents: ["test-table"],
      source_url: null,
      schema: null,
      schema_stale_at: null,
      remote_database_table_id: null,
      remote_database_secret_id: null,
    },
  },
};

const CORE_VALIDATE_CSV_FAKE_RESPONSE = {
  response: {
    schema: [
      { name: "foo", value_type: "int", possible_values: ["1", "4"] },
      { name: "bar", value_type: "int", possible_values: ["2", "5"] },
      { name: "baz", value_type: "int", possible_values: ["3", "6"] },
    ],
  },
};

const mockFileContent = {
  content: "default content",
  setContent: (newContent: string) => {
    mockFileContent.content = newContent;
  },
};

vi.mock("@app/lib/file_storage", async () => {
  const { fileStorageMock } = await import(
    "@app/tests/utils/mocks/file_storage"
  );
  return {
    ...fileStorageMock.mock(),
    getUpsertQueueBucket: vi.fn(() => ({
      file: () => ({
        copy: vi.fn().mockResolvedValue(undefined),
        createReadStream: () => Readable.from([mockFileContent.content]),
      }),
    })),
  };
});

function post(workspace: { sId: string }, dsId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/data_sources/${dsId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/data_sources/:dsId/files", () => {
  it("returns 404 when file not found", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      fileId: "non-existent",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("returns 400 on unsupported use-cases", async () => {
    const { auth, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({ method: "POST" });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );
    const file = await FileFactory.csv(auth, user, {
      useCase: "conversation",
    });

    mockFileContent.setContent("foo,bar,baz\n1,2,3\n4,5,6");

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      fileId: file.sId,
      upsertArgs: {
        tableId: "test-table",
        name: "Test Table",
        title: "Test Title",
        description: "Test Description",
        tags: ["test"],
        useAppForHeaderDetection: true,
      },
    });

    expect(response.status).toBe(400);
  });

  it("returns 403 if not authorized to write in the data source (admin)", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const space = await SpaceFactory.regular(workspace);

    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);
    const file = await FileFactory.csv(auth, user, {
      useCase: "upsert_table",
    });

    mockFileContent.setContent("foo,bar,baz\n1,2,3\n4,5,6");

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      fileId: file.sId,
      upsertArgs: {
        tableId: "test-table",
        name: "Test Table",
        title: "Test Title",
        description: "Test Description",
        tags: ["test"],
        useAppForHeaderDetection: true,
      },
    });

    expect(response.status).toBe(403);
  });

  it("returns 403 if not authorized to write in the data source (user)", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    const space = await SpaceFactory.regular(workspace);

    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);
    const file = await FileFactory.csv(auth, user, {
      useCase: "upsert_table",
    });

    mockFileContent.setContent("foo,bar,baz\n1,2,3\n4,5,6");

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      fileId: file.sId,
      upsertArgs: {
        tableId: "test-table",
        name: "Test Table",
        title: "Test Title",
        description: "Test Description",
        tags: ["test"],
        useAppForHeaderDetection: true,
      },
    });

    expect(response.status).toBe(403);
  });

  it("successfully upserts file to data source with the right arguments", async () => {
    const { auth, workspace, globalSpace, user } =
      await createPrivateApiMockRequest({ method: "POST", role: "admin" });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );
    const file = await FileFactory.csv(auth, user, {
      useCase: "upsert_table",
    });

    mockFileContent.setContent("foo,bar,baz\n1,2,3\n4,5,6");

    vi.mocked(internalFetch).mockImplementation(async (url, init) => {
      const req = JSON.parse((init as RequestInit).body as string);
      if ((url as string).endsWith("/tables")) {
        expect(req.table_id).toBe("test-table");
        expect(req.name).toBe("Test Table");
        expect(req.description).toBe("Test Description");
        return Promise.resolve(
          new Response(JSON.stringify(CORE_TABLES_FAKE_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if ((url as string).endsWith("/csv")) {
        expect(req.bucket_csv_path).toBe(
          `files/w/${workspace.sId}/${file.sId}/original`
        );
        expect(req.truncate).toBe(true);
        return Promise.resolve(
          new Response(JSON.stringify({ response: { success: true } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if ((url as string).endsWith("/validate_csv_content")) {
        expect(req.bucket_csv_path).toBe(
          `files/w/${workspace.sId}/${file.sId}/original`
        );
        return Promise.resolve(
          new Response(JSON.stringify(CORE_VALIDATE_CSV_FAKE_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      throw new Error(`Unexpected fetch call to ${url}`);
    });

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      fileId: file.sId,
      upsertArgs: {
        tableId: "test-table",
        name: "Test Table",
        title: "Test Title",
        description: "Test Description",
        tags: ["test"],
        useAppForHeaderDetection: true,
      },
    });

    expect(response.status).toBe(200);
  });
});
