import { FRAME_DATABASE_NAME_REGEX } from "@app/types/api/frame_manifest";

const SAFE_FRAME_STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function safeSegment(value: string, label: string): string {
  if (!SAFE_FRAME_STORAGE_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label} for Frame storage.`);
  }

  return value;
}

export function getFrameBasePath({
  workspaceId,
  frameId,
}: {
  workspaceId: string;
  frameId: string;
}): string {
  return `w/${safeSegment(workspaceId, "workspaceId")}/frames/${safeSegment(frameId, "frameId")}/`;
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

  return `${getFrameBasePath(args)}state/databases/${databaseName}.db/`;
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

export function getFramePublicationManifestPath(args: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
}): string {
  return `${getFramePublicationBasePath(args)}publication.json`;
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

export function getFramePublicationFunctionSchemaPath(args: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
  functionName: string;
}): string {
  return `${getFramePublicationBasePath(args)}functions/${safeSegment(args.functionName, "functionName")}.schema.json`;
}
