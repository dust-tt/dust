import {
  isDustMimeType,
  isSupportedPlainTextContentType,
} from "@dust-tt/client";

import type {
  UpsertDocumentArgs,
  UpsertTableArgs,
} from "@app/lib/api/data_sources";
import {
  isUpsertTableArgs,
  upsertDocument,
  upsertTable,
} from "@app/lib/api/data_sources";
import { generateSnippet } from "@app/lib/api/files/snippet";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type {
  CoreAPIDataSourceDocumentSection,
  FileUseCase,
  Result,
  SupportedFileContentType,
} from "@app/types";
import {
  assertNever,
  Err,
  isSupportedImageContentType,
  Ok,
  slugify,
  TABLE_PREFIX,
} from "@app/types";

// Upload to dataSource
const upsertDocumentToDatasource: ProcessingFunction = async (
  auth,
  { file, dataSource, upsertArgs }
) => {
  // Use the file id as the document id to make it easy to track the document back to the file.
  const sourceUrl = file.getPrivateUrl(auth);
  let documentId = file.sId;
  if (upsertArgs && "document_id" in upsertArgs) {
    documentId = upsertArgs.document_id;
  }
  const { title: upsertTitle, ...restArgs } = upsertArgs ?? {};
  const title = upsertTitle ?? file.fileName;
  const content = await getFileContent(auth, file);
  if (!content) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message:
        "There was an error upserting the document: failed to get file content.",
    });
  }

  const upsertDocumentRes = await upsertDocument({
    // Beware, most values here are default values that are overridden by the ...restArgs below.
    document_id: documentId,
    source_url: sourceUrl,
    text: content,
    parents: [documentId],
    tags: [`title:${title}`, `fileId:${file.sId}`, `fileName:${file.fileName}`],
    light_document_output: true,
    dataSource,
    auth,
    mime_type: file.contentType,
    title,

    // Used to override defaults.
    ...restArgs,
  });

  if (upsertDocumentRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: "There was an error upserting the document.",
      data_source_error: upsertDocumentRes.error,
    });
  }

  return new Ok(undefined);
};

// Upload seachable document to dataSource
// We expect the content of the file to be the JSON representation of a CoreAPIDataSourceDocumentSection.
const upsertSectionDocumentToDatasource: ProcessingFunction = async (
  auth,
  { file, dataSource, upsertArgs }
) => {
  // Get the content of the file.
  const content = await getFileContent(auth, file);
  if (!content) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message:
        "There was an error upserting the document: failed to get file content.",
    });
  }

  // Parse the content of the file to get the section.
  let section: CoreAPIDataSourceDocumentSection | null = null;
  try {
    section = JSON.parse(content);
  } catch (e) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: "There was an error upserting the document.",
    });
  }

  const upsertDocumentRes = await upsertDocument({
    auth,
    dataSource,
    title: file.fileName,
    mime_type: file.contentType,
    document_id: file.sId,
    source_url: file.getPrivateUrl(auth),
    parents: [file.sId],
    section,
    tags: [
      `title:${file.fileName}`,
      `fileId:${file.sId}`,
      `fileName:${file.fileName}`,
    ],
    light_document_output: true,
    ...upsertArgs,
  });

  if (upsertDocumentRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: "There was an error upserting the document.",
      data_source_error: upsertDocumentRes.error,
    });
  }

  return new Ok(undefined);
};

const updateUseCaseMetadata = async (
  file: FileResource,
  tableIds: string[]
) => {
  // Note from seb : it would be better to merge useCase and useCaseMetadata to be able to specify what each use case is able to do / requires via typing.
  if (file.useCaseMetadata) {
    await file.setUseCaseMetadata({
      ...file.useCaseMetadata,
      generatedTables: [
        ...(file.useCaseMetadata.generatedTables ?? []),
        ...tableIds,
      ],
    });
  }
};

