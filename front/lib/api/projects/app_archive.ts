import { DustFileSystem } from "@app/lib/api/file_system";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { getFileContent } from "@app/lib/api/files/utils";
import { listPodApps } from "@app/lib/api/projects/apps";
import { createPodFrameFile } from "@app/lib/api/projects/pod_frame_file";
import { reconcileDatabaseFromPodPath } from "@app/lib/api/sandbox_functions/dsbx_db";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { createMountFrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { FileSystemFileEntry } from "@app/types/api/file_system/types";
import type {
  PodAppImportSummary,
  PodAppManifest,
} from "@app/types/api/pod_app_archive";
import {
  MAX_POD_APP_ARCHIVE_ENTRY_COUNT,
  MAX_POD_APP_ARCHIVE_SIZE_BYTES,
  MAX_POD_APP_ARCHIVE_UNCOMPRESSED_BYTES,
  POD_APP_ARCHIVE_FILES_PREFIX,
  POD_APP_ARCHIVE_FORMAT_VERSION,
  POD_APP_ARCHIVE_MANIFEST_FILE,
  PodAppManifestSchema,
} from "@app/types/api/pod_app_archive";
import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
import { isInteractiveContentType } from "@app/types/files";
import {
  MAX_POD_FRAME_TABS,
  normalizeTabsOrder,
} from "@app/types/pod_frame_tab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import AdmZip from "adm-zip";
import { fromError } from "zod-validation-error";

export type PodAppExportErrorCode =
  | "not_a_pod"
  | "not_found"
  | "colliding_folders"
  | "too_large"
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

  // Fail before reading any bytes: an archive this large would only be rejected by
  // `parsePodAppArchive`'s own uncompressed-size guard on import, and buffering it all into a
  // zip here first wastes the memory for nothing.
  const totalSizeBytes = fileEntries.reduce(
    (total, entry) => total + entry.sizeBytes,
    0
  );
  if (totalSizeBytes > MAX_POD_APP_ARCHIVE_UNCOMPRESSED_BYTES) {
    return new Err(
      new PodAppExportError(
        "too_large",
        `'${prefix}' is too large to export: its files total ${totalSizeBytes} bytes, ` +
          `over the ${MAX_POD_APP_ARCHIVE_UNCOMPRESSED_BYTES}-byte limit.`
      )
    );
  }

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

export type PodAppImportErrorCode =
  | "not_a_pod"
  | "invalid_archive"
  | "invalid_name"
  | "name_taken"
  | "sandbox_unavailable"
  | "internal";

export class PodAppImportError extends Error {
  constructor(
    readonly code: PodAppImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PodAppImportError";
  }
}

/** The archive's validated content: the parsed manifest and each file's bytes by relative path. */
type ParsedArchive = {
  manifest: PodAppManifest;
  fileBuffers: Map<string, Buffer>;
};

/**
 * Validate and unpack an archive buffer. Rejects zip-slip entries (`..`, absolute paths,
 * backslashes), entries outside `manifest.json`/`files/`, oversized archives, and manifests that
 * fail schema validation — all before anything touches the pod.
 */
function parsePodAppArchive(
  zipBuffer: Buffer
): Result<ParsedArchive, PodAppImportError> {
  if (zipBuffer.length > MAX_POD_APP_ARCHIVE_SIZE_BYTES) {
    return new Err(
      new PodAppImportError(
        "invalid_archive",
        `Archive exceeds ${MAX_POD_APP_ARCHIVE_SIZE_BYTES} bytes.`
      )
    );
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err) {
    return new Err(
      new PodAppImportError(
        "invalid_archive",
        `Not a readable zip: ${normalizeError(err).message}`
      )
    );
  }

  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (entries.length > MAX_POD_APP_ARCHIVE_ENTRY_COUNT) {
    return new Err(
      new PodAppImportError(
        "invalid_archive",
        `Archive holds more than ${MAX_POD_APP_ARCHIVE_ENTRY_COUNT} files.`
      )
    );
  }

  const totalUncompressedBytes = entries.reduce(
    (total, entry) => total + entry.header.size,
    0
  );
  if (totalUncompressedBytes > MAX_POD_APP_ARCHIVE_UNCOMPRESSED_BYTES) {
    return new Err(
      new PodAppImportError(
        "invalid_archive",
        `Archive expands past ${MAX_POD_APP_ARCHIVE_UNCOMPRESSED_BYTES} bytes.`
      )
    );
  }

  const fileBuffers = new Map<string, Buffer>();
  let manifestBuffer: Buffer | null = null;

  for (const entry of entries) {
    const name = entry.entryName;
    const segments = name.split("/");
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      segments.some((segment) => segment === ".." || segment === "")
    ) {
      return new Err(
        new PodAppImportError("invalid_archive", `Unsafe entry path '${name}'.`)
      );
    }

    if (name === POD_APP_ARCHIVE_MANIFEST_FILE) {
      manifestBuffer = entry.getData();
    } else if (name.startsWith(POD_APP_ARCHIVE_FILES_PREFIX)) {
      fileBuffers.set(
        name.slice(POD_APP_ARCHIVE_FILES_PREFIX.length),
        entry.getData()
      );
    } else {
      return new Err(
        new PodAppImportError(
          "invalid_archive",
          `Unexpected entry '${name}': only manifest.json and files/ are allowed.`
        )
      );
    }
  }

  if (!manifestBuffer) {
    return new Err(
      new PodAppImportError("invalid_archive", "Archive has no manifest.json.")
    );
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestBuffer.toString("utf-8"));
  } catch (err) {
    return new Err(
      new PodAppImportError(
        "invalid_archive",
        `manifest.json is not valid JSON: ${normalizeError(err).message}`
      )
    );
  }

  const validation = PodAppManifestSchema.safeParse(manifestJson);
  if (!validation.success) {
    return new Err(
      new PodAppImportError(
        "invalid_archive",
        fromError(validation.error).toString()
      )
    );
  }

  return new Ok({ manifest: validation.data, fileBuffers });
}

