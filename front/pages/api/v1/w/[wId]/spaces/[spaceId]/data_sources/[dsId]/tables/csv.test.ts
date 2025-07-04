import { Readable } from "stream";
import { describe, vi } from "vitest";
import { expect } from "vitest";

import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import {
  createPublicApiMockRequest,
  createPublicApiSystemOnlyAuthenticationTests,
} from "@app/tests/utils/generic_public_api_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./csv";

const CORE_TABLES_FAKE_RESPONSE = {
  response: {
    table: {
      project: { project_id: 47 },
      data_source_id:
        "21ab3a9994350d8bbd3f76e4c5d233696d6793b271f19407d60d7db825a16381",
      data_source_internal_id:
        "7f93516e45f485f18f889040ed13764a418acf422c34f4f0d3e9474ccccb5386",
      created: 1738254966701,
      table_id: "fooTable-1",
      name: "footable",
      description: "desc",
      timestamp: 1738254966701,
      tags: [],
      title: "Wonderful table",
      mime_type: "text/csv",
      provider_visibility: null,
      parent_id: null,
      parents: ["fooTable-1"],
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
      {
        name: "foo",
        value_type: "int",
        possible_values: ["1", "4"],
      },
      {
        name: "bar",
        value_type: "int",
        possible_values: ["2", "5"],
      },
      {
        name: "baz",
        value_type: "int",
        possible_values: ["3", "6"],
      },
    ],
  },
};

describe(
  "system-only authentication tests",
  createPublicApiSystemOnlyAuthenticationTests(handler)
);

vi.mock(import("@app/lib/api/config"), (() => ({
  default: {
    getCoreAPIConfig: vi.fn().mockReturnValue({
      url: "http://localhost:9999",
      apiKey: "foo",
    }),
  },
})) as any);

// Create a mock content setter
const mockFileContent = {
  content: "default content", // Default content
  setContent: (newContent: string) => {
    mockFileContent.content = newContent;
  },
};

// Mock file storage with parameterizable content
vi.mock("@app/lib/file_storage", () => ({
  getUpsertQueueBucket: vi.fn(() => ({
    file: () => ({
      createReadStream: () => Readable.from([mockFileContent.content]),
    }),
  })),
  getPrivateUploadBucket: vi.fn(() => ({
    file: () => ({
      createReadStream: () => Readable.from([mockFileContent.content]),
    }),
  })),
}));

describe("POST /api/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/csv", () => {
  itInTransaction("successfully upserts a CSV received as file", async (t) => {
    const { req, res, workspace, globalGroup } =
      await createPublicApiMockRequest({
        systemKey: true,
        method: "POST",
      });

    const space = await SpaceFactory.global(workspace, t);
    await GroupSpaceFactory.associate(space, globalGroup);
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      space,
      t
    );

    const file = await FileFactory.csv(workspace, null, {
      useCase: "upsert_table",
    });

    // Set specific content for this test
    mockFileContent.setContent("foo,bar,baz\n1,2,3\n4,5,6");

    req.query.spaceId = space.sId;
    req.query.dsId = dataSourceView.dataSource.sId;

    req.body = {
      name: "footable",
      truncate: true,
      title: "Wonderful table",
      mimeType: "text/csv",
      description: "desc",
      fileId: file.sId,
      tableId: "fooTable-1",
      allowEmptySchema: true,
    };

    // First fetch is to create the table
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      const req = JSON.parse(init.body);

      if ((url as string).endsWith("/tables")) {
        expect(req.table_id).toBe("fooTable-1");
        expect(req.name).toBe("footable");
        expect(req.parents[0]).toBe("fooTable-1");
        expect(req.source_url).toBeNull();
        return Promise.resolve(
          new Response(JSON.stringify(CORE_TABLES_FAKE_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }

      if ((url as string).endsWith("/csv")) {
        expect(req.bucket_csv_path).toBe(
          `files/w/${workspace.sId}/${file.sId}/processed`
        );
        expect(req.truncate).toBe(true);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              response: {
                success: true,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        );
      }

      if ((url as string).endsWith("/validate_csv_content")) {
        expect(req.bucket_csv_path).toBe(
          `files/w/${workspace.sId}/${file.sId}/processed`
        );
        return Promise.resolve(
          new Response(JSON.stringify(CORE_VALIDATE_CSV_FAKE_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  itInTransaction(
    "errors if the file provided has the wrong use-case",
    async (t) => {
      const { req, res, workspace, globalGroup } =
        await createPublicApiMockRequest({
          systemKey: true,
          method: "POST",
        });

      const space = await SpaceFactory.global(workspace, t);
      await GroupSpaceFactory.associate(space, globalGroup);
      const dataSourceView = await DataSourceViewFactory.folder(
        workspace,
        space,
        t
      );

      const file = await FileFactory.csv(workspace, null, {
        useCase: "avatar",
      });

      // Set specific content for this test
      mockFileContent.setContent("foo,bar,baz\n1,2,3\n4,5,6");

      req.query.spaceId = space.sId;
      req.query.dsId = dataSourceView.dataSource.sId;

      req.body = {
        name: "footable",
        truncate: true,
        title: "Wonderful table",
        mimeType: "text/csv",
        description: "desc",
        fileId: file.sId,
        tableId: "fooTable-1",
        allowEmptySchema: true,
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/validate_csv_content")) {
          return Promise.resolve(
            new Response(JSON.stringify(CORE_VALIDATE_CSV_FAKE_RESPONSE), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.message).toContain(
        "The file provided has not the expected use-case"
      );
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    }
  );
});
