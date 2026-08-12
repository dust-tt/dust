import { DustFileSystem } from "@app/lib/api/file_system";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { getPodStateBasePath } from "@app/lib/api/files/mount_path";
import { getFileContent } from "@app/lib/api/files/utils";
import { deleteProjectFile } from "@app/lib/api/projects/context";
import { createPodFrameFile } from "@app/lib/api/projects/pod_frame_file";
import { deletePodDatabaseReplica } from "@app/lib/api/sandbox/db";
import {
  appPrefixFromPodDatabaseName,
  podDatabaseNameWithoutAppPrefix,
} from "@app/lib/api/sandbox_functions/db_naming";
import {
  deleteDatabaseOnSandbox,
  reconcileDatabaseFromPodPath,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { SANDBOX_FUNCTION_SLUG_SEPARATOR } from "@app/lib/api/sandbox_functions/slug";
import { unpublishSandboxFunction } from "@app/lib/api/sandbox_functions/unpublish_sandbox_function";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  FileSystemEntry,
  FileSystemFileEntry,
} from "@app/types/api/file_system/types";
import type {
  PodApp,
  PodAppDatabase,
  PodAppFrame,
  PodAppFunction,
} from "@app/types/api/pod_apps";
import { UNFILED_POD_APP_PREFIX } from "@app/types/api/pod_apps";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
import { isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

/** A litestream replica directory is named after the database file it replicates. */
const POD_DATABASE_FILE_SUFFIX = ".db";

/** The app subfolder holding one drizzle schema file per database. */
const APP_DATABASES_SUBFOLDER = "databases";

/** The app subfolder holding one source file per published function. */
const APP_FUNCTIONS_SUBFOLDER = "functions";

/** Subfolders whose presence marks a pod-root folder as app-shaped. */
const APP_SHAPED_SUBFOLDERS = [
  APP_FUNCTIONS_SUBFOLDER,
  APP_DATABASES_SUBFOLDER,
];

/** Suffix of a database's schema file, e.g. `chat.db.ts` declares the `chat` database. */
const POD_DATABASE_SCHEMA_FILE_SUFFIX = ".db.ts";

/**
 * A folder's accumulated file-system facts, before published functions and databases are joined in.
 */
type AppFolder = {
  name: string;
  path: string;
  fileCount: number;
  frameEntries: FileSystemFileEntry[];
  hasAppShapedSubfolder: boolean;
  /**
   * App-relative names of the databases this folder declares, one per `databases/{name}.db.ts`. Used
   * to attribute databases whose on-disk name carries no app prefix.
   */
  declaredDatabaseNames: Set<string>;
};

/** Drop the last extension from a file name, e.g. `add-task.ts` -> `add-task`. */
function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");

  return dotIndex <= 0 ? fileName : fileName.slice(0, dotIndex);
}

/**
 * Path segments of a pod entry relative to the pod root, e.g. `MyApp/functions/list-notes.ts` for
 * `pod-{podId}/MyApp/functions/list-notes.ts`.
 */
function relativeSegments(entry: FileSystemEntry, podRoot: string): string[] {
  if (!entry.path.startsWith(`${podRoot}/`)) {
    return [];
  }

  return entry.path
    .slice(podRoot.length + 1)
    .split("/")
    .filter((segment) => segment.length > 0);
}

/**
 * Group a pod's recursive file listing by the folder each entry sits in at the pod root. Entries
 * directly at the root belong to no app, so they are skipped: anything published from there surfaces
 * under the unfiled app instead.
 */