/**
 * Import a Pod app archive into a pod: write its files into a new folder, recreate its Frames
 * through `createPodFrameFile`, re-publish its functions from their new paths (which is what gives
 * them the new folder's prefix and re-derives their schemas), reconcile its databases **empty**
 * from the copied schema files, then publish the Frames that were published at export time.
 *
 * Mirrors `clonePodApp`'s pipeline and ordering with the archive as the source. Failures after the
 * files are written are reported per item (`warnings`/`skipped`) rather than aborting: a partially
 * published app is visible in the Apps tab and fixable, whereas aborting would hide work already
 * done. The exceptions are sandbox unavailability (nothing later can succeed) and file writes
 * themselves. Aborting on `sandbox_unavailable` leaves the partial app (folder, any Frames already
 * created) visible in the Apps tab, same as any other partial failure; because the folder already
 * exists, retrying the same import hits `name_taken` rather than resuming. Recovering means either
 * deleting the partial app first and re-importing, or finishing it in place (publish the remaining
 * functions/databases by hand).
 *
 * The archive carries no source identity, so importing into the origin pod, another pod or another
 * workspace is the same operation. A Frame hard-coding `<podId>/<slug>` function references keeps
 * pointing at the source pod; `publishFrame`'s validation surfaces those as warnings here.
 */
