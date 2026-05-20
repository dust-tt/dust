import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  getAttachmentFromContentFragment,
  isContentNodeAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import {
  createGCSMountDirectory,
  deleteGCSMountFile,
  type GCSMountDirectoryEntry,
  moveFile,
  renameGCSMountDirectory,
  renameGCSMountFile,
} from "@app/lib/api/files/gcs_mount/files";
import { moveMountFileWithinScope } from "@app/lib/api/files/mount_file_ops";
import type { ResolveMountFilePathError } from "@app/lib/api/files/mount_path";
import {
  getPodFilesBasePath,
  joinMountRelativePath,
  normalizeMountParentRelativePath,
  validateMountFolderName,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { DustError } from "@app/lib/error";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import type { ContentNodeType } from "@app/types/core/content_node";
import type { ConnectorProvider } from "@app/types/data_source";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op } from "sequelize";

/**
 * Folder internal id under which conversation transcripts are indexed in the dust_project
 * data source (see connectors/dust_project/lib/conversation_formatting.ts).
 */
export function getProjectConversationFolderInternalId(
  dustProjectConnectorId: string,
  spaceId: string
): string {
  return `dust-project-${dustProjectConnectorId}-project-${spaceId}`;
}

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
  const seenIds = new Set<string>();

  for (const fragment of fragments) {
    if (fragment.fileId == null) {
      continue;
    }
    const file = filesByModelId.get(fragment.fileId);
    if (!file || seenIds.has(file.sId)) {
      continue;
    }
    seenIds.add(file.sId);
    files.push(file);
  }

  return files;
}

/**
 * Project context attachments: latest content-node fragments for the space, same item shape
 * as conversation attachments (see GET `.../conversations/[cId]/attachments`). File-backed
 * project files are served separately via the GCS-backed `/spaces/[spaceId]/files` endpoints.
 */
