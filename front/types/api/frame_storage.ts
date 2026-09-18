import { FRAME_DATABASE_NAME_REGEX } from "@app/types/api/frame_manifest";

const SAFE_FRAME_STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const FRAME_PUBLICATION_FILE = "publication.json";
/** Uncompressed tar of every published function bundle (`<name>.ts`). */
export const FRAME_PUBLICATION_FUNCTIONS_ARCHIVE_FILE = "functions.tar";

/**
 * Whether `value` may be used as a Frame storage path segment. Callers that discover segments
 * rather than construct them — listing publication directories, say — filter with this instead of
 * letting the path builders throw on a name the bucket happens to hold.
 */
export function isSafeFrameStorageSegment(value: string): boolean {
  return SAFE_FRAME_STORAGE_SEGMENT.test(value);
}

function safeSegment(value: string, label: string): string {
  if (!isSafeFrameStorageSegment(value)) {
    throw new Error(`Invalid ${label} for Frame storage.`);
  }

  return value;
}

export function getFramesBasePath({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `w/${safeSegment(workspaceId, "workspaceId")}/frames/`;
}

export function getFrameBasePath({
  frameId,
  ...args
}: {
  workspaceId: string;
  frameId: string;
}): string {
  return `${getFramesBasePath(args)}${safeSegment(frameId, "frameId")}/`;
}

export function getFrameDatabaseReplicasBasePath(args: {
  workspaceId: string;
  frameId: string;
}): string {
  return `${getFrameBasePath(args)}state/databases/`;
}

/**
 * Durable folder holding files a Frame's functions create at run time (uploads and anything else
 * they persist). Frame-owned state, so it sits beside the SQLite replicas under `state/` and is
 * keyed on the stable Frame identity: it survives re-publishing, and the Frame source never seeds
 * it. Deleted with the Frame by the wholesale `getFrameBasePath` prefix delete, so it needs no
 * cleanup of its own.
 *
 * Its `state/databases/` sibling is mounted as its own gcsfuse target, and the two must never be
 * collapsed into one `state/` mount: a mount carries a single uid and mode for its whole tree,
 * and these two need opposite ones. The replica is mounted as `dust-state` with no `allow_other`
 * so no other uid can see it, while this folder must be workload-readable and writable.
 */
export function getFrameDataFilesBasePath(args: {
  workspaceId: string;
  frameId: string;
}): string {
  return `${getFrameBasePath(args)}state/files/`;
}

export function getFramePublicationsBasePath(args: {
  workspaceId: string;
  frameId: string;
}): string {
  return `${getFrameBasePath(args)}publications/`;
}

export function getFrameDatabaseReplicaBasePath({
  databaseName,
  ...args
}: {
  workspaceId: string;
  frameId: string;
  databaseName: string;
}): string {
  if (!FRAME_DATABASE_NAME_REGEX.test(databaseName)) {
    throw new Error("Invalid databaseName for Frame storage.");
  }

  return `${getFrameDatabaseReplicasBasePath(args)}${databaseName}.db/`;
}

export function getFramePublicationBasePath({
  workspaceId,
  frameId,
  publicationId,
}: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
}): string {
  return `${getFramePublicationsBasePath({ workspaceId, frameId })}${safeSegment(publicationId, "publicationId")}/`;
}

export function getFramePublicationDescriptorPath(args: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
}): string {
  return `${getFramePublicationBasePath(args)}${FRAME_PUBLICATION_FILE}`;
}

export function getFramePublicationUiBundlePath(args: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
}): string {
  return `${getFramePublicationBasePath(args)}ui/bundle.js`;
}

export function getFramePublicationFunctionBundlePath(args: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
  functionName: string;
}): string {
  return `${getFramePublicationBasePath(args)}functions/${safeSegment(args.functionName, "functionName")}.ts`;
}

/** Sibling of the per-function `functions/` directory: one archive for cold materialization. */
export function getFramePublicationFunctionsArchivePath(args: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
}): string {
  return `${getFramePublicationBasePath(args)}${FRAME_PUBLICATION_FUNCTIONS_ARCHIVE_FILE}`;
}