export async function importPodApp(
  auth: Authenticator,
  pod: SpaceResource,
  { zipBuffer, name }: { zipBuffer: Buffer; name?: string }
): Promise<Result<PodAppImportSummary, PodAppImportError>> {
  if (!pod.isProject()) {
    return new Err(
      new PodAppImportError("not_a_pod", "Apps only exist on Pod spaces.")
    );
  }

  const parseResult = parsePodAppArchive(zipBuffer);
  if (parseResult.isErr()) {
    return parseResult;
  }
  const { manifest, fileBuffers } = parseResult.value;

  const folderName = (name ?? manifest.name).trim();
  if (folderName.length > MAX_POD_APP_NAME_LENGTH) {
    return new Err(
      new PodAppImportError(
        "invalid_name",
        `'${folderName}' is longer than ${MAX_POD_APP_NAME_LENGTH} characters.`
      )
    );
  }
  const prefix = normalizeAppPrefix(folderName);
  if (!prefix) {
    return new Err(
      new PodAppImportError(
        "invalid_name",
        `'${folderName}' has no letters or digits to name an app with.`
      )
    );
  }
  if (folderName.includes("/")) {
    return new Err(
      new PodAppImportError("invalid_name", "An app name cannot contain '/'.")
    );
  }

  const appsResult = await listPodApps(auth, pod);
  if (appsResult.isErr()) {
    return new Err(new PodAppImportError("internal", appsResult.error.message));
  }
  if (appsResult.value.some((app) => app.prefix === prefix)) {
    return new Err(
      new PodAppImportError(
        "name_taken",
        `This Pod already has an app named '${prefix}'.`
      )
    );
  }

  const fsResult = await DustFileSystem.forPod(auth, pod);
  if (fsResult.isErr()) {
    return new Err(
      new PodAppImportError("internal", "Failed to initialise file system.")
    );
  }
  const dustFs = fsResult.value;

  const podRoot = `${SCOPED_PREFIX_POD}${pod.sId}`;
  const destFolderPath = `${podRoot}/${folderName}`;

  const warnings: string[] = [];
  const skipped: string[] = [];

  // 1. Plain files. Only paths the manifest declares are written: an undeclared zip entry has no
  // content type and no standing, so it is skipped rather than guessed at.
  const writtenRelPaths = new Set<string>();
  let importedFileCount = 0;
  for (const manifestFile of manifest.files) {
    const buffer = fileBuffers.get(manifestFile.path);
    if (!buffer) {
      skipped.push(`file ${manifestFile.path}`);
      continue;
    }

    const writeResult = await dustFs.write(
      `${destFolderPath}/${manifestFile.path}`,
      buffer,
      manifestFile.contentType
    );
    if (writeResult.isErr()) {
      return new Err(
        new PodAppImportError("internal", writeResult.error.message)
      );
    }
    writtenRelPaths.add(manifestFile.path);
    importedFileCount += 1;
  }

  for (const relPath of fileBuffers.keys()) {
    const declared =
      manifest.files.some((f) => f.path === relPath) ||
      manifest.frames.some((f) => f.fileName === relPath);
    if (!declared) {
      skipped.push(`file ${relPath}`);
    }
  }

  // 2. Frames, recreated so the import owns publishable files rather than bare objects.
  const createdFrames: { fileName: string; file: FileResource }[] = [];
  for (const frame of manifest.frames) {
    const buffer = fileBuffers.get(frame.fileName);
    if (!buffer) {
      skipped.push(`frame ${frame.fileName}`);
      continue;
    }

    const createResult = await createPodFrameFile(auth, {
      space: pod,
      folderName,
      fileName: frame.fileName,
      contentType: frame.contentType,
      content: buffer.toString("utf-8"),
    });
    if (createResult.isErr()) {
      return new Err(
        new PodAppImportError("internal", createResult.error.message)
      );
    }
    createdFrames.push({ fileName: frame.fileName, file: createResult.value });
    importedFileCount += 1;
  }

  // 3. Functions, re-published from their new paths. Same source-name convention as clone: a
  // function's source is the file directly under `functions/` named after it.
  const functionSourceByName = new Map<string, string>();
  for (const relPath of writtenRelPaths) {
    const segments = relPath.split("/");
    if (segments.length !== 2 || segments[0] !== "functions") {
      continue;
    }
    const dotIndex = segments[1].lastIndexOf(".");
    const baseName =
      dotIndex <= 0 ? segments[1] : segments[1].slice(0, dotIndex);
    functionSourceByName.set(baseName, `${destFolderPath}/${relPath}`);
  }

  const publishedFunctionSlugs: string[] = [];
  for (const fn of manifest.functions) {
    const sourcePath = functionSourceByName.get(fn.name);
    if (!sourcePath) {
      skipped.push(`function ${fn.name}`);
      continue;
    }

    const publishResult = await publishSandboxFunction(auth, {
      space: pod,
      slug: fn.name,
      description: fn.description,
      path: sourcePath,
      executionMode: fn.executionMode,
    });
    if (publishResult.isErr()) {
      if (publishResult.error.code === "sandbox_unavailable") {
        return new Err(
          new PodAppImportError(
            "sandbox_unavailable",
            publishResult.error.message
          )
        );
      }
      warnings.push(`Function ${fn.name}: ${publishResult.error.message}`);
      continue;
    }
    publishedFunctionSlugs.push(publishResult.value.slug);
  }

  // 4. Databases, reconciled empty from the copied schema files. Data never travels.
  const reconciledDatabaseNames: string[] = [];
  for (const database of manifest.databases) {
    const schemaRelPath = `databases/${database.name}.db.ts`;
    if (!writtenRelPaths.has(schemaRelPath)) {
      skipped.push(`database ${database.name}`);
      continue;
    }

    const reconcileResult = await reconcileDatabaseFromPodPath(auth, {
      space: pod,
      database: database.name,
      path: `${destFolderPath}/${schemaRelPath}`,
    });
    if (reconcileResult.isErr()) {
      if (reconcileResult.error.code === "sandbox_unavailable") {
        return new Err(
          new PodAppImportError(
            "sandbox_unavailable",
            reconcileResult.error.message
          )
        );
      }
      warnings.push(
        `Database ${database.name}: ${reconcileResult.error.message}`
      );
      continue;
    }
    reconciledDatabaseNames.push(reconcileResult.value.database);
  }

  // 5. Frames that were published at export time are re-published, functions now in place so
  // `publishFrame`'s reference validation checks against them. A failure is the import's built-in
  // diagnostic for references the target cannot satisfy, so it lands in warnings.
  const publishedFrameNames: string[] = [];
  const pinnedTabPaths: string[] = [];
  const frameByFileName = new Map(
    manifest.frames.map((frame) => [frame.fileName, frame])
  );
  for (const created of createdFrames) {
    const frame = frameByFileName.get(created.fileName);
    if (!frame || !frame.wasPublished) {
      continue;
    }

    const publishResult = await publishFrame(auth, {
      file: created.file,
      reader: createMountFrameSourceReader(dustFs, destFolderPath),
      entryRelPath: created.fileName,
      rootScopedPath: destFolderPath,
    });
    if (publishResult.isErr()) {
      warnings.push(
        `Frame ${created.fileName}: ${publishResult.error.message}`
      );
      continue;
    }
    publishedFrameNames.push(created.fileName);

    if (frame.pinnedTab) {
      const framePath = `${destFolderPath}/${created.fileName}`;
      const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
      const currentTabs = metadata?.frameTabs ?? [];
      if (!metadata || currentTabs.length >= MAX_POD_FRAME_TABS) {
        warnings.push(
          `Frame ${created.fileName}: not pinned as a tab (the Pod already has ${MAX_POD_FRAME_TABS}).`
        );
        continue;
      }
      const frameTabs = [
        ...currentTabs,
        {
          path: framePath,
          title: frame.pinnedTab.title,
          icon: frame.pinnedTab.icon,
        },
      ];
      await metadata.updateFrameTabs(
        frameTabs,
        normalizeTabsOrder(
          [...(metadata.tabsOrder ?? []), framePath],
          frameTabs.map((tab) => tab.path)
        )
      );
      pinnedTabPaths.push(framePath);
    }
  }

  return new Ok({
    prefix,
    name: folderName,
    importedFileCount,
    createdFrameNames: createdFrames.map((frame) => frame.fileName),
    publishedFunctionSlugs,
    reconciledDatabaseNames,
    publishedFrameNames,
    pinnedTabPaths,
    warnings,
    skipped,
  });
}
