import { DustFileSystem } from "@app/lib/api/file_system";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { getPodStateBasePath } from "@app/lib/api/files/mount_path";
import {
  appPrefixFromPodDatabaseName,
  podDatabaseNameWithoutAppPrefix,
} from "@app/lib/api/sandbox_functions/db_naming";
import {
  normalizeAppPrefix,
  SANDBOX_FUNCTION_SLUG_SEPARATOR,
} from "@app/lib/api/sandbox_functions/slug";
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
import { isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * The prefix of the synthetic app collecting everything published from the pod root, which has no
 * app folder (`deriveAppPrefix` returns null for those paths). Empty so it can never collide with a
 * real prefix, which `normalizeAppPrefix` guarantees is non-empty.
 */
export const UNFILED_POD_APP_PREFIX = "";

/** A litestream replica directory is named after the database file it replicates. */
const POD_DATABASE_FILE_SUFFIX = ".db";

/** Subfolders whose presence marks a pod-root folder as app-shaped. */
const APP_SHAPED_SUBFOLDERS = ["functions", "databases"];

/** The app subfolder holding one drizzle schema file per database. */
const APP_DATABASES_SUBFOLDER = "databases";

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
