import type { LightWorkspaceType } from "@dust-tt/types";
import {
  isSupportedImageContentFragmentType,
  isSupportedTextContentFragmentType,
} from "@dust-tt/types";
import type formidable from "formidable";
import fs from "fs";
import jwt from "jsonwebtoken";
import sharp from "sharp";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { FileResource } from "@app/lib/resources/file_resource";

export function makeStorageFilePathForWorkspaceId(
  owner: LightWorkspaceType,
  fileId: FileId
) {
  return `files/w/${owner.sId}/${fileId}`;
}

function getBasePathForWorkspacesFiles(owner: LightWorkspaceType) {
  return `${config.getAppUrl()}/api/w/${owner.sId}/files/`;
}

export function getDownloadUrlForFileId(
  owner: LightWorkspaceType,
  fileId: FileId
) {
  return `${getBasePathForWorkspacesFiles(owner)}${fileId}`;
}

export async function getFileNameFromFileMetadata(
  filePath: string
): Promise<string | null> {
  const metadata = await getPrivateUploadBucket().file(filePath).getMetadata();

  const [m] = metadata;

  if (
    typeof m.metadata === "object" &&
    m.metadata !== null &&
    typeof m.metadata.fileName === "string"
  ) {
    return m.metadata.fileName;
  }

  return null;
}

/**
 * File id logic.
 */

interface FileTokenPayload {
  fileId: FileId;
  fileName: string;
  fileSize: number;
  workspaceId: string;
}

export function encodeFilePayload(
  owner: LightWorkspaceType,
  payload: Omit<FileTokenPayload, "workspaceId">
) {
  return jwt.sign(
    {
      workspaceId: owner.sId,
      ...payload,
    },
    config.getFileIdSecret(),
    { expiresIn: "30s" } // Token expiration set to 30 seconds.
  );
}

export function decodeFileToken(token: string): FileTokenPayload | null {
  try {
    const decoded = jwt.verify(
      token,
      config.getFileIdSecret()
    ) as FileTokenPayload;

    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Text files handling.
 */

export function isSupportedTextMimeType(file: formidable.File): boolean {
  const { mimetype } = file;

  if (!mimetype || !isSupportedTextContentFragmentType(mimetype)) {
    return false;
  }

  return true;
}

export async function uploadToFileStorage(
  auth: Authenticator,
  fileRes: FileResource,
  file: formidable.File
) {
  const fileStream = fs.createReadStream(file.filepath);

  await fileRes.uploadStream(auth, fileStream);
}

/**
 * Image files handling.
 */

export function isSupportedImageMimeType(file: formidable.File): boolean {
  const { mimetype } = file;

  if (!mimetype || !isSupportedImageContentFragmentType(mimetype)) {
    return false;
  }

  return true;
}

export async function resizeAndUploadToFileStorage(
  auth: Authenticator,
  fileRes: FileResource,
  file: formidable.File
) {
  // Resize the image, preserving the aspect ratio. Longest side is max 768px.
  const resizedImageStream = sharp(file.filepath).resize(768, 768, {
    fit: sharp.fit.inside, // Ensure longest side is 768px.
    withoutEnlargement: true, // Avoid upscaling if image is smaller than 768px.
  });

  await fileRes.uploadStream(auth, resizedImageStream);
}
