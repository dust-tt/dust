import { DustFileSystem } from "@app/lib/api/file_system";
import { getFileContent } from "@app/lib/api/files/utils";
import { listPodApps } from "@app/lib/api/projects/apps";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { FileSystemFileEntry } from "@app/types/api/file_system/types";
import type { PodAppManifest } from "@app/types/api/pod_app_archive";
import {
  POD_APP_ARCHIVE_FILES_PREFIX,
  POD_APP_ARCHIVE_FORMAT_VERSION,
  POD_APP_ARCHIVE_MANIFEST_FILE,
} from "@app/types/api/pod_app_archive";
import { isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import AdmZip from "adm-zip";

export type PodAppExportErrorCode =
  | "not_a_pod"
  | "not_found"
  | "colliding_folders"
  | "internal";

export class PodAppExportError extends Error {
  constructor(
    readonly code: PodAppExportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PodAppExportError";
  }
}

/**
 * Package a Pod app as a portable zip: the app folder's files verbatim under `files/`, plus a
 * `manifest.json` carrying publish metadata the files cannot (function descriptions and execution
 * modes, Frame publish state and pinned-tab metadata, per-file content types).
 *
 * Reads only GCS and Postgres — like `listPodApps`, exporting never wakes a sleeping pod. Bundles
 * are never exported: an import re-publishes from source, which is also what re-derives input and
 * output schemas.
 *
 * A Frame whose FileResource exists is exported through `getFileContent(_, _, "original")` so the
 * source (not the built bundle) is what travels; a Frame source with no FileResource row yet is
 * exported as a plain file, faithfully preserving its unpublishable state.
 */
export async function exportPodApp(
  auth: Authenticator,
  pod: SpaceResource,
  prefix: string
): Promise<Result<{ fileName: string; content: Buffer }, PodAppExportError>> {
  if (!pod.isProject()) {
    return new Err(
      new PodAppExportError("not_a_pod", "Apps only exist on Pod spaces.")
    );
  }

  const appsResult = await listPodApps(auth, pod);
  if (appsResult.isErr()) {
    return new Err(new PodAppExportError("internal", appsResult.error.message));
  }

  const app = appsResult.value.find((candidate) => candidate.prefix === prefix);
  if (!app || !app.folderPath) {
    return new Err(
      new PodAppExportError("not_found", `No app '${prefix}' in this Pod.`)
    );
  }
  if (app.collidingFolderNames.length > 0) {
    return new Err(
      new PodAppExportError(
        "colliding_folders",
        `Folders ${app.collidingFolderNames.join(", ")} all resolve to '${prefix}'. ` +
          "Rename all but one before exporting."
      )
    );
  }

  const fsResult = await DustFileSystem.forPod(auth, pod);
  if (fsResult.isErr()) {
    return new Err(
      new PodAppExportError("internal", "Failed to initialise file system.")
    );
  }
  const dustFs = fsResult.value;

  const listResult = await dustFs.list(app.folderPath);
  if (listResult.isErr()) {
    return new Err(new PodAppExportError("internal", listResult.error.message));
  }
  const fileEntries: FileSystemFileEntry[] = listResult.value.flatMap(
    (entry) => (entry.isDirectory ? [] : [entry])
  );

  const zip = new AdmZip();
  const manifestFiles: PodAppManifest["files"] = [];

  // Frames with a FileResource are read through it below; everything else is read as bytes. A
  // top-level Frame with no row falls through to this loop on purpose.
  const framePathsWithResource = new Set(
    app.frames.flatMap((frame) => (frame.fileId ? [frame.path] : []))
  );

  for (const entry of fileEntries) {
    if (framePathsWithResource.has(entry.path)) {
      continue;
    }

    const relPath = entry.path.slice(app.folderPath.length + 1);
    const contentResult = await dustFs.readBuffer(entry.path);
    if (contentResult.isErr() || contentResult.value === null) {
      return new Err(
        new PodAppExportError("internal", `Could not read '${relPath}'.`)
      );
    }

    zip.addFile(
      `${POD_APP_ARCHIVE_FILES_PREFIX}${relPath}`,
      contentResult.value
    );
    manifestFiles.push({ path: relPath, contentType: entry.contentType });
  }

  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  const tabByPath = new Map(
    (metadata?.frameTabs ?? []).map((tab) => [tab.path, tab])
  );

  const manifestFrames: PodAppManifest["frames"] = [];
  for (const frame of app.frames) {
    if (!frame.fileId) {
      continue;
    }
    const file = await FileResource.fetchById(auth, frame.fileId);
    if (!file || !isInteractiveContentType(file.contentType)) {
      continue;
    }
    const content = await getFileContent(auth, file, "original");
    if (content === null) {
      return new Err(
        new PodAppExportError(
          "internal",
          `Could not read the source of Frame '${frame.fileName}'.`
        )
      );
    }

    zip.addFile(
      `${POD_APP_ARCHIVE_FILES_PREFIX}${frame.fileName}`,
      Buffer.from(content, "utf-8")
    );
    const pinnedTab = tabByPath.get(frame.path);
    manifestFrames.push({
      fileName: frame.fileName,
      contentType: file.contentType,
      wasPublished: frame.isPublished,
      ...(pinnedTab
        ? { pinnedTab: { title: pinnedTab.title, icon: pinnedTab.icon } }
        : {}),
    });
  }

  const manifest: PodAppManifest = {
    formatVersion: POD_APP_ARCHIVE_FORMAT_VERSION,
    name: app.name,
    exportedAt: new Date().toISOString(),
    files: manifestFiles,
    frames: manifestFrames,
    functions: app.functions.map((fn) => ({
      name: fn.name,
      description: fn.description,
      executionMode: fn.executionMode,
    })),
    databases: app.databases.map((db) => ({ name: db.name })),
  };

  zip.addFile(
    POD_APP_ARCHIVE_MANIFEST_FILE,
    Buffer.from(JSON.stringify(manifest, null, 2), "utf-8")
  );

  return new Ok({
    fileName: `${app.prefix}.podapp.zip`,
    content: zip.toBuffer(),
  });
}
