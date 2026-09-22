import type { DustFileSystem } from "@app/lib/api/file_system";
import type {
  FileResource,
  LegacyFrameIdentity,
} from "@app/lib/resources/file_resource";
import type { FRAME_MANIFEST_VERSION } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";

export const FRAME_SOURCE_IO_CONCURRENCY = 8;

/**
 * Content type every file in a migrated package is stored under, matching what the canonical
 * write path gives a `.tsx` or `.json` written with no declared type.
 */
export const FRAME_PACKAGE_FILE_CONTENT_TYPE = "text/plain";

/** A source to relocate, both scoped: `conversation-<cId>/Sales.tsx` -> `.../Sales/Sales.tsx`. */
export type FrameV2SourceRelocation = {
  from: string;
  to: string;
};

export type FrameV2MigrationPlan = {
  /** Scoped path of the folder that becomes the package root: `conversation-<cId>/Sales`. */
  folderScopedPath: string;
  /** Scoped path of the `manifest.json` to write, the migrated Frame's new identity path. */
  manifestScopedPath: string;
  /** Relative to `folderScopedPath`: `index.tsx`, or the entry's own name when it stays put. */
  uiEntryPoint: string;
  /** Empty when the Frame already lives in a folder of its own. Entry first, then its imports. */
  relocations: FrameV2SourceRelocation[];
  manifest: {
    version: typeof FRAME_MANIFEST_VERSION;
    description: string;
    uiEntryPoint: string;
  };
};

/** The little a plan needs of a Frame, so planning stays testable without a row. */
export type PlannableFrame = {
  fileName: string;
  sId: string;
};

export type PlanFrameV2MigrationParams = {
  frame: PlannableFrame;
  /** Scoped path of the Frame's entry source file: `conversation-<cId>/Sales.tsx`. */
  entryScopedPath: string;
  /** Scoped paths the bundle read, the entry included. Order is preserved after the entry. */
  sourceScopedPaths: string[];
  /** Folder names already present at the mount scope root, used to disambiguate: `Sales`. */
  takenFolderNames: ReadonlySet<string>;
};

export type FrameSourcesToRelocate = {
  /** Scoped path of the folder the sources currently sit under: `conversation-<cId>`. */
  entryRoot: string;
  /** Scoped paths of the sources to move, all under `entryRoot`, the entry first. */
  sourceScopedPaths: string[];
};

export type CopiedFrameSources = {
  /** Destinations that landed, for rollback. Partial when `error` is set. */
  writtenScopedPaths: string[];
  error: Error | null;
};

export type FrameV2LayoutRollback = {
  /** Identity to restore, or null when the row was never flipped. */
  previousIdentity: LegacyFrameIdentity | null;
  /** Scoped paths written while laying the package out. */
  writtenScopedPaths: string[];
};

export type FrameEntryLocation = {
  /** Scoped path of the folder the entry sits in: `conversation-<cId>`. */
  entryRoot: string;
  /** The entry's file name, relative to `entryRoot`: `Sales.tsx`. */
  entryRelPath: string;
};

export type FramePathChange = {
  /** Scoped path the Frame was reachable at: `pod-<podId>/Sales.tsx`. */
  from: string;
  /** Scoped path it is reachable at now: `pod-<podId>/Sales/manifest.json`. */
  to: string;
};

export type FrameV2Publisher<T> = (
  frame: FileResource
) => Promise<Result<T, Error>>;

export type MigrateFrameToV2Params<T> = {
  dustFs: DustFileSystem;
  /** Scoped path of the legacy Frame's entry source file: `conversation-<cId>/Sales.tsx`. */
  entryScopedPath: string;
  frame: FileResource;
  publish: FrameV2Publisher<T>;
};

/** The migrated Frame and whatever its first v2 publication returned. */
export type MigratedFrameV2<T> = {
  frame: FileResource;
  published: T;
};
