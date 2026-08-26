import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";

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
  return `${getFramePublicationBasePath(args)}manifest.json`;
}

export function getFramePublicationSourceBasePath(args: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
}): string {
  return `${getFramePublicationBasePath(args)}source/`;
}

export function getFramePublicationSourcePath({
  relativePath,
  ...args
}: {
  workspaceId: string;
  frameId: string;
  publicationId: string;
  relativePath: string;
}): string {
  if (!isSafeFrameRelativePath(relativePath)) {
    throw new Error("Invalid relative source path for Frame storage.");
  }

  return `${getFramePublicationSourceBasePath(args)}${relativePath}`;
}
