import {
  createDataSourceFolder,
  upsertDocument,
  upsertTable,
} from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/processing";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { FileResource } from "@app/lib/resources/file_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { sandboxFunctionContentType, TABLE_PREFIX } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { slugify } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    upsertDocument: vi.fn().mockImplementation(() => {
      return new Ok({
        document: {},
        data_source: {},
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
vi.mock(import("../files/processing"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    processAndStoreFile: vi.fn().mockResolvedValue(undefined),
  };
});

describe("processAndUpsertToDataSource", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let overQuotaFileSizeBytes: number;

  beforeEach(async () => {
    // Create a workspace using WorkspaceFactory
    workspace = await WorkspaceFactory.basic();

    // Derive the over-quota size from the workspace plan so the tests follow
    // along if the document size limit is tweaked.
    const subscription =
      await SubscriptionResource.fetchLastByWorkspace(workspace);
    if (!subscription) {
      throw new Error("Expected the test workspace to have a subscription.");
    }
    overQuotaFileSizeBytes =
      (subscription.getPlan().limits.dataSources.documents.sizeMb + 1) *
      1024 *
      1024;

    // Mock auth
    auth = {
      workspace: () => workspace,
      getNonNullableWorkspace: () => workspace,
    } as unknown as Authenticator;

    // Reset mocks. vi.clearAllMocks() only clears call history, not implementations,
    // so explicitly restore default implementations that some tests override.
    vi.clearAllMocks();
    vi.mocked(getFileContent).mockReset();
    vi.mocked(upsertDocument).mockReset();
    vi.mocked(upsertTable).mockResolvedValue(
      new Ok({ table: { table_id: "test-table-id" } })
    );
  });

  it("should skip all processing for tool_output files with skipDataSourceIndexing", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "offloaded_tool_output.txt",
      fileSize: 1000,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: {
        conversationId: "test-conversation-id",
        hideFromUser: true,
        skipDataSourceIndexing: true,
      },
    });

    const space = await SpaceFactory.global(workspace);
    const datasourceView = await DataSourceViewFactory.folder(workspace, space);

    const result = await processAndUpsertToDataSource(
      auth,
      datasourceView.dataSource,
      { file }
    );

    expect(result.isOk()).toBe(true);
    // No Qdrant indexing should have happened.
    expect(upsertTable).not.toHaveBeenCalled();
    expect(createDataSourceFolder).not.toHaveBeenCalled();
  });

  it("should keep over-quota CSV conversation files without indexing them", async () => {
    const file = await FileFactory.csv(auth, null, {
      fileName: "large-conversation-file.csv",
      fileSize: overQuotaFileSizeBytes,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: "test-conversation-id",
        generatedTables: [],
      },
    });

    const space = await SpaceFactory.global(workspace);
    const datasourceView = await DataSourceViewFactory.folder(workspace, space);

    vi.mocked(upsertTable).mockResolvedValue(
      new Err(new DustError("data_source_quota_error", "File is too large."))
    );

    const result = await processAndUpsertToDataSource(
      auth,
      datasourceView.dataSource,
      { file }
    );

    expect(result.isOk()).toBe(true);

    const updatedFile = await FileResource.fetchById(auth, file.sId);
    expect(updatedFile).not.toBeNull();
    expect(updatedFile?.useCaseMetadata?.conversationId).toBe(
      "test-conversation-id"
    );
    expect(updatedFile?.useCaseMetadata?.skipDataSourceIndexing).toBe(true);
  });

  it("should keep data source quota errors fatal for non-conversation files", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "large-folder-file.txt",
      fileSize: overQuotaFileSizeBytes,
      status: "ready",
      useCase: "folders_document",
    });

    const space = await SpaceFactory.global(workspace);
    const datasourceView = await DataSourceViewFactory.folder(workspace, space);

    vi.mocked(getFileContent).mockResolvedValue("large text content");
    vi.mocked(upsertDocument).mockResolvedValue(
      new Err(new DustError("data_source_quota_error", "File is too large."))
    );

    const result = await processAndUpsertToDataSource(
      auth,
      datasourceView.dataSource,
      { file }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("data_source_quota_error");
    }
  });

  it("should keep unrelated conversation indexing errors fatal", async () => {
    const file = await FileFactory.csv(auth, null, {
      fileName: "conversation-file.csv",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: "test-conversation-id",
        generatedTables: [],
      },
    });

    const space = await SpaceFactory.global(workspace);
    const datasourceView = await DataSourceViewFactory.folder(workspace, space);

    vi.mocked(upsertTable).mockResolvedValue(
      new Err(
        new DustError("invalid_request_error", "Missing embedding API key.")
      )
    );

    const result = await processAndUpsertToDataSource(
      auth,
      datasourceView.dataSource,
      { file }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_request_error");
    }
  });

  it("should reject non-tabular files for conversation use case", async () => {
    const nonTabularTypes = [
      { contentType: "text/plain" as const, fileName: "notes.txt" },
      {
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const,
        fileName: "slides.pptx",
      },
      { contentType: "application/pdf" as const, fileName: "doc.pdf" },
    ];

    const space = await SpaceFactory.global(workspace);
    const datasourceView = await DataSourceViewFactory.folder(workspace, space);

    for (const { contentType, fileName } of nonTabularTypes) {
      const file = await FileFactory.create(auth, null, {
        contentType,
        fileName,
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "test-conversation-id" },
      });

      const result = await processAndUpsertToDataSource(
        auth,
        datasourceView.dataSource,
        { file }
      );

      expect(result.isErr(), `${contentType} should not be upsertable`).toBe(
        true
      );
      if (result.isErr()) {
        expect(result.error.code).toBe("invalid_file");
      }
    }
  });

  it("should call upsertTable with the right parameters for a CSV file", async () => {
    // Create a file
    const file = await FileFactory.csv(auth, null, {
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
    const file = await FileFactory.csv(auth, null, {
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
    const file = await FileFactory.create(auth, null, {
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
    const file = await FileFactory.create(auth, null, {
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

describe("isFileTypeUpsertableForUseCase", () => {
  const TABULAR_TYPES = [
    "text/csv",
    "text/comma-separated-values",
    "text/tsv",
    "text/tab-separated-values",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ] as const;

  const NON_TABULAR_TYPES = [
    "text/plain",
    "text/markdown",
    "application/json",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "image/png",
    "audio/mpeg",
  ] as const;

  it("only indexes tabular files for the conversation use case", () => {
    for (const contentType of TABULAR_TYPES) {
      expect(
        isFileTypeUpsertableForUseCase({
          contentType,
          useCase: "conversation",
        }),
        `expected ${contentType} to be upsertable for conversation`
      ).toBe(true);
    }
    for (const contentType of NON_TABULAR_TYPES) {
      expect(
        isFileTypeUpsertableForUseCase({
          contentType,
          useCase: "conversation",
        }),
        `expected ${contentType} to NOT be upsertable for conversation`
      ).toBe(false);
    }
  });

  it("does not index sandbox function files", () => {
    expect(
      isFileTypeUpsertableForUseCase({
        contentType: sandboxFunctionContentType,
        useCase: "project_context",
      })
    ).toBe(false);
  });

  it("indexes plain-text files for non-conversation use cases", () => {
    for (const useCase of [
      "upsert_document",
      "folders_document",
      "tool_output",
      "project_context",
    ] as const) {
      expect(
        isFileTypeUpsertableForUseCase({ contentType: "text/plain", useCase }),
        `expected text/plain to be upsertable for ${useCase}`
      ).toBe(true);
    }
  });

  it("does not index binary office formats for the conversation use case", () => {
    const binaryTypes = [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
    ] as const;

    for (const contentType of binaryTypes) {
      expect(
        isFileTypeUpsertableForUseCase({
          contentType,
          useCase: "conversation",
        }),
        `expected ${contentType} to NOT be upsertable for conversation`
      ).toBe(false);
    }
  });

  it("indexes binary office formats for non-conversation use cases after text extraction", () => {
    const binaryTypes = [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
    ] as const;

    for (const contentType of binaryTypes) {
      for (const useCase of ["upsert_document", "folders_document"] as const) {
        expect(
          isFileTypeUpsertableForUseCase({ contentType, useCase }),
          `expected ${contentType} to be upsertable for ${useCase}`
        ).toBe(true);
      }
    }
  });
});