function collectAppFolders(
  entries: FileSystemEntry[],
  podRoot: string
): Map<string, AppFolder> {
  const folders = new Map<string, AppFolder>();

  const folderFor = (name: string): AppFolder => {
    const existing = folders.get(name);
    if (existing) {
      return existing;
    }

    const folder: AppFolder = {
      name,
      path: `${podRoot}/${name}`,
      fileCount: 0,
      frameEntries: [],
      hasAppShapedSubfolder: false,
      declaredDatabaseNames: new Set(),
    };
    folders.set(name, folder);

    return folder;
  };

  for (const entry of entries) {
    const segments = relativeSegments(entry, podRoot);
    if (segments.length === 0) {
      continue;
    }

    if (entry.isDirectory) {
      // A folder placeholder at the root is a candidate app even while empty.
      if (segments.length === 1) {
        folderFor(segments[0]);
      } else if (
        segments.length === 2 &&
        APP_SHAPED_SUBFOLDERS.includes(segments[1])
      ) {
        folderFor(segments[0]).hasAppShapedSubfolder = true;
      }
      continue;
    }

    // Files directly at the pod root belong to no app folder.
    if (segments.length === 1) {
      continue;
    }

    const folder = folderFor(segments[0]);
    folder.fileCount += 1;

    // A file inside an app subfolder implies that subfolder, whether or not GCS holds a placeholder
    // object for it.
    if (APP_SHAPED_SUBFOLDERS.includes(segments[1])) {
      folder.hasAppShapedSubfolder = true;
    }

    // Only a Frame at the top of the app folder is the app's own Frame; anything deeper is a detail
    // of how the app is laid out.
    if (segments.length === 2 && isInteractiveContentType(entry.contentType)) {
      folder.frameEntries.push(entry);
    }

    if (
      segments.length === 3 &&
      segments[1] === APP_DATABASES_SUBFOLDER &&
      entry.fileName.endsWith(POD_DATABASE_SCHEMA_FILE_SUFFIX)
    ) {
      folder.declaredDatabaseNames.add(
        entry.fileName.slice(
          0,
          entry.fileName.length - POD_DATABASE_SCHEMA_FILE_SUFFIX.length
        )
      );
    }
  }

  return folders;
}

/**
 * Resolve the Frame entries of every app folder to their FileResource, in one query, so each Frame
 * can report its sId and whether it has been published.
 */
async function resolveFramesByFolderName(
  auth: Authenticator,
  dustFs: DustFileSystem,
  folders: AppFolder[],
  pinnedFramePaths: Set<string>
): Promise<Map<string, PodAppFrame[]>> {
  const mountPathByEntryPath = new Map<string, string>();
  for (const folder of folders) {
    for (const entry of folder.frameEntries) {
      const mountPath = dustFs.toMountFilePath(entry.path);
      if (mountPath) {
        mountPathByEntryPath.set(entry.path, mountPath);
      }
    }
  }

  const files = await FileResource.fetchByMountFilePaths(
    auth,
    Array.from(mountPathByEntryPath.values())
  );
  const fileByMountPath = new Map(
    files.flatMap((file) =>
      file.mountFilePath ? [[file.mountFilePath, file] as const] : []
    )
  );

  const framesByFolderName = new Map<string, PodAppFrame[]>();
  for (const folder of folders) {
    framesByFolderName.set(
      folder.name,
      folder.frameEntries.map((entry) => {
        const mountPath = mountPathByEntryPath.get(entry.path);
        const file = mountPath ? fileByMountPath.get(mountPath) : undefined;

        return {
          fileId: file?.sId ?? null,
          fileName: entry.fileName,
          path: entry.path,
          isPublished: file?.isPublishedFrame() ?? false,
          isPinnedAsTab: pinnedFramePaths.has(entry.path),
        };
      })
    );
  }

  return framesByFolderName;
}

/**
 * The pod's database names as they exist on disk. Read from the litestream replica prefix in GCS
 * rather than from the sandbox, so listing apps never has to wake a sleeping pod. A database created
 * seconds ago may not be replicated yet.
 */
async function listPodDatabaseOnDiskNames(
  auth: Authenticator,
  pod: SpaceResource
): Promise<string[]> {
  const replicaNames = await getPrivateUploadBucket().listSubdirectoryNames({
    prefix: getPodStateBasePath({
      workspaceId: auth.getNonNullableWorkspace().sId,
      podId: pod.sId,
    }),
  });

  // A replica directory is named after the database FILE it replicates, so drop the `.db`.
  return replicaNames
    .filter((name) => name.endsWith(POD_DATABASE_FILE_SUFFIX))
    .map((name) =>
      name.slice(0, name.length - POD_DATABASE_FILE_SUFFIX.length)
    );
}

