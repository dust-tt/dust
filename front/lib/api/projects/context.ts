import type { UpsertDocumentArgs } from "@app/lib/api/data_sources";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import { PROJECT_CONTEXT_FOLDER_ID } from "@app/lib/api/projects/constants";
import { fetchProjectDataSource } from "@app/lib/api/projects/data_sources";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

function validateFileMetadataForProjectContext(
  file: FileResource
): Result<string, Error> {
  const spaceId = file.useCaseMetadata?.spaceId;
  if (!spaceId) {
    return new Err(new Error("Field spaceId is missing from metadata"));
  }

  return new Ok(spaceId);
}

export async function getProjectDataSourceFromFile(
  auth: Authenticator,
  file: FileResource
): Promise<
  Result<
    DataSourceResource,
    DustError<
      "space_not_found" | "invalid_request_error" | "data_source_not_found"
    >
  >
> {
  // Note: this assume that if we don't have useCaseMetadata, the file is fine.
  const metadataResult = validateFileMetadataForProjectContext(file);
  if (metadataResult.isErr()) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: metadataResult.error.message,
    });
  }

  const space = await SpaceResource.fetchById(auth, metadataResult.value);
  if (!space) {
    return new Err({
      name: "dust_error",
      code: "space_not_found",
      message: `Failed to fetch space.`,
    });
  }

  const r = await fetchProjectDataSource(auth, space);
  if (r.isErr()) {
    return new Err(r.error);
  }

  return new Ok(r.value);
}

export async function upsertProjectContextFile(
  auth: Authenticator,
  file: FileResource
): Promise<Result<FileResource, DustError>> {
  const projectContextDatasource = await getProjectDataSourceFromFile(
    auth,
    file
  );
  if (projectContextDatasource.isErr()) {
    return new Err(projectContextDatasource.error);
  }

  const upsertArgs: UpsertDocumentArgs = {
    parent_id: PROJECT_CONTEXT_FOLDER_ID,
    parents: [file.sId, PROJECT_CONTEXT_FOLDER_ID],
    document_id: file.sId,
    dataSource: projectContextDatasource.value,
    auth,
    mime_type: file.contentType,
    title: file.fileName,
  };
  const rUpsert = await processAndUpsertToDataSource(
    auth,
    projectContextDatasource.value,
    { file, upsertArgs }
  );

  return rUpsert;
}
