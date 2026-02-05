import type { DustAPI } from "../index";
import type { APIError, SupportedFileContentType } from "../types";
import { apiErrorToDustError, DustUnknownError } from "../errors";
import type { AttachmentInput, FileInfo } from "./types";
import { isFileIdAttachment, isFilePathAttachment } from "./types";

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

    const fileObj = file as File | Blob;
    const fileName =
      fileObj instanceof File ? fileObj.name : `upload-${Date.now()}`;

    const result = await this._client.uploadFile({
      contentType: (fileObj.type ||
        "application/octet-stream") as SupportedFileContentType,
      fileName,
      fileSize: fileObj.size,
      useCase: "conversation",
      fileObject: fileObj as File,
    });

    if (result.isErr()) {
      if (result.error instanceof Error) {
        throw result.error;
      }
      throw apiErrorToDustError(result.error);
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

    if (result === undefined) {
      throw new DustUnknownError("Download failed: no response received");
    }

    if (result.isErr()) {
      if (result.error instanceof Error) {
        throw new DustUnknownError(result.error.message, {
          cause: result.error,
        });
      }
      throw apiErrorToDustError(result.error as APIError);
    }

    return result.value;
  }
}