/**
 * Group the pod's databases by the app prefix that owns each one.
 *
 * A namespaced database carries its app in its filename, so its prefix decides. A database created
 * before app namespacing has a bare filename instead, and the only remaining evidence of ownership is
 * the schema file that declares it — `<AppName>/databases/{name}.db.ts`. This mirrors how
 * `resolvePodDatabaseName` resolves the same case at reconcile time, so the tab attributes a legacy
 * database to exactly the app that keeps writing to it.
 *
 * Two apps declaring the same bare name genuinely share that one database (the transitional case
 * `resolvePodDatabaseName` documents), so it is reported under both rather than arbitrarily assigned.
 * A bare database no app declares falls back to the unfiled app.
 */
function groupDatabasesByAppPrefix(
  onDiskNames: string[],
  foldersByPrefix: Map<string, AppFolder[]>
): Map<string, PodAppDatabase[]> {
  const byPrefix = new Map<string, PodAppDatabase[]>();

  const attribute = (prefix: string, database: PodAppDatabase) => {
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), database]);
  };

  for (const onDiskName of onDiskNames) {
    const database = {
      name: podDatabaseNameWithoutAppPrefix(onDiskName),
      onDiskName,
    };

    const prefixFromName = appPrefixFromPodDatabaseName(onDiskName);
    if (prefixFromName !== null) {
      attribute(prefixFromName, database);
      continue;
    }

    const declaringPrefixes = [...foldersByPrefix].filter(([, folders]) =>
      folders.some((folder) => folder.declaredDatabaseNames.has(onDiskName))
    );
    if (declaringPrefixes.length === 0) {
      attribute(UNFILED_POD_APP_PREFIX, database);
      continue;
    }

    for (const [prefix] of declaringPrefixes) {
      attribute(prefix, database);
    }
  }

  return byPrefix;
}

/** The pod's published functions, grouped by the app prefix each one's slug carries. */
function groupFunctionsByAppPrefix(
  sandboxFunctions: SandboxFunctionResource[]
): Map<string, PodAppFunction[]> {
  const byPrefix = new Map<string, PodAppFunction[]>();

  for (const sandboxFunction of sandboxFunctions) {
    const separatorIndex = sandboxFunction.slug.indexOf(
      SANDBOX_FUNCTION_SLUG_SEPARATOR
    );
    const prefix =
      separatorIndex > 0
        ? sandboxFunction.slug.slice(0, separatorIndex)
        : UNFILED_POD_APP_PREFIX;

    byPrefix.set(prefix, [
      ...(byPrefix.get(prefix) ?? []),
      sandboxFunction.toPodAppJSON(),
    ]);
  }

  return byPrefix;
}

/**
 * List a Pod's apps.
 *
 * An app is not a stored record: it is a folder at the pod root, identified by the app prefix
 * `deriveAppPrefix` derives from its name — the very prefix that already namespaces the app's
 * published function slugs and database filenames. This assembles that view from three sources (the
 * pod's files, its published functions, its replicated databases) and joins them on that prefix, so
 * it stays consistent with what publish and reconcile do by construction.
 *
 * A folder qualifies as an app when it holds a `functions/` or `databases/` subfolder, or a Frame at
 * its top, or any published function or database under its prefix. A prefix that owns published
 * artifacts but has no folder left is still listed, since those artifacts are live and would
 * otherwise be invisible; so is anything published from the pod root, gathered into a synthetic
 * unfiled app.
 */
