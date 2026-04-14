import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  getAttachmentFromContentFragment,
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import type {
  UpsertDocumentArgs,
  UpsertTableArgs,
} from "@app/lib/api/data_sources";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import { PROJECT_CONTEXT_FOLDER_ID } from "@app/lib/api/projects/constants";
import { fetchProjectDataSource } from "@app/lib/api/projects/data_sources";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import logger from "@app/logger/logger";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import { isSupportedDelimitedTextContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import { slugify } from "@app/types/shared/utils/string_utils";
import { Op } from "sequelize";

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

  for (const fragment of fragments) {
    if (fragment.fileId == null) {
      continue;
    }
    const file = filesByModelId.get(fragment.fileId);
    if (!file || seenSIds.has(file.sId)) {
      continue;
    }
    seenSIds.add(file.sId);
    files.push(file);
  }

  return files;
}

/**
 * Project context attachments: latest file-backed and content-node fragments for the space,
 * same item shape as conversation attachments (see GET `.../conversations/[cId]/attachments`).
 */
export async function listProjectContextAttachments(
  auth: Authenticator,
  space: SpaceResource
): Promise<ConversationAttachmentType[]> {
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

  const merged = new Map<string, ConversationAttachmentType>();

  for (const fragment of fragments) {
    const file =
      fragment.fileId != null
        ? (filesByModelId.get(fragment.fileId) ?? null)
        : null;
    if (fragment.fileId != null && !file) {
      continue;
    }

    const cf = await ContentFragmentResource.renderToContentFragmentType(
      auth,
      fragment,
      {
        kind: "project_context",
        file,
      }
    );
    const attachment = getAttachmentFromContentFragment(cf);
    if (!attachment) {
      continue;
    }

    const key = isFileAttachmentType(attachment)
      ? attachment.fileId
      : attachment.contentFragmentId;
    if (merged.has(key)) {
      continue;
    }
    merged.set(key, { ...attachment, isInProjectContext: true });
  }

  const attachments = Array.from(merged.values());

  // Enrich content-node attachments with the underlying Core node timestamp (last sync / update).
  // We batch by dataSourceView to avoid one Core call per row.
  const contentNodeAttachments = attachments.filter(
    isContentNodeAttachmentType
  );
  if (contentNodeAttachments.length === 0) {
    return attachments;
  }

  const byView = new Map<string, string[]>();
  for (const a of contentNodeAttachments) {
    const ids = byView.get(a.nodeDataSourceViewId) ?? [];
    ids.push(a.nodeId);
    byView.set(a.nodeDataSourceViewId, ids);
  }

  const lastUpdatedByViewAndNode = new Map<
    string,
    Map<string, number | null>
  >();

  await Promise.all(
    Array.from(byView.entries()).map(async ([dsViewSId, nodeIds]) => {
      const dsView = await DataSourceViewResource.fetchById(auth, dsViewSId);
      if (!dsView) {
        return;
      }

      const res = await getContentNodesForDataSourceView(dsView, {
        internalIds: nodeIds,
        viewType: "all",
      });
      if (res.isErr()) {
        return;
      }

      const m = new Map<string, number | null>();
      for (const n of res.value.nodes) {
        m.set(n.internalId, n.lastUpdatedAt);
      }
      lastUpdatedByViewAndNode.set(dsViewSId, m);
    })
  );

  return attachments.map((a) => {
    if (!isContentNodeAttachmentType(a)) {
      return a;
    }
    const ts =
      lastUpdatedByViewAndNode.get(a.nodeDataSourceViewId)?.get(a.nodeId) ??
      null;
    return { ...a, lastUpdatedAt: ts };
  });
}

/**
 * Fetches the latest project-context `ContentFragmentResource` for a given file in a project space.
 * Returns null when the file or fragment cannot be found (or is not in that project context).
 */
export async function fetchLatestProjectContextFileContentFragment(
  auth: Authenticator,
  space: SpaceResource,
  fileId: string // file sId
): Promise<{ file: FileResource; fragment: ContentFragmentResource } | null> {
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return null;
  }

  if (file.useCase !== "project_context") {
    return null;
  }
  if (file.useCaseMetadata?.spaceId !== space.sId) {
    return null;
  }

  const row = await ContentFragmentModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: space.id,
      fileId: file.id,
      version: "latest",
    },
    order: [["createdAt", "DESC"]],
  });

  if (!row) {
    return null;
  }

  return {
    file,
    fragment: new ContentFragmentResource(
      ContentFragmentResource.model,
      row.get()
    ),
  };
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

/**
 * Ensures a latest `content_fragments` row for a content node reference in the project
 * space. Validates node access via Core (same path as conversation content nodes). Does not
 * upsert into the project Core data source (the node remains in its original space/view).
 */