const upsertTableToDatasource: ProcessingFunction = async (
  auth,
  { file, dataSource, upsertArgs }
) => {
  // Use the file sId as the table id to make it easy to track the table back to the file.
  let tableId = file.sId;
  if (upsertArgs && "tableId" in upsertArgs) {
    tableId = upsertArgs.tableId ?? tableId;
  }
  const { title: upsertTitle, ...restArgs } = upsertArgs ?? {};
  const title = upsertTitle ?? file.fileName;

  const upsertTableRes = await upsertTable({
    auth,
    params: {
      // Beware, most values here are default values that are overridden by the ...restArgs below,
      // including description.
      tableId,
      name: slugify(file.fileName),
      description: "Table uploaded from file",
      truncate: true,
      fileId: file.sId,
      tags: [
        `title:${title}`,
        `fileId:${file.sId}`,
        `fileName:${file.fileName}`,
      ],
      parentId: isUpsertTableArgs(upsertArgs)
        ? upsertArgs?.parentId
        : upsertArgs?.parent_id ?? null,
      parents: upsertArgs?.parents ?? [tableId],
      async: false,
      title,
      mimeType: file.contentType,
      sourceUrl: file.getPrivateUrl(auth),

      // Used to override defaults, for manual file uploads where some fields are user-defined.
      ...restArgs,
    },
    dataSource,
  });

  if (upsertTableRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `There was an error upserting the table. Error: ${upsertTableRes.error.message}`,
      data_source_error: upsertTableRes.error,
    });
  }

  await updateUseCaseMetadata(file, [tableId]);

  return new Ok(undefined);
};

// Excel files are processed in a special way, we need to extract the content of each worksheet and
// upsert it as a separate table. This means we pull the whole content of the file (this is not
// great if the spreadhsheet is massive but we don't really have a choice here) and then split in
// memory and reinstiate sub-files to call upsertTableToDatasource.
const upsertExcelToDatasource: ProcessingFunction = async (
  auth,
  { file, dataSource, upsertArgs }
) => {
  let worksheetName: string | undefined;
  let worksheetContent: string | undefined;

  if (upsertArgs && !isUpsertTableArgs(upsertArgs)) {
    return new Err(new Error("Invalid upsert args"));
  }

  const tableIds: string[] = [];

  const upsertWorksheet = async (
    worksheetName: string,
    worksheetContent: string
  ) => {
    const title = `${file.fileName} ${worksheetName}`;
    const tableId = `${file.sId}-${slugify(worksheetName)}`;
    const upsertTableArgs: UpsertTableArgs = {
      ...upsertArgs,
      title,
      name: slugify(title),
      tableId,
      parentId: file.sId,
      parents: [tableId, file.sId],
      description: "Table uploaded from excel file",
      truncate: true,
      mimeType: "text/csv",
      sourceUrl: null,
    };

    const worksheetFile = await FileResource.makeNew({
      workspaceId: file.workspaceId,
      userId: file.userId,
      contentType: "text/csv",
      fileName: slugify(`${file.fileName} ${worksheetName}`) + ".csv",
      fileSize: Buffer.byteLength(worksheetContent),
      useCase: file.useCase,
      useCaseMetadata: file.useCaseMetadata,
    });

    await processAndStoreFile(auth, {
      file: worksheetFile,
      content: {
        type: "string",
        value: worksheetContent,
      },
    });

    tableIds.push(tableId);

    await upsertTableToDatasource(auth, {
      file: worksheetFile,
      dataSource,
      upsertArgs: upsertTableArgs,
    });
  };

  const content = await getFileContent(auth, file);
  if (!content) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message:
        "There was an error upserting the document: failed to get file content.",
    });
  }

  for (const line of content.split("\n")) {
    if (line.startsWith(TABLE_PREFIX)) {
      if (worksheetName && worksheetContent) {
        // Create a file for each worksheet
        await upsertWorksheet(worksheetName, worksheetContent);
      }
      worksheetName = line.slice(TABLE_PREFIX.length);
      worksheetContent = "";
    } else {
      worksheetContent += line + "\n";
    }
  }

  if (!worksheetName || !worksheetContent) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "Invalid Excel file",
    });
  } else {
    await upsertWorksheet(worksheetName, worksheetContent);
  }

  await updateUseCaseMetadata(file, tableIds);

  return new Ok(undefined);
};

// Processing for datasource upserts.
type ProcessingFunction = (
  auth: Authenticator,
  {
    file,
    dataSource,
  }: {
    file: FileResource;
    dataSource: DataSourceResource;
    upsertArgs?: UpsertDocumentArgs | UpsertTableArgs;
  }
) => Promise<Result<undefined, Error>>;

