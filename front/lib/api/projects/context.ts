import type {
  UpsertDocumentArgs,
  UpsertTableArgs,
} from "@app/lib/api/data_sources";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import { PROJECT_CONTEXT_FOLDER_ID } from "@app/lib/api/projects/constants";
import { fetchProjectDataSource } from "@app/lib/api/projects/data_sources";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { isSupportedDelimitedTextContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import { slugify } from "@app/types/shared/utils/string_utils";

export async function listProjectContentFragments(
  auth: Authenticator,
  space: SpaceResource
): Promise<ContentFragmentResource[]> {
  return ContentFragmentResource.listBySpace(auth, space);
}

/**
 * Project context files for a space from latest file-backed `content_fragments`
 * rows (`spaceId`), in fragment order (`createdAt` DESC).
 */
export async function listProjectContextFiles(
  auth: Authenticator,
  space: SpaceResource
): Promise<FileResource[]> {
  const fragments = await ContentFragmentResource.listBySpace(auth, space);
  const fileModelIds = removeNulls(fragments.map((fr) => fr.fileId));

  const filesByModelId = new Map<number, FileResource>();
  if (fileModelIds.length > 0) {
    const fetched = await FileResource.fetchByModelIdsWithAuth(
      auth,
      fileModelIds
    );
    for (const f of fetched) {
      filesByModelId.set(f.id, f);
    }
  }

  const files: FileResource[] = [];
  const seenSIds = new Set<string>();

  for (const fr of fragments) {
    if (fr.fileId == null) {
      continue;
    }
    const file = filesByModelId.get(fr.fileId);
    if (!file || seenSIds.has(file.sId)) {
      continue;
    }
    seenSIds.add(file.sId);
    files.push(file);
  }

  return files;
}

/**
 * Indexes a project context file in the project data source (when possible) and
 * ensures a latest `content_fragments` row for the file. Core upsert failures
 * are logged and do not block the content fragment sync (file may still be used raw).
 *
 * On success, returns the latest project `ContentFragmentResource` for that file.
 */
export async function addFileToProject(
  auth: Authenticator,
  {
    file,
    space,
    sourceConversationId,
  }: {
    file: FileResource;
    space: SpaceResource;
    sourceConversationId?: string;
  }
): Promise<Result<ContentFragmentResource, DustError>> {
  if (space.kind !== "project") {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "Space is not a project.",
    });
  }

  await file.updateUseCase(auth, "project_context", {
    spaceId: space.sId,
    conversationId: undefined,
    sourceConversationId,
  });

  const projectContextDatasource = await fetchProjectDataSource(auth, space);
  if (projectContextDatasource.isErr()) {
    return new Err(projectContextDatasource.error);
  }

  let upsertArgs: UpsertDocumentArgs | UpsertTableArgs;

  const commonArgs = {
    title: file.fileName,
    parents: [file.sId, PROJECT_CONTEXT_FOLDER_ID],
  };

  if (isSupportedDelimitedTextContentType(file.contentType)) {
    upsertArgs = {
      parentId: PROJECT_CONTEXT_FOLDER_ID,
      tableId: file.sId,
      name: slugify(file.fileName),
      description: `Project context: ${file.fileName}`,
      truncate: true,
      mimeType: file.contentType,
      ...commonArgs,
    };
  } else {
    upsertArgs = {
      parent_id: PROJECT_CONTEXT_FOLDER_ID,
      document_id: file.sId,
      dataSource: projectContextDatasource.value,
      auth,
      mime_type: file.contentType,
      ...commonArgs,
    };
  }

  const rUpsert = await processAndUpsertToDataSource(
    auth,
    projectContextDatasource.value,
    { file, upsertArgs }
  );

  if (rUpsert.isErr()) {
    logger.warn(
      {
        workspaceId: auth.workspace()?.sId,
        fileId: file.sId,
        error: rUpsert.error,
      },
      "Project context Core upsert failed; file may still be used raw. Syncing content fragment."
    );
  }

  const fragmentRes =
    await ContentFragmentResource.upsertLatestProjectFileFragment(
      auth,
      space,
      file
    );
  if (fragmentRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: fragmentRes.error.message,
    });
  }

  return new Ok(fragmentRes.value);
}