export async function addContentNodeToProject(
  auth: Authenticator,
  {
    contentFragment,
    space,
  }: {
    contentFragment: ContentFragmentInputWithContentNode;
    space: SpaceResource;
  }
): Promise<Result<ContentFragmentResource, DustError>> {
  if (space.kind !== "project") {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "Space is not a project.",
    });
  }

  const blobRes = await getContentFragmentBlob(auth, contentFragment);
  if (blobRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: blobRes.error.message,
    });
  }

  const blob = blobRes.value;
  if (
    blob.fileId !== null ||
    blob.nodeId === null ||
    blob.nodeDataSourceViewId === null ||
    blob.nodeType === null
  ) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Expected content node fragment blob.",
    });
  }

  const fragmentRes =
    await ContentFragmentResource.upsertLatestProjectContentNodeFragment(
      auth,
      space,
      {
        title: blob.title,
        contentType: blob.contentType,
        sourceUrl: blob.sourceUrl,
        textBytes: blob.textBytes,
        nodeId: blob.nodeId,
        nodeDataSourceViewId: blob.nodeDataSourceViewId,
        nodeType: blob.nodeType,
      }
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

/**
 * Removes a project-context file from a project space.
 *
 * - Always deletes the file itself.
 * - Deletes associated ContentFragmentModel rows for this (space,file) pair when they are not
 *   referenced by any conversation message.
 * - If some fragments are referenced by messages, we keep them but detach them from the space
 *   and mark them expired so conversation rendering can display an appropriate placeholder.
 */
export async function removeFileFromProject(
  auth: Authenticator,
  {
    space,
    fileId,
  }: {
    space: SpaceResource;
    fileId: string; // file sId
  }
): Promise<Result<void, Error>> {
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return new Err(new Error("File not found."));
  }

  // Best-effort cleanup of the project content fragments for this file.
  const workspaceId = auth.getNonNullableWorkspace().id;
  const projectFragmentIds = await ContentFragmentModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId,
      spaceId: space.id,
      fileId: file.id,
    },
  }).then((rows) => rows.map((r) => r.id));

  if (projectFragmentIds.length > 0) {
    const messagesReferencing = await MessageModel.findAll({
      attributes: ["contentFragmentId"],
      where: {
        workspaceId,
        contentFragmentId: {
          [Op.in]: projectFragmentIds,
        },
      },
    });

    const referencedIds = new Set(
      removeNulls(messagesReferencing.map((m) => m.contentFragmentId))
    );
    const orphanIds = projectFragmentIds.filter((id) => !referencedIds.has(id));

    if (orphanIds.length > 0) {
      await ContentFragmentModel.destroy({
        where: {
          workspaceId,
          id: { [Op.in]: orphanIds },
        },
      });
    }

    if (referencedIds.size > 0) {
      await ContentFragmentModel.update(
        { spaceId: null, expiredReason: "file_deleted" },
        {
          where: {
            workspaceId,
            id: { [Op.in]: Array.from(referencedIds) },
          },
        }
      );
    }
  }

  const deleteRes = await file.delete(auth);
  if (deleteRes.isErr()) {
    return new Err(deleteRes.error);
  }

  return new Ok(undefined);
}

/**
 * Removes a project-context content node reference from a project space.
 *
 * - Deletes associated ContentFragmentModel rows for this (space,nodeId,nodeDataSourceViewId)
 *   tuple when they are not referenced by any conversation message.
 * - If some fragments are referenced by messages, we keep them but detach them from the space
 *   and mark them expired so conversation rendering can display an appropriate placeholder.
 */
export async function removeContentNodeFromProject(
  auth: Authenticator,
  {
    space,
    nodeId,
    nodeDataSourceViewId,
  }: {
    space: SpaceResource;
    nodeId: string;
    nodeDataSourceViewId: string; // data source view sId
  }
): Promise<Result<void, Error>> {
  const dsView = await DataSourceViewResource.fetchById(
    auth,
    nodeDataSourceViewId
  );
  if (!dsView) {
    return new Err(new Error("Data source view not found."));
  }

  const workspaceId = auth.getNonNullableWorkspace().id;

  const projectFragmentIds = await ContentFragmentModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId,
      spaceId: space.id,
      fileId: null,
      nodeId,
      nodeDataSourceViewId: dsView.id,
    },
  }).then((rows) => rows.map((r) => r.id));

  if (projectFragmentIds.length === 0) {
    return new Ok(undefined);
  }

  const messagesReferencing = await MessageModel.findAll({
    attributes: ["contentFragmentId"],
    where: {
      workspaceId,
      contentFragmentId: {
        [Op.in]: projectFragmentIds,
      },
    },
  });

  const referencedIds = new Set(
    removeNulls(messagesReferencing.map((m) => m.contentFragmentId))
  );
  const orphanIds = projectFragmentIds.filter((id) => !referencedIds.has(id));

  if (orphanIds.length > 0) {
    await ContentFragmentModel.destroy({
      where: {
        workspaceId,
        id: { [Op.in]: orphanIds },
      },
    });
  }

  if (referencedIds.size > 0) {
    await ContentFragmentModel.update(
      { spaceId: null },
      {
        where: {
          workspaceId,
          id: { [Op.in]: Array.from(referencedIds) },
        },
      }
    );
  }

  return new Ok(undefined);
}
