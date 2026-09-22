import path from "node:path";

import type { DustFileSystem } from "@app/lib/api/file_system";
import type {
  CopiedFrameSources,
  FrameEntryLocation,
  FramePathChange,
  FrameSourcesToRelocate,
  FrameV2LayoutRollback,
  FrameV2MigrationPlan,
  FrameV2SourceRelocation,
  PlanFrameV2MigrationParams,
  PlannableFrame,
} from "@app/lib/api/frames/migrate_to_v2/types";
import {
  FRAME_PACKAGE_FILE_CONTENT_TYPE,
  FRAME_SOURCE_IO_CONCURRENCY,
} from "@app/lib/api/frames/migrate_to_v2/types";
import {
  buildFrameBundle,
  createMountFrameSourceReader,
} from "@app/lib/api/viz/build_frame_bundle";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  FRAME_DEFAULT_UI_ENTRY_POINT,
  FRAME_MANIFEST_FILE,
  FRAME_MANIFEST_VERSION,
  isSafeFrameRelativePath,
  MAX_FRAME_NAME_LENGTH,
  validateFrameV2Name,
} from "@app/types/api/frame_manifest";
import { isInteractiveContentType, stripFileExtension } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// ---------------------------------------------------------------------------
// Preconditions.
// ---------------------------------------------------------------------------

export async function canMigrateFrameToV2(
  auth: Authenticator,
  dustFs: DustFileSystem,
  frame: FileResource
): Promise<boolean> {
  // Both v1 content types qualify: a slideshow differs from a dashboard only in the runtime
  // library its source imports (`@dust/slideshow/v1`), which v2 serves as well.
  if (!isInteractiveContentType(frame.contentType)) {
    return false;
  }
  if (!dustFs.isGCSBacked()) {
    return false;
  }

  // One fetch, two flags: `frames_v2` says the workspace can run v2 Frames at all, the migration
  // flag says legacy ones may be upgraded on publish. Both are required.
  const flags = await getFeatureFlags(auth);

  return flags.includes("frames_v2") && flags.includes("frames_v2_migration");
}

// ---------------------------------------------------------------------------
// Planning the package layout. Pure: no storage, no database.
// ---------------------------------------------------------------------------

/** `SalesDashboard` -> `Sales Dashboard`, `KPIReport` -> `KPI Report`. */
function splitCamelCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/**
 * The folder segment the package gets, which is therefore the Frame's name. Falls back to the
 * sId when the file name carries nothing usable, so the result is never empty, never a hidden
 * folder, and always a name `validateFrameV2Name` accepts.
 */
function displayNameFor({ fileName, sId }: PlannableFrame): string {
  // trimEnd because clamping a spaced name can land on a space, which a folder should not end on.
  const cleaned = splitCamelCase(stripFileExtension(fileName))
    .trim()
    .slice(0, MAX_FRAME_NAME_LENGTH)
    .trimEnd();
  const validated = validateFrameV2Name(cleaned);
  const isUsable = validated.isOk() && !cleaned.startsWith(".");

  return isUsable ? cleaned : sId;
}

/**
 * The folder the package gets. A taken name is disambiguated with the Frame's sId, and the base
 * is trimmed first so the suffix still fits: the folder name is the Frame name, and
 * `validateFrameV2Name` rejects anything over `MAX_FRAME_NAME_LENGTH`.
 */
function folderSegment(
  name: string,
  sId: string,
  takenFolderNames: ReadonlySet<string>
): string {
  if (!takenFolderNames.has(name)) {
    return name;
  }

  const suffix = `_${sId}`;
  const base = name.slice(0, MAX_FRAME_NAME_LENGTH - suffix.length).trimEnd();

  return `${base}${suffix}`;
}

function relocationsInto(
  folderScopedPath: string,
  { entryRoot, sourceScopedPaths }: FrameSourcesToRelocate
): Result<FrameV2SourceRelocation[], Error> {
  const prefix = `${entryRoot}/`;
  const relocations: FrameV2SourceRelocation[] = [];

  for (const from of sourceScopedPaths) {
    if (!from.startsWith(prefix)) {
      return new Err(
        new Error(`Frame source '${from}' does not sit under '${entryRoot}'.`)
      );
    }

    const relativePath = from.slice(prefix.length);
    if (!isSafeFrameRelativePath(relativePath)) {
      return new Err(new Error(`Unsafe Frame source path: '${from}'.`));
    }

    relocations.push({ from, to: `${folderScopedPath}/${relativePath}` });
  }

  return new Ok(relocations);
}

/**
 * @cc [owner:pmilliotte,label:product] frame-v2-migration-plan-is-self-contained
 * Every relocation a plan produces MUST land inside `folderScopedPath`, and the path of each
 * relocated file relative to the Frame's old bundle root MUST be preserved relative to the new
 * folder. This is what keeps the entry's relative imports resolving after the move. The entry
 * itself is the one exception: it is renamed to `index.tsx` so a migrated package looks like a
 * scaffolded one, which breaks any sibling importing the entry back by its old name. A source
 * that does not sit under the entry's root MUST fail the plan rather than be dropped or
 * rewritten, whether or not the plan relocates anything.
 */
