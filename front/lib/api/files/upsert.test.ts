// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDataSourceFolder, upsertTable } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types";
import { Ok, slugify, TABLE_PREFIX } from "@app/types";

// Mock the data_sources module to spy on upsertTable
vi.mock(import("../data_sources"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    upsertTable: vi.fn().mockImplementation(() => {
      return new Ok({
        table: {
          table_id: "test-table-id",
        },
      });
    }),
    createDataSourceFolder: vi
      .fn()
      .mockImplementation((dataSource, { folderId }) => {
        return new Ok({
          folder: {
            folder_id: folderId,
          },
        });
      }),
  };
});

// Mock generateSnippet
vi.mock(import("./snippet"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    generateSnippet: vi.fn().mockImplementation(() => {
      return new Ok("Mocked snippet");
    }),
  };
});

// Mock the files/utils module to return fake file content
vi.mock(import("../files/utils"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getFileContent: vi.fn(),
  };
});

// Mock the files/upload module to avoid uploading files
vi.mock(import("../files/upload"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    processAndStoreFile: vi.fn().mockResolvedValue(undefined),
  };
});

describe("processAndUpsertToDataSource", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;

  beforeEach(async () => {
    // Create a workspace using WorkspaceFactory
    workspace = await WorkspaceFactory.basic();

    // Mock auth
    auth = {
      workspace: () => workspace,
      getNonNullableWorkspace: () => workspace,
    } as unknown as Authenticator;

    // Reset mocks
    vi.clearAllMocks();
  });

  it("should call upsertTable with the right parameters for a CSV file", async () => {
    // Create a file
    const file = await FileFactory.csv(workspace, null, {
      useCase: "conversation",
      fileName: "test-file.csv",
      status: "ready",
      useCaseMetadata: {
        conversationId: "test-conversation-id",
        generatedTables: [],
      },
    });

    const space = await SpaceFactory.global(workspace);

    const datasourceView = await DataSourceViewFactory.folder(workspace, space);
    // Call processAndUpsertToDataSource which internally calls maybeApplyProcessing
    const result = await processAndUpsertToDataSource(
      auth,
      datasourceView.dataSource,
      {
        file,
      }
    );

    // Verify the result
    expect(result.isOk()).toBe(true);

    // Verify upsertTable was called with the right parameters
    expect(upsertTable).toHaveBeenCalledTimes(1);

    const upsertTableCall = vi.mocked(upsertTable).mock.calls[0][0];

    // Check auth and dataSource
    expect(upsertTableCall.auth).toBe(auth);
    expect(upsertTableCall.dataSource).toBe(datasourceView.dataSource);

    // Check params
    const params = upsertTableCall.params;
    expect(params.tableId).toBe(file.sId);
    expect(params.name).toBe(slugify(file.fileName));
    expect(params.title).toBe(file.fileName);
    expect(params.tags).toContain(`fileId:${file.sId}`);
    expect(params.tags).toContain(`fileName:${file.fileName}`);
    expect(params.tags).toContain(`title:${file.fileName}`);
    expect(params.mimeType).toBe("text/csv");

    // Verify file useCaseMetadata was updated
    // Since we can't directly call reload(), we'll check if the file was updated
    if (result.isOk()) {
      const updatedFile = result.value;
      expect(updatedFile.useCaseMetadata).not.toBeNull();
      expect(updatedFile.useCaseMetadata?.generatedTables).toContain(
        params.tableId
      );
    }
  });

  it("should append to existing generatedTables when processing a CSV file", async () => {
    // Create a file with existing useCaseMetadata containing generatedTables
    const existingTableId = "existing-table-id";
    const file = await FileFactory.csv(workspace, null, {
      useCase: "conversation",
      fileName: "test-file-with-existing-tables.csv",
      status: "ready",
      useCaseMetadata: {
        generatedTables: [existingTableId],
        conversationId: "test-conversation-id",
      },
    });

    const space = await SpaceFactory.global(workspace);

    // Create a data source using a transaction
    const datasourceView = await DataSourceViewFactory.folder(workspace, space);

    // Call processAndUpsertToDataSource which internally calls maybeApplyProcessing
    const result = await processAndUpsertToDataSource(
      auth,
      datasourceView.dataSource,
      {
        file,
      }
    );

    // Verify the result
    expect(result.isOk()).toBe(true);

    // Verify upsertTable was called with the right parameters
    expect(upsertTable).toHaveBeenCalledTimes(1);

    // Verify file useCaseMetadata was updated correctly
    if (result.isOk()) {
      const updatedFile = result.value;
      expect(updatedFile.useCaseMetadata).not.toBeNull();

      // Should contain both the existing table ID and the new one
      const generatedTables =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        updatedFile.useCaseMetadata?.generatedTables || [];
      expect(generatedTables).toContain(existingTableId);
      expect(generatedTables).toContain(file.sId);
      expect(generatedTables.length).toBe(2);
    }
  });

  it("should process an Excel file with multiple sheets with conversation usecase", async () => {
    // Create an Excel file
    const file = await FileFactory.create(workspace, null, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: "test-excel-file.xlsx",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: "test-conversation-id",
        generatedTables: [],
      },
    });

    const space = await SpaceFactory.global(workspace);

    // Create a data source using a transaction
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    // Mock getFileContent to return fake content with two sheets

    const fakeExcelContent = `${TABLE_PREFIX}Sheet1
id,name,value
1,Item 1,100
2,Item 2,200
3,Item 3,300
${TABLE_PREFIX}Sheet2
id,category,description
1,Category A,Description for item 1
2,Category B,Description for item 2
3,Category C,Description for item 3`;

    vi.mocked(getFileContent).mockResolvedValue(fakeExcelContent);

    // Call processAndUpsertToDataSource
    const result = await processAndUpsertToDataSource(
      auth,
      dataSourceView.dataSource,
      {
        file,
      }
    );

    // Verify the result
    expect(result.isOk()).toBe(true);

    // Verify getFileContent was called
    expect(getFileContent).toHaveBeenCalledTimes(1);
    expect(getFileContent).toHaveBeenCalledWith(auth, file);

    // Verify processAndStoreFile was called twice (once for each sheet)
    expect(processAndStoreFile).toHaveBeenCalledTimes(2);

    // Verify upsertTable was called twice (once for each sheet)
    expect(upsertTable).toHaveBeenCalledTimes(2);

    // Check the first upsertTable call
    const firstUpsertCall = vi.mocked(upsertTable).mock.calls[0][0];
    expect(firstUpsertCall.params.title).toContain("Sheet1");
    expect(firstUpsertCall.params.tableId).toContain(
      `${file.sId}-${slugify("Sheet1")}`
    );
    expect(firstUpsertCall.params.parentId).toBe(file.sId);
    expect(firstUpsertCall.params.parents).toEqual([
      `${file.sId}-${slugify("Sheet1")}`,
      file.sId,
    ]);
    expect(firstUpsertCall.params.mimeType).toBe("text/csv");

    // Check the second upsertTable call
    const secondUpsertCall = vi.mocked(upsertTable).mock.calls[1][0];
    expect(secondUpsertCall.params.title).toContain("Sheet2");
    expect(secondUpsertCall.params.tableId).toContain(
      `${file.sId}-${slugify("Sheet2")}`
    );
    expect(secondUpsertCall.params.parentId).toBe(file.sId);
    expect(secondUpsertCall.params.parents).toEqual([
      `${file.sId}-${slugify("Sheet2")}`,
      file.sId,
    ]);
    expect(secondUpsertCall.params.mimeType).toBe("text/csv");

    // Verify file useCaseMetadata was updated with both table IDs
    if (result.isOk()) {
      const updatedFile = result.value;
      expect(updatedFile.useCaseMetadata).not.toBeNull();

      const generatedTables =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        updatedFile.useCaseMetadata?.generatedTables || [];
      expect(generatedTables).toContain(`${file.sId}-${slugify("Sheet1")}`);
      expect(generatedTables).toContain(`${file.sId}-${slugify("Sheet2")}`);
      expect(generatedTables.length).toBe(2);
    }
  });

  it("should process an Excel file with multiple sheets with upsert_table usecase", async () => {
    // Create an Excel file
    const file = await FileFactory.create(workspace, null, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: "test-excel-file.xlsx",
      fileSize: 1000,
      status: "ready",
      useCase: "upsert_table",
      useCaseMetadata: {
        generatedTables: [],
      },
    });

    const space = await SpaceFactory.global(workspace);

    // Create a data source using a transaction
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    // Mock getFileContent to return fake content with two sheets

    const fakeExcelContent = `${TABLE_PREFIX}Sheet1
id,name,value
1,Item 1,100
2,Item 2,200
3,Item 3,300
${TABLE_PREFIX}Sheet2
id,category,description
1,Category A,Description for item 1
2,Category B,Description for item 2
3,Category C,Description for item 3`;

    vi.mocked(getFileContent).mockResolvedValue(fakeExcelContent);

    // Call processAndUpsertToDataSource
    const result = await processAndUpsertToDataSource(
      auth,
      dataSourceView.dataSource,
      {
        file,
      }
    );

    // Verify the result
    expect(result.isOk()).toBe(true);

    // Verify getFileContent was called
    expect(getFileContent).toHaveBeenCalledTimes(1);
    expect(getFileContent).toHaveBeenCalledWith(auth, file);

    // Verify processAndStoreFile was called twice (once for each sheet)
    expect(processAndStoreFile).toHaveBeenCalledTimes(2);

    // Verify upsertTable was called twice (once for each sheet)
    expect(upsertTable).toHaveBeenCalledTimes(2);

    // Verify createDataSourceFolder was called once (one for the workbook)
    expect(createDataSourceFolder).toHaveBeenCalledTimes(1);

    // Check the createDataSourceFolder call
    const createDataSourceFolderCall = vi.mocked(createDataSourceFolder).mock
      .calls[0];
    expect(createDataSourceFolderCall[0]).toBe(dataSourceView.dataSource);
    expect(createDataSourceFolderCall[1].title).toBe(file.fileName);
    expect(createDataSourceFolderCall[1].mimeType).toBe(
      INTERNAL_MIME_TYPES.FOLDER.SPREADSHEET
    );

    // Check the first upsertTable call
    const firstUpsertCall = vi.mocked(upsertTable).mock.calls[0][0];
    expect(firstUpsertCall.params.title).toContain("Sheet1");
    expect(firstUpsertCall.params.tableId).toContain(
      `${file.sId}-${slugify("Sheet1")}`
    );
    expect(firstUpsertCall.params.parentId).toBe(file.sId);
    expect(firstUpsertCall.params.parents).toEqual([
      `${file.sId}-${slugify("Sheet1")}`,
      file.sId,
    ]);
    expect(firstUpsertCall.params.mimeType).toBe("text/csv");

    // Check the second upsertTable call
    const secondUpsertCall = vi.mocked(upsertTable).mock.calls[1][0];
    expect(secondUpsertCall.params.title).toContain("Sheet2");
    expect(secondUpsertCall.params.tableId).toContain(
      `${file.sId}-${slugify("Sheet2")}`
    );
    expect(secondUpsertCall.params.parentId).toBe(file.sId);
    expect(secondUpsertCall.params.parents).toEqual([
      `${file.sId}-${slugify("Sheet2")}`,
      file.sId,
    ]);
    expect(secondUpsertCall.params.mimeType).toBe("text/csv");

    // Verify file useCaseMetadata was updated with both table IDs
    if (result.isOk()) {
      const updatedFile = result.value;
      expect(updatedFile.useCaseMetadata).not.toBeNull();

      const generatedTables =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        updatedFile.useCaseMetadata?.generatedTables || [];
      expect(generatedTables).toContain(`${file.sId}-${slugify("Sheet1")}`);
      expect(generatedTables).toContain(`${file.sId}-${slugify("Sheet2")}`);
      expect(generatedTables.length).toBe(2);
    }
  });
});