export async function listProjectContextAttachments(
  auth: Authenticator,
  space: SpaceResource
): Promise<ConversationAttachmentType[]> {
  const fragments = await ContentFragmentResource.listBySpace(auth, space);

  const merged = new Map<string, ConversationAttachmentType>();

  for (const fragment of fragments) {
    if (fragment.fileId != null) {
      continue;
    }

    const cf = await ContentFragmentResource.renderToContentFragmentType(
      auth,
      fragment,
      {
        kind: "project_context",
        file: null,
      }
    );
    const attachment = getAttachmentFromContentFragment(cf);
    if (!attachment || !isContentNodeAttachmentType(attachment)) {
      continue;
    }

    const key = attachment.contentFragmentId;
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
  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    Array.from(byView.keys())
  );
  const dataSourceViewById = new Map(
    dataSourceViews.map((dsView) => [dsView.sId, dsView])
  );

  await concurrentExecutor(
    Array.from(byView.entries()),
    async ([dsViewId, nodeIds]) => {
      const dsView = dataSourceViewById.get(dsViewId);
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
      lastUpdatedByViewAndNode.set(dsViewId, m);
    },
    {
      concurrency: 4,
    }
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

export type ProjectKnowledgeFromConnectorItem = {
  contentFragmentId: string;
  nodeId: string;
  nodeType: ContentNodeType;
  nodeDataSourceViewId: string;
  title: string;
  contentType: string;
  sourceUrl: string | null;
  lastUpdatedAt: number | null;
  creator: string | null;
  sourceDataSourceViewSpaceId: string | null;
  sourceDataSourceName: string | null;
  sourceConnectorProvider: ConnectorProvider | null;
};

/**
 * For a project space, return the connector-backed content nodes currently in
 * the project context, enriched with the source data source view's space,
 * display name and connector provider. Used by the poke admin UI.
 */
export async function listProjectKnowledgeFromConnectors(
  auth: Authenticator,
  space: SpaceResource
): Promise<ProjectKnowledgeFromConnectorItem[]> {
  const attachments = await listProjectContextAttachments(auth, space);
  const contentNodes = attachments.filter(isContentNodeAttachmentType);

  const dsvIds = [...new Set(contentNodes.map((a) => a.nodeDataSourceViewId))];

  const dsvById = new Map<
    string,
    {
      spaceId: string;
      dataSourceName: string;
      connectorProvider: ConnectorProvider | null;
    }
  >();
  if (dsvIds.length > 0) {
    const dsvs = await DataSourceViewResource.fetchByIds(auth, dsvIds);
    for (const dsv of dsvs) {
      const json = dsv.toJSON();
      dsvById.set(dsv.sId, {
        spaceId: json.spaceId,
        dataSourceName: getDisplayNameForDataSource(json.dataSource),
        connectorProvider: json.dataSource.connectorProvider,
      });
    }
  }

  return contentNodes.map((a) => {
    const creator = a.creator
      ? `${a.creator.type === "agent" ? "agent: " : ""}${a.creator.name}`
      : null;
    const dsv = dsvById.get(a.nodeDataSourceViewId);
    return {
      contentFragmentId: a.contentFragmentId,
      nodeId: a.nodeId,
      nodeType: a.nodeType,
      nodeDataSourceViewId: a.nodeDataSourceViewId,
      title: a.title,
      contentType: a.contentType,
      sourceUrl: a.sourceUrl,
      lastUpdatedAt: a.lastUpdatedAt ?? null,
      creator,
      sourceDataSourceViewSpaceId: dsv?.spaceId ?? null,
      sourceDataSourceName: dsv?.dataSourceName ?? null,
      sourceConnectorProvider: dsv?.connectorProvider ?? null,
    };
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
  if (!space.isProject()) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "Space is not a project.",
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const projectFilesPrefix = getPodFilesBasePath({
    workspaceId: owner.sId,
    podId: space.sId,
  });

  // Files already mounted under the project prefix only need content-fragment sync.
  const isAlreadyOnProjectMount =
    file.mountFilePath?.startsWith(projectFilesPrefix) ?? false;

  if (!isAlreadyOnProjectMount) {
    if (!file.mountFilePath) {
      return new Err({
        name: "dust_error",
        code: "invalid_request_error",
        message: "File has no mount path and cannot be moved to the project.",
      });
    }

    const destFileName = file.fileName;
    const moveRes = await moveFile(auth, {
      file,
      sourceGcsPath: file.mountFilePath,
      destScope: { useCase: "pod", podId: space.sId },
      destRelativeFilePath: destFileName,
      destFileName,
      destUseCase: "project_context",
      destUseCaseMetadata: {
        spaceId: space.sId,
        ...(sourceConversationId ? { sourceConversationId } : {}),
      },
    });
    if (moveRes.isErr()) {
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: moveRes.error.message,
      });
    }
  }

  // TODO(projects) once the source of truth for the project's files is GCS, we can remove this.
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
  if (!space.isProject()) {
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
 * Create an empty folder in a project GCS mount via a trailing-slash placeholder object.
 */
export async function createProjectFolder(
  auth: Authenticator,
  {
    space,
    folderName,
    parentRelativePath,
  }: {
    space: SpaceResource;
    folderName: string;
    parentRelativePath?: string;
  }
): Promise<Result<GCSMountDirectoryEntry, Error>> {
  if (!space.isProject()) {
    return new Err(new Error("Space is not a project."));
  }

  const folderNameRes = validateMountFolderName(folderName);
  if (folderNameRes.isErr()) {
    return folderNameRes;
  }

  const parentRes = normalizeMountParentRelativePath(parentRelativePath);
  if (parentRes.isErr()) {
    return parentRes;
  }

  const relativeDirPath = joinMountRelativePath(
    parentRes.value,
    folderNameRes.value
  );

  return createGCSMountDirectory(
    auth,
    { useCase: "pod", podId: space.sId },
    { relativeDirPath }
  );
}

/**
 * Move a file within the project GCS mount by its relative path (e.g. into a subfolder).
 * Updates the linked FileResource when one exists at the source path; otherwise GCS only.
 */
export async function moveProjectFile(
  auth: Authenticator,
  {
    space,
    sourcePath,
    destRelativeFilePath,
  }: {
    space: SpaceResource;
    sourcePath: string;
    destRelativeFilePath: string;
  }
): Promise<Result<void, DustError | ResolveMountFilePathError | Error>> {
  if (!space.isProject()) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "Space is not a project.",
    });
  }

  return moveMountFileWithinScope(
    auth,
    { useCase: "pod", podId: space.sId },
    { sourcePath, destRelativeFilePath }
  );
}

/**
 * Rename a project file by its relative path.
 *
 * Renames the GCS object and, if a FileResource is linked to the path, updates
 * its fileName and mountFilePath to stay in sync.
 */
export async function renameProjectFile(
  auth: Authenticator,
  {
    space,
    relativeFilePath,
    newFileName,
  }: {
    space: SpaceResource;
    relativeFilePath: string;
    newFileName: string;
  }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const normalized = relativeFilePath.replace(/^\/+|\/+$/g, "");
  const mountBasePath = getPodFilesBasePath({
    workspaceId: owner.sId,
    podId: space.sId,
  });
  const dirPrefix = `${mountBasePath}${normalized}/`;

  const bucket = getPrivateUploadBucket();
  const [dirPlaceholderExists] = await bucket.file(dirPrefix).exists();
  const { files: dirContents } = await bucket.getAllFilesByPrefix({
    prefix: dirPrefix,
  });
  const isDirectoryRename =
    dirPlaceholderExists || dirContents.some((f) => !f.name.endsWith("/"));

  if (isDirectoryRename) {
    const folderNameRes = validateMountFolderName(newFileName);
    if (folderNameRes.isErr()) {
      return folderNameRes;
    }

    const mountPaths = dirContents
      .filter((f) => !f.name.endsWith("/"))
      .map((f) => f.name);
    const fileResources = await FileResource.fetchByMountFilePaths(
      auth,
      mountPaths
    );

    const renameResult = await renameGCSMountDirectory(
      auth,
      { useCase: "pod", podId: space.sId },
      {
        relativeDirPath: normalized,
        newFolderName: folderNameRes.value,
      }
    );
    if (renameResult.isErr()) {
      return renameResult;
    }

    const oldDirMountPrefix = `${mountBasePath}${normalized}/`;
    const newDirMountPrefix = `${mountBasePath}${renameResult.value.newRelativeDirPath}/`;
    for (const file of fileResources) {
      if (!file.mountFilePath?.startsWith(oldDirMountPrefix)) {
        continue;
      }
      const newMountPath = file.mountFilePath.replace(
        oldDirMountPrefix,
        newDirMountPrefix
      );
      await file.renameMountFile(file.fileName, newMountPath);
    }

    return new Ok(undefined);
  }

   // Look up the linked FileResource by either the new `pods/` form or the old
  // `projects/` form, since old DB rows are not yet backfilled.
  const podsPrefix = getPodFilesBasePath({
    workspaceId: owner.sId,
    podId: space.sId,
  });
  const podsGcsPath = `${podsPrefix}${normalized}`;
  const legacyGcsPath = podsGcsPath.replace("/pods/", "/projects/");


  const fileResources = await FileResource.fetchByMountFilePaths(auth, [
    podsGcsPath,
    legacyGcsPath,
  ]);

  const renameResult = await renameGCSMountFile(
    auth,
    { useCase: "pod", podId: space.sId },
    { relativeFilePath: normalized, newFileName }
  );
  if (renameResult.isErr()) {
    return renameResult;
  }

  if (fileResources.length > 0) {
    await fileResources[0].renameMountFile(
      newFileName,
      renameResult.value.newGcsPath
    );
  }

  return new Ok(undefined);
}

/**
 * Delete a project file by its relative path.
 *
 * When a FileResource is linked to the path (user-uploaded files), delegates to
 * removeFileFromProject which handles ContentFragment cleanup and Core artifact removal.
 * For path-only files (agent-created, no FileResource), delegates to the GCS primitive.
 */
export async function deleteProjectFile(
  auth: Authenticator,
  {
    space,
    relativeFilePath,
  }: {
    space: SpaceResource;
    relativeFilePath: string;
  }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const normalized = relativeFilePath.replace(/^\/+|\/+$/g, "");
  const mountBasePath = getPodFilesBasePath({
    workspaceId: owner.sId,
    podId: space.sId,
  });
  const gcsPath = `${mountBasePath}${normalized}`;
  const dirPrefix = `${mountBasePath}${normalized}/`;

  const bucket = getPrivateUploadBucket();
  const [fileExists] = await bucket.file(gcsPath).exists();

  if (!fileExists) {
    const [dirPlaceholderExists] = await bucket.file(dirPrefix).exists();
    const { files: dirContents } = await bucket.getAllFilesByPrefix({
      prefix: dirPrefix,
      pageSize: 200,
    });
    const isDirectoryDelete =
      dirPlaceholderExists || dirContents.some((f) => !f.name.endsWith("/"));

    if (isDirectoryDelete) {
      const mountPaths = dirContents
        .filter((f) => !f.name.endsWith("/"))
        .map((f) => f.name);
      const fileResources = await FileResource.fetchByMountFilePaths(
        auth,
        mountPaths
      );
      for (const file of fileResources) {
        const result = await removeFileFromProject(auth, {
          space,
          fileId: file.sId,
        });
        if (result.isErr()) {
          return result;
        }
      }

      return deleteGCSMountFile(
        auth,
        { useCase: "pod", podId: space.sId },
        { relativeFilePath: normalized }
      );
    }
  }

  const podsGcsPath = `${mountBasePath}${normalized}`;
  const legacyGcsPath = podsGcsPath.replace("/pods/", "/projects/");
  

  const fileResources = await FileResource.fetchByMountFilePaths(auth, [
    podsGcsPath,
    legacyGcsPath,
  ]);
  if (fileResources.length > 0) {
    return removeFileFromProject(auth, {
      space,
      fileId: fileResources[0].sId,
    });
  }

  return deleteGCSMountFile(
    auth,
    { useCase: "pod", podId: space.sId },
    { relativeFilePath: normalized }
  );
}

/**
 * Removes a project-context content node reference from a project space.
 *
 * - Deletes associated ContentFragmentModel rows for this (space,nodeId,nodeDataSourceViewId)
 *   tuple when they are not referenced by any conversation message.
 * - If some fragments are referenced by messages, we keep them but detach them from the space
 *   and mark them expired so conversation rendering can display an appropriate placeholder.
 */
export async function removeContentNodesFromProject(
  auth: Authenticator,
  {
    space,
    nodes,
  }: {
    space: SpaceResource;
    nodes: Array<{
      nodeId: string;
      nodeDataSourceViewId: string; // data source view sId
    }>;
  }
): Promise<Result<void, Error>> {
  if (nodes.length === 0) {
    return new Ok(undefined);
  }

  const workspaceId = auth.getNonNullableWorkspace().id;

  const uniqueDataSourceViewIds = Array.from(
    new Set(nodes.map((n) => n.nodeDataSourceViewId))
  );
  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    uniqueDataSourceViewIds
  );
  const dataSourceViewModelIdById = new Map(
    dataSourceViews.map((dsv) => [dsv.sId, dsv.id])
  );

  const pairs = nodes.flatMap((n) => {
    const dsvModelId = dataSourceViewModelIdById.get(n.nodeDataSourceViewId);
    return dsvModelId !== undefined
      ? [{ nodeId: n.nodeId, nodeDataSourceViewModelId: dsvModelId }]
      : [];
  });
  if (pairs.length === 0) {
    return new Ok(undefined);
  }

  const projectFragmentModelIds = await ContentFragmentModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId,
      spaceId: space.id,
      fileId: null,
      [Op.or]: pairs.map((p) => ({
        nodeId: p.nodeId,
        nodeDataSourceViewId: p.nodeDataSourceViewModelId,
      })),
    },
  }).then((rows) => rows.map((r) => r.id));

  if (projectFragmentModelIds.length === 0) {
    return new Ok(undefined);
  }

  const messagesReferencing = await MessageModel.findAll({
    attributes: ["contentFragmentId"],
    where: {
      workspaceId,
      contentFragmentId: { [Op.in]: projectFragmentModelIds },
    },
  });

  const referencedModelIds = new Set(
    removeNulls(messagesReferencing.map((m) => m.contentFragmentId))
  );
  const orphanIds = projectFragmentModelIds.filter(
    (id) => !referencedModelIds.has(id)
  );

  if (orphanIds.length > 0) {
    await ContentFragmentModel.destroy({
      where: { workspaceId, id: { [Op.in]: orphanIds } },
    });
  }

  if (referencedModelIds.size > 0) {
    await ContentFragmentModel.update(
      { spaceId: null },
      {
        where: {
          workspaceId,
          id: { [Op.in]: Array.from(referencedModelIds) },
        },
      }
    );
  }

  return new Ok(undefined);
}