const getProcessingFunction = ({
  contentType,
  useCase,
}: {
  contentType: SupportedFileContentType;
  useCase: FileUseCase;
}): ProcessingFunction | undefined => {
  if (isSupportedImageContentType(contentType)) {
    return undefined;
  }

  switch (contentType) {
    case "text/csv":
    case "text/comma-separated-values":
    case "text/tsv":
    case "text/tab-separated-values":
      if (
        useCase === "conversation" ||
        useCase === "tool_output" ||
        useCase === "upsert_table"
      ) {
        return upsertTableToDatasource;
      } else if (
        useCase === "upsert_document" ||
        useCase === "folders_document"
      ) {
        return upsertDocumentToDatasource;
      } else {
        return undefined;
      }
    case "application/vnd.dust.section.json":
      if (useCase === "tool_output") {
        return upsertSectionDocumentToDatasource;
      } else {
        return undefined;
      }
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
      if (useCase === "conversation" || useCase === "upsert_table") {
        return upsertExcelToDatasource;
      } else if (
        useCase === "upsert_document" ||
        useCase === "folders_document"
      ) {
        return upsertDocumentToDatasource;
      } else {
        return undefined;
      }
  }

  if (
    isSupportedPlainTextContentType(contentType) &&
    [
      "conversation",
      "tool_output",
      "upsert_document",
      "folders_document",
    ].includes(useCase)
  ) {
    return upsertDocumentToDatasource;
  }

  if (isSupportedPlainTextContentType(contentType)) {
    return undefined;
  }

  // Processing is assumed to be irrelevant for internal mime types.
  if (isDustMimeType(contentType)) {
    return undefined;
  }

  assertNever(contentType);
};

export const isFileTypeUpsertableForUseCase = (arg: {
  contentType: SupportedFileContentType;
  useCase: FileUseCase;
}): boolean => {
  const processingFunction = getProcessingFunction(arg);

  return processingFunction !== undefined;
};

const maybeApplyProcessing: ProcessingFunction = async (
  auth,
  { file, dataSource, upsertArgs }
) => {
  const processing = getProcessingFunction(file);

  if (processing) {
    const startTime = Date.now();
    const res = await processing(auth, {
      file,
      dataSource,
      upsertArgs,
    });
    if (res.isErr()) {
      return res;
    }

    const endTime = Date.now();
    logger.info(
      {
        workspaceId: auth.workspace()?.sId,
        fileId: file.sId,
      },
      `Processing took ${endTime - startTime}ms`
    );
  }

  return new Ok(undefined);
};

export async function processAndUpsertToDataSource(
  auth: Authenticator,
  dataSource: DataSourceResource,
  {
    file,
    upsertArgs,
  }: {
    file: FileResource;
    upsertArgs?: UpsertDocumentArgs | UpsertTableArgs;
  }
): Promise<
  Result<
    FileResource,
    Omit<DustError, "code"> & {
      code:
        | "internal_server_error"
        | "invalid_request_error"
        | "file_too_large"
        | "file_type_not_supported";
    }
  >
> {
  if (file.status !== "ready") {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "File is not ready for post processing.",
    });
  }

  if (!isFileTypeUpsertableForUseCase(file)) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "File is not supported for upsert.",
    });
  }

  // When we upsert a file we don't want to be able to pass section or text in Upsert Args
  // We want to return an Error in the future but we start by logging the error to see if there are
  // places that are using it and need to be updated. first
  if (upsertArgs && ("section" in upsertArgs || "text" in upsertArgs)) {
    logger.error(
      {
        workspaceId: auth.workspace()?.sId,
        fileId: file.sId,
      },
      "We should not pass section or text in Upsert Args anymore when upserting a file."
    );
  }

  const [processingRes, snippetRes] = await Promise.all([
    maybeApplyProcessing(auth, {
      file,
      dataSource,
      upsertArgs,
    }),
    generateSnippet(auth, { file, dataSource }),
  ]);

  if (processingRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to process the file : ${processingRes.error.message}`,
      processingError: processingRes.error,
    });
  }

  if (snippetRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to generate snippet: ${snippetRes.error.message}`,
      snippetError: snippetRes.error,
    });
  }

  // If the snippet is present, it means the file is ready to use for JIT actions.
  await file.setSnippet(snippetRes.value);

  return new Ok(file);
}