export async function listPodApps(
  auth: Authenticator,
  pod: SpaceResource
): Promise<Result<PodApp[], Error>> {
  if (!pod.isProject()) {
    return new Err(new Error("Apps are only available for Pod spaces."));
  }

  const fsResult = await DustFileSystem.forPod(auth, pod);
  if (fsResult.isErr()) {
    return new Err(new Error("Failed to initialise file system."));
  }
  const dustFs = fsResult.value;

  const podRoot = `${SCOPED_PREFIX_POD}${pod.sId}`;
  // A pod listing is recursive, so this single call covers every folder and file at any depth.
  const listResult = await dustFs.list(podRoot);
  if (listResult.isErr()) {
    return new Err(listResult.error);
  }

  const [sandboxFunctions, databaseOnDiskNames, metadata] = await Promise.all([
    SandboxFunctionResource.listBySpace(auth, pod),
    listPodDatabaseOnDiskNames(auth, pod),
    ProjectMetadataResource.fetchBySpace(auth, pod),
  ]);

  const functionsByPrefix = groupFunctionsByAppPrefix(sandboxFunctions);
  const pinnedFramePaths = new Set(
    (metadata?.frameTabs ?? []).map((tab) => tab.path)
  );

  const folders = Array.from(
    collectAppFolders(listResult.value, podRoot).values()
  );
  const framesByFolderName = await resolveFramesByFolderName(
    auth,
    dustFs,
    folders,
    pinnedFramePaths
  );

  // Several folder names can normalize onto one prefix (`Task List` and `Task-List` both give
  // `task-list`), and such folders genuinely share published slugs and databases. Group by prefix so
  // the collision is reported rather than silently producing two apps that own the same artifacts.
  const foldersByPrefix = new Map<string, AppFolder[]>();
  for (const folder of folders) {
    const prefix = normalizeAppPrefix(folder.name);
    if (!prefix) {
      continue;
    }
    foldersByPrefix.set(prefix, [
      ...(foldersByPrefix.get(prefix) ?? []),
      folder,
    ]);
  }

  // Needs foldersByPrefix: a database created before app namespacing has no prefix in its filename,
  // so only the schema file that declares it says which app owns it.
  const databasesByPrefix = groupDatabasesByAppPrefix(
    databaseOnDiskNames,
    foldersByPrefix
  );

  const realPrefixes = new Set([
    ...foldersByPrefix.keys(),
    ...functionsByPrefix.keys(),
    ...databasesByPrefix.keys(),
  ]);
  realPrefixes.delete(UNFILED_POD_APP_PREFIX);

  const apps: PodApp[] = [];

  for (const prefix of realPrefixes) {
    const prefixFolders = foldersByPrefix.get(prefix) ?? [];
    const functions = functionsByPrefix.get(prefix) ?? [];
    const databases = databasesByPrefix.get(prefix) ?? [];
    const frames = prefixFolders.flatMap(
      (folder) => framesByFolderName.get(folder.name) ?? []
    );

    const isApp =
      prefixFolders.some((folder) => folder.hasAppShapedSubfolder) ||
      frames.length > 0 ||
      functions.length > 0 ||
      databases.length > 0;
    if (!isApp) {
      continue;
    }

    const [primaryFolder] = prefixFolders;
    apps.push({
      prefix,
      // With no folder left, the prefix is the only name the app still has.
      name: primaryFolder?.name ?? prefix,
      folderPath: primaryFolder?.path ?? null,
      frames,
      functions,
      databases,
      fileCount: prefixFolders.reduce(
        (total, folder) => total + folder.fileCount,
        0
      ),
      collidingFolderNames:
        prefixFolders.length > 1 ? prefixFolders.map((f) => f.name) : [],
    });
  }

  apps.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  // Artifacts published from the pod root have no folder to be found under, so they get a synthetic
  // app rather than disappearing from the listing. Appended after the sort so it always sits last.
  const unfiledFunctions = functionsByPrefix.get(UNFILED_POD_APP_PREFIX) ?? [];
  const unfiledDatabases = databasesByPrefix.get(UNFILED_POD_APP_PREFIX) ?? [];
  if (unfiledFunctions.length > 0 || unfiledDatabases.length > 0) {
    apps.push({
      prefix: UNFILED_POD_APP_PREFIX,
      name: null,
      folderPath: null,
      frames: [],
      functions: unfiledFunctions,
      databases: unfiledDatabases,
      fileCount: 0,
      collidingFolderNames: [],
    });
  }

  return new Ok(apps);
}

export type PodAppDeleteErrorCode =
  | "not_a_pod"
  | "not_found"
  | "cannot_delete_unfiled"
  | "sandbox_unavailable"
  | "internal";

export class PodAppDeleteError extends Error {
  constructor(
    readonly code: PodAppDeleteErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PodAppDeleteError";
  }
}

export interface DeletePodAppResult {
  prefix: string;
  name: string | null;
  deletedFunctionSlugs: string[];
  deletedDatabaseNames: string[];
  deletedFolderNames: string[];
}