/**
 * Decide how a legacy Frame becomes a Frames v2 package.
 *
 * - Entry directly under its mount scope root (`conversation-<id>/Sales.tsx`): the Frame gets a
 *   folder of its own, the entry plus its import graph moves in, and the entry is renamed to
 *   `index.tsx`.
 * - Entry already in a subfolder: that folder is the package root, nothing moves, and the
 *   manifest records the entry's own name.
 */
export function planFrameV2Migration({
  frame,
  entryScopedPath,
  sourceScopedPaths,
  takenFolderNames,
}: PlanFrameV2MigrationParams): Result<FrameV2MigrationPlan, Error> {
  const entryRoot = path.posix.dirname(entryScopedPath);
  if (entryRoot === "." || entryRoot === "/") {
    return new Err(
      new Error(
        `Frame entry '${entryScopedPath}' has no directory to anchor the Frame package.`
      )
    );
  }

  const entryFileName = path.posix.basename(entryScopedPath);
  if (!isSafeFrameRelativePath(entryFileName)) {
    return new Err(
      new Error(`Frame entry '${entryScopedPath}' is not a usable entry point.`)
    );
  }

  // Checked whether or not anything moves: a source outside the entry's root means the graph is
  // not self-contained, and the plan must fail rather than quietly leave that file behind.
  const strayCheck = relocationsInto(entryRoot, {
    entryRoot,
    sourceScopedPaths,
  });
  if (strayCheck.isErr()) {
    return strayCheck;
  }

  const name = displayNameFor(frame);
  const isAlreadyInOwnFolder = entryRoot.includes("/");
  const folderScopedPath = isAlreadyInOwnFolder
    ? entryRoot
    : `${entryRoot}/${folderSegment(name, frame.sId, takenFolderNames)}`;

  // Sources already sit inside the package root, so nothing moves and nothing needs checking.
  const orderedSources = isAlreadyInOwnFolder
    ? []
    : [
        entryScopedPath,
        ...sourceScopedPaths.filter((source) => source !== entryScopedPath),
      ];

  const relocations = relocationsInto(folderScopedPath, {
    entryRoot,
    sourceScopedPaths: orderedSources,
  });
  if (relocations.isErr()) {
    return relocations;
  }

  // A sibling already holding the name keeps it: renaming onto it would drop one of the two.
  const isIndexTaken = relocations.value.some(
    ({ from, to }) =>
      from !== entryScopedPath &&
      to === `${folderScopedPath}/${FRAME_DEFAULT_UI_ENTRY_POINT}`
  );
  const renamesEntry = !isAlreadyInOwnFolder && !isIndexTaken;

  const uiEntryPoint = renamesEntry
    ? FRAME_DEFAULT_UI_ENTRY_POINT
    : entryFileName;
  const relocationsWithEntry = renamesEntry
    ? relocations.value.map((relocation) =>
        relocation.from === entryScopedPath
          ? { ...relocation, to: `${folderScopedPath}/${uiEntryPoint}` }
          : relocation
      )
    : relocations.value;

  return new Ok({
    folderScopedPath,
    manifestScopedPath: `${folderScopedPath}/${FRAME_MANIFEST_FILE}`,
    uiEntryPoint,
    relocations: relocationsWithEntry,
    manifest: {
      version: FRAME_MANIFEST_VERSION,
      description: "",
      uiEntryPoint,
    },
  });
}

// ---------------------------------------------------------------------------
// Reading and writing the mount.
// ---------------------------------------------------------------------------

/**
 * Bundle the Frame from its entry, recording every source the import graph reached.
 *
 * Doubles as the migration's gate: v2 publication rejects what does not bundle, syntax-check or
 * Tailwind-check, so a Frame that fails here could not be published as v2 either.
 */
export async function readFrameSourceGraph(
  dustFs: DustFileSystem,
  { entryRoot, entryRelPath }: FrameEntryLocation
): Promise<Result<string[], Error>> {
  const baseReader = createMountFrameSourceReader(dustFs, entryRoot);
  const readRelPaths: string[] = [];

  const build = await buildFrameBundle({
    entryRelPath,
    reader: {
      list: () => baseReader.list(),
      read: async (relPath) => {
        const content = await baseReader.read(relPath);
        if (content !== null) {
          readRelPaths.push(relPath);
        }

        return content;
      },
    },
  });
  if (build.isErr()) {
    return new Err(build.error);
  }

  return new Ok(readRelPaths.map((relPath) => `${entryRoot}/${relPath}`));
}

/**
 * Copy every relocation into the package folder, reporting what landed so a partial layout can
 * be rolled back. Every copy is awaited before returning, so a rollback never races one still in
 * flight.
 */
