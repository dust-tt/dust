import { apiErrorToDustError, DustUnknownError } from "../errors";
import type { DustAPI } from "../index";
import { APIErrorSchema, isSupportedFileContentType } from "../types";
import type { AttachmentInput, FileInfo } from "./types";
import {
  isBlobAttachment,
  isFileIdAttachment,
  isFilePathAttachment,
} from "./types";

function toFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, {
    type: blob.type || "application/octet-stream",
  });
}

export class FilesAPI {
  private _client: DustAPI;

  constructor(client: DustAPI) {
    this._client = client;
  }

  async upload(file: AttachmentInput): Promise<FileInfo> {
    if (isFileIdAttachment(file)) {
      return {
        id: file.fileId,
        name: "Unknown",
        contentType: "application/octet-stream",
        size: 0,
        uploadedAt: Date.now(),
      };
    }

    if (isFilePathAttachment(file)) {
      throw new Error(
        "File path uploads are not yet supported. Please pass a File or Blob object."
      );
    }

    if (!isBlobAttachment(file)) {
      throw new Error("Invalid attachment type");
    }

    const fileObj =
      file instanceof File ? file : toFile(file, `upload-${Date.now()}`);
    const contentType = fileObj.type || "application/octet-stream";

    const result = await this._client.uploadFile({
      contentType: isSupportedFileContentType(contentType)
        ? contentType
        : "application/octet-stream",
      fileName: fileObj.name,
      fileSize: fileObj.size,
      useCase: "conversation",
      fileObject: fileObj,
    });

    if (result.isErr()) {
      throw result.error instanceof Error
        ? result.error
        : apiErrorToDustError(result.error);
    }

    const uploadedFile = result.value;
    return {
      id: uploadedFile.sId,
      name: uploadedFile.fileName,
      contentType: uploadedFile.contentType,
      size: uploadedFile.fileSize,
      uploadedAt: uploadedFile.createdAt ?? Date.now(),
    };
  }

  async delete(fileId: string): Promise<void> {
    const result = await this._client.deleteFile({ fileID: fileId });

    if (result.isErr()) {
      throw apiErrorToDustError(result.error);
    }
  }

  async download(fileId: string): Promise<Buffer> {
    const result = await this._client.downloadFile({ fileID: fileId });

    if (!result) {
      throw new DustUnknownError("Download failed: no response received");
    }

    if (result.isErr()) {
      if (result.error instanceof Error) {
        throw new DustUnknownError(result.error.message, {
          cause: result.error,
        });
      }
      const parsed = APIErrorSchema.safeParse(result.error);
      if (parsed.success) {
        throw apiErrorToDustError(parsed.data);
      }
      const message =
        "message" in result.error && typeof result.error.message === "string"
          ? result.error.message
          : "Download failed with unknown error";
      throw new DustUnknownError(message);
    }

    return result.value;
  }
}