/**
 * Delete a Pod app: its published functions, its databases (live files and replicas), its shared
 * Frames and pinned tabs, and finally its source folder.
 *
 * **The step order is the design.** Two constraints fix it:
 *
 *  - Functions go first, so no invocation can arrive while the data underneath it is being removed.
 *  - A database's live files must go before its replica, because a running litestream keeps
 *    replicating a database it can still see (the same hazard the pod-scrub path notes).
 *
 * And the source folder goes LAST on purpose. Every step is idempotent, and the folder is what makes
 * the app appear in the Apps tab, so a failure part-way through leaves the app still listed and
 * simply re-deletable. Deleting the folder first would instead leave an invisible half-deleted app.
 *
 * Deleting databases needs a live sandbox, so this wakes a sleeping pod (`execDbCommand` does it) and
 * can take as long as a cold start.
 */
export async function deletePodApp(
  auth: Authenticator,
  pod: SpaceResource,
  prefix: string
): Promise<Result<DeletePodAppResult, PodAppDeleteError>> {
  if (!pod.isProject()) {
    return new Err(
      new PodAppDeleteError("not_a_pod", "Apps only exist on Pod spaces.")
    );
  }

  // The unfiled app is a presentation device, not a folder: its artifacts each belong to whoever
  // published them at the pod root, so there is nothing coherent to delete.
  if (prefix === UNFILED_POD_APP_PREFIX) {
    return new Err(
      new PodAppDeleteError(
        "cannot_delete_unfiled",
        "Artifacts published outside an app folder cannot be deleted as an app."
      )
    );
  }

  const appsResult = await listPodApps(auth, pod);
  if (appsResult.isErr()) {
    return new Err(new PodAppDeleteError("internal", appsResult.error.message));
  }

  const app = appsResult.value.find((candidate) => candidate.prefix === prefix);
  if (!app) {
    return new Err(
      new PodAppDeleteError("not_found", `No app '${prefix}' in this Pod.`)
    );
  }

  // 1. Unpublish first: stop new invocations before their data goes away.
  for (const fn of app.functions) {
    const unpublishResult = await unpublishSandboxFunction(auth, {
      space: pod,
      slug: fn.slug,
    });
    // Already gone is fine — this whole flow is meant to be safe to retry.
    if (unpublishResult.isErr() && unpublishResult.error.code !== "not_found") {
      return new Err(
        new PodAppDeleteError("internal", unpublishResult.error.message)
      );
    }
  }

  // 2. Live database files, then 3. their replicas. Wakes the pod if it is asleep.
  for (const database of app.databases) {
    const deleteLiveResult = await deleteDatabaseOnSandbox(auth, {
      space: pod,
      database: database.onDiskName,
    });
    if (deleteLiveResult.isErr()) {
      return new Err(
        new PodAppDeleteError(
          deleteLiveResult.error.code === "sandbox_unavailable"
            ? "sandbox_unavailable"
            : "internal",
          deleteLiveResult.error.message
        )
      );
    }

    const deleteReplicaResult = await deletePodDatabaseReplica(auth, pod, {
      database: database.onDiskName,
    });
    if (deleteReplicaResult.isErr()) {
      return new Err(
        new PodAppDeleteError("internal", deleteReplicaResult.error.message)
      );
    }
  }

  // 4. Drop the Frames' pinned tabs before their files go, mirroring the delete_frame poke plugin.
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  if (metadata) {
    for (const frame of app.frames) {
      if (frame.isPinnedAsTab) {
        await metadata.removeFramePath(frame.path);
      }
    }
  }

  // 5. Source folder last. `deleteProjectFile` recurses and deletes each FileResource underneath,
  // which is what revokes the Frames' share tokens along with them. Colliding folders all normalize
  // onto this one prefix, so every one of them belongs to the app being deleted.
  const folderNames =
    app.collidingFolderNames.length > 0
      ? app.collidingFolderNames
      : removeNulls([app.name]);
  for (const folderName of folderNames) {
    const deleteFolderResult = await deleteProjectFile(auth, {
      space: pod,
      relativeFilePath: folderName,
    });
    if (deleteFolderResult.isErr()) {
      return new Err(
        new PodAppDeleteError("internal", deleteFolderResult.error.message)
      );
    }
  }

  const deletedFunctionSlugs = app.functions.map((fn) => fn.slug);
  const deletedDatabaseNames = app.databases.map((db) => db.onDiskName);

  return new Ok({
    prefix: app.prefix,
    name: app.name,
    deletedFunctionSlugs,
    deletedDatabaseNames,
    deletedFolderNames: folderNames,
  });
}