export async function copyFrameSources(
  dustFs: DustFileSystem,
  relocations: FrameV2SourceRelocation[]
): Promise<CopiedFrameSources> {
  const writtenScopedPaths: string[] = [];

  const errors = await concurrentExecutor(
    relocations,
    async ({ from, to }) => {
      const copied = await dustFs.copy({ src: from, dest: to });
      if (copied.isErr()) {
        return copied.error;
      }
      writtenScopedPaths.push(to);

      return null;
    },
    { concurrency: FRAME_SOURCE_IO_CONCURRENCY }
  );

  return {
    writtenScopedPaths,
    error: errors.find((err) => err !== null) ?? null,
  };
}

/** Immediate child folder names of `root`, so a new package folder never shadows one. */
export async function listFolderNames(
  dustFs: DustFileSystem,
  root: string
): Promise<ReadonlySet<string>> {
  const listing = await dustFs.list(root);
  if (listing.isErr()) {
    return new Set();
  }

  const prefix = `${root}/`;
  const names = new Set<string>();
  for (const entry of listing.value) {
    const relativePath = entry.path.startsWith(prefix)
      ? entry.path.slice(prefix.length)
      : null;
    if (!relativePath) {
      continue;
    }

    const [head, ...rest] = relativePath.split("/");
    if (head && (entry.isDirectory || rest.length > 0)) {
      names.add(head);
    }
  }

  return names;
}

/**
 * Store the package's entry as ordinary text. It was stored as the Frame itself and the copy
 * inherited that, which would list it as a second Frame beside the manifest. Storage exposes no
 * content-type update, hence the read and write back.
 *
 * Best-effort: the stored type drives how the file is listed and previewed, never whether the
 * Frame works.
 */
export async function storeEntrySourceAsText(
  dustFs: DustFileSystem,
  frame: FileResource,
  entryScopedPath: string
): Promise<void> {
  const read = await dustFs.readBuffer(entryScopedPath);
  const source = read.isOk() ? read.value : null;
  if (!source) {
    logger.warn(
      { fileId: frame.sId, entryScopedPath },
      "migrateFrameToV2: failed to read the entry source to restore its content type"
    );

    return;
  }

  const written = await dustFs.write(
    entryScopedPath,
    source,
    FRAME_PACKAGE_FILE_CONTENT_TYPE
  );
  if (written.isErr()) {
    logger.warn(
      { fileId: frame.sId, err: written.error, entryScopedPath },
      "migrateFrameToV2: failed to store the entry source as text"
    );
  }
}

/**
 * Undo a partial migration, so a Frame that did not make it through is left working as v1. The
 * row is restored only when it was already flipped. Best-effort: a rollback that cannot finish
 * must not mask the failure that triggered it.
 */
export async function rollbackFrameV2Layout(
  dustFs: DustFileSystem,
  frame: FileResource,
  { previousIdentity, writtenScopedPaths }: FrameV2LayoutRollback
): Promise<void> {
  try {
    if (previousIdentity) {
      await frame.restoreLegacyFrameIdentity(previousIdentity);
    }
    await discard(dustFs, writtenScopedPaths);
  } catch (err) {
    logger.error(
      { fileId: frame.sId, err: normalizeError(err) },
      "migrateFrameToV2: failed to roll back a partial migration"
    );
  }
}

/** Best-effort cleanup: a leftover object is noise, never a correctness problem. */
export async function discard(
  dustFs: DustFileSystem,
  scopedPaths: string[]
): Promise<void> {
  await concurrentExecutor(
    scopedPaths,
    async (scopedPath) => {
      const deleted = await dustFs.delete(scopedPath, { ignoreNotFound: true });
      if (deleted.isErr()) {
        logger.warn(
          { err: deleted.error, scopedPath },
          "migrateFrameToV2: failed to clean up a Frame source"
        );
      }
    },
    { concurrency: FRAME_SOURCE_IO_CONCURRENCY }
  );
}

// ---------------------------------------------------------------------------
// Pod references.
// ---------------------------------------------------------------------------

/**
 * Point the Pod's pinned banner and file tabs at the migrated Frame's manifest, which replaced
 * the entry file they reference. Best-effort: a stale reference hides the banner or the tab, it
 * never breaks the Frame.
 */
export async function repointPodFrameReferences(
  auth: Authenticator,
  frame: FileResource,
  { from, to }: FramePathChange
): Promise<void> {
  const spaceId = frame.useCaseMetadata?.spaceId;
  if (!spaceId) {
    return;
  }

  try {
    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space?.isProject()) {
      return;
    }

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
    await metadata?.renameFramePath(from, to);
  } catch (err) {
    logger.warn(
      { fileId: frame.sId, err: normalizeError(err), from, to },
      "migrateFrameToV2: failed to repoint the Pod's Frame references"
    );
  }
}