export type PodAppCloneErrorCode =
  | "not_a_pod"
  | "not_found"
  | "cannot_clone_unfiled"
  | "invalid_name"
  | "name_taken"
  | "sandbox_unavailable"
  | "internal";

export class PodAppCloneError extends Error {
  constructor(
    readonly code: PodAppCloneErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PodAppCloneError";
  }
}

export interface ClonePodAppResult {
  prefix: string;
  name: string;
  copiedFileCount: number;
  clonedFrameNames: string[];
  publishedFunctionSlugs: string[];
  reconciledDatabaseNames: string[];
  /** Functions or databases whose source file the copy does not have, so they were not recreated. */
  skipped: string[];
}

/** The files under an app folder, Frames included, as a listing reports them. */
function fileEntriesOf(entries: FileSystemEntry[]): FileSystemFileEntry[] {
  return entries.flatMap((entry) => (entry.isDirectory ? [] : [entry]));
}

/**
 * Clone a Pod app into a new folder in the same Pod.
 *
 * What carries over: every file under the app folder, its published functions (re-published under the
 * copy's prefix), and its databases as **fresh, empty** ones reconciled from the copied schema files.
 * What does not: database rows, share tokens, the pinned tab, and invocation history. The copy's Frame
 * is left unpublished, so the author decides when it becomes a shareable artifact.
 *
 * A Frame cannot simply be copied as an object — it needs a FileResource to be publishable at all —
 * so Frames are recreated through `createPodFrameFile` and every other file is copied directly.
 *
 * Nothing rewrites the copied Frame's source. A Frame that refers to its functions by bare name
 * resolves them against the copy's own folder and is correct by construction; one that hard-codes
 * `<podId>/<prefix>__<name>` keeps calling the ORIGINAL app's functions, and its author has to fix
 * that themselves.
 */
export async function clonePodApp(
  auth: Authenticator,
  pod: SpaceResource,
  { prefix, newName }: { prefix: string; newName: string }
): Promise<Result<ClonePodAppResult, PodAppCloneError>> {
  if (!pod.isProject()) {
    return new Err(
      new PodAppCloneError("not_a_pod", "Apps only exist on Pod spaces.")
    );
  }
  if (prefix === UNFILED_POD_APP_PREFIX) {
    return new Err(
      new PodAppCloneError(
        "cannot_clone_unfiled",
        "Artifacts published outside an app folder are not an app and cannot be cloned."
      )
    );
  }

  const folderName = newName.trim();
  const newPrefix = normalizeAppPrefix(folderName);
  if (!newPrefix) {
    return new Err(
      new PodAppCloneError(
        "invalid_name",
        `'${newName}' has no letters or digits to name an app with.`
      )
    );
  }
  if (folderName.includes("/")) {
    return new Err(
      new PodAppCloneError("invalid_name", "An app name cannot contain '/'.")
    );
  }

  const appsResult = await listPodApps(auth, pod);
  if (appsResult.isErr()) {
    return new Err(new PodAppCloneError("internal", appsResult.error.message));
  }

  const source = appsResult.value.find((app) => app.prefix === prefix);
  if (!source || !source.folderPath) {
    return new Err(
      new PodAppCloneError("not_found", `No app '${prefix}' in this Pod.`)
    );
  }

  // Two folders whose names normalize onto one prefix share published slugs and databases, so the
  // check is on the prefix rather than the folder name.
  if (appsResult.value.some((app) => app.prefix === newPrefix)) {
    return new Err(
      new PodAppCloneError(
        "name_taken",
        `This Pod already has an app named '${newPrefix}'.`
      )
    );
  }

  const fsResult = await DustFileSystem.forPod(auth, pod);
  if (fsResult.isErr()) {
    return new Err(
      new PodAppCloneError("internal", "Failed to initialise file system.")
    );
  }
  const dustFs = fsResult.value;

  const podRoot = `${SCOPED_PREFIX_POD}${pod.sId}`;
  const sourceFolderPath = source.folderPath;
  const destFolderPath = `${podRoot}/${folderName}`;

  const listResult = await dustFs.list(sourceFolderPath);
  if (listResult.isErr()) {
    return new Err(new PodAppCloneError("internal", listResult.error.message));
  }
  const sourceEntries = fileEntriesOf(listResult.value);

  // Copy everything except the Frames, which need a FileResource of their own.
  let copiedFileCount = 0;
  for (const entry of sourceEntries) {
    if (isInteractiveContentType(entry.contentType)) {
      continue;
    }

    const relPath = entry.path.slice(sourceFolderPath.length + 1);
    const copyResult = await dustFs.copy({
      src: entry.path,
      dest: `${destFolderPath}/${relPath}`,
    });
    if (copyResult.isErr()) {
      return new Err(
        new PodAppCloneError("internal", copyResult.error.message)
      );
    }
    copiedFileCount += 1;
  }

  // Recreate the Frames so the copy owns publishable files rather than bare objects.
  const clonedFrameNames: string[] = [];
  for (const frame of source.frames) {
    if (!frame.fileId) {
      continue;
    }
    const sourceFile = await FileResource.fetchById(auth, frame.fileId);
    if (!sourceFile) {
      continue;
    }
    if (!isInteractiveContentType(sourceFile.contentType)) {
      continue;
    }
    const content = await getFileContent(auth, sourceFile, "original");
    if (content === null) {
      return new Err(
        new PodAppCloneError(
          "internal",
          `Could not read the source of Frame '${frame.fileName}'.`
        )
      );
    }

    const createResult = await createPodFrameFile(auth, {
      space: pod,
      folderName,
      fileName: frame.fileName,
      contentType: sourceFile.contentType,
      content,
    });
    if (createResult.isErr()) {
      return new Err(
        new PodAppCloneError("internal", createResult.error.message)
      );
    }
    clonedFrameNames.push(frame.fileName);
    copiedFileCount += 1;
  }

  const copiedPathByRelPath = new Map(
    sourceEntries.map((entry) => {
      const relPath = entry.path.slice(sourceFolderPath.length + 1);

      return [relPath, `${destFolderPath}/${relPath}`] as const;
    })
  );
  const skipped: string[] = [];

  // The copy's function sources, indexed by the name they publish under. A function's source is one
  // file directly under `functions/`, named after it; anything nested below that (`functions/lib/`)
  // is a helper the bundler pulls in, not a function of its own.
  const functionSourceByName = new Map<string, string>();
  for (const [relPath, destPath] of copiedPathByRelPath) {
    const segments = relPath.split("/");
    if (segments.length !== 2 || segments[0] !== APP_FUNCTIONS_SUBFOLDER) {
      continue;
    }
    functionSourceByName.set(stripExtension(segments[1]), destPath);
  }

  // Publish the copy's functions. The source path decides the prefix, so publishing from the copy's
  // folder is what gives the clone its own functions; description and execution mode are carried over
  // so the contract is identical.
  const publishedFunctionSlugs: string[] = [];
  for (const fn of source.functions) {
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
      return new Err(
        new PodAppCloneError(
          publishResult.error.code === "sandbox_unavailable"
            ? "sandbox_unavailable"
            : "internal",
          publishResult.error.message
        )
      );
    }
    publishedFunctionSlugs.push(publishResult.value.slug);
  }

  // Reconcile the copy's databases from its own schema files, which creates them empty under the
  // copy's prefix. Data is deliberately not carried over.
  const reconciledDatabaseNames: string[] = [];
  for (const database of source.databases) {
    const schemaRelPath = `${APP_DATABASES_SUBFOLDER}/${database.name}${POD_DATABASE_SCHEMA_FILE_SUFFIX}`;
    const schemaPath = copiedPathByRelPath.get(schemaRelPath);
    if (!schemaPath) {
      skipped.push(`database ${database.name}`);
      continue;
    }

    const reconcileResult = await reconcileDatabaseFromPodPath(auth, {
      space: pod,
      database: database.name,
      path: schemaPath,
    });
    if (reconcileResult.isErr()) {
      return new Err(
        new PodAppCloneError(
          reconcileResult.error.code === "sandbox_unavailable"
            ? "sandbox_unavailable"
            : "internal",
          reconcileResult.error.message
        )
      );
    }
    reconciledDatabaseNames.push(reconcileResult.value.database);
  }

  return new Ok({
    prefix: newPrefix,
    name: folderName,
    copiedFileCount,
    clonedFrameNames,
    publishedFunctionSlugs,
    reconciledDatabaseNames,
    skipped,
  });
}
