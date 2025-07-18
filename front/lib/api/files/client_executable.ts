import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { InternalFileContentType, Result } from "@app/types";
import {
  INTERNAL_FILE_FORMATS,
  isInternalFileContentType,
  normalizeError,
} from "@app/types";
import { Err, Ok } from "@app/types";

export interface CreateClientExecutableFileParams {
  content: string;
  conversationId?: string;
  fileName: string;
  mimeType: InternalFileContentType;
}

export interface UpdateClientExecutableFileParams {
  content: string;
  fileId: string;
}

export async function createClientExecutableFile(
  auth: Authenticator,
  params: CreateClientExecutableFileParams
): Promise<Result<FileResource, Error>> {
  const { content, conversationId, fileName, mimeType } = params;

  try {
    const workspace = auth.getNonNullableWorkspace();

    // FIXME: Enforce that the mime type is client side executable.

    // Validate that the MIME type is supported.
    if (!isInternalFileContentType(mimeType)) {
      const supportedTypes = Object.keys(INTERNAL_FILE_FORMATS).join(", ");

      return new Err(
        new Error(
          `Unsupported MIME type: ${mimeType}. Supported types: ${supportedTypes}`
        )
      );
    }

    // Validate that the file extension matches the MIME type.
    const fileFormat = INTERNAL_FILE_FORMATS[mimeType];
    const fileNameParts = fileName.split(".");

    if (fileNameParts.length < 2) {
      const supportedExts = fileFormat.exts.join(", ");
      return new Err(
        new Error(
          `File name must include a valid extension. Supported extensions for ` +
            `${mimeType}: ${supportedExts}`
        )
      );
    }

    const extension = `.${fileNameParts[fileNameParts.length - 1].toLowerCase()}`;
    if (!fileFormat.exts.includes(extension)) {
      const supportedExts = fileFormat.exts.join(", ");
      return new Err(
        new Error(
          `File extension ${extension} is not supported for MIME type ${mimeType}. ` +
            `Supported extensions: ${supportedExts}`
        )
      );
    }

    // Create the file resource.
    const fileResource = await FileResource.makeNew({
      workspaceId: workspace.id,
      fileName,
      contentType: mimeType,
      fileSize: 0, // Will be updated in uploadContent.
      useCase: "conversation",
      useCaseMetadata: {
        conversationId,
      },
    });

    // Upload content directly.
    await fileResource.uploadContent(auth, content);

    return new Ok(fileResource);
  } catch (error) {
    return new Err(
      new Error(
        `Failed to create client executable file '${fileName}': ${normalizeError(error)}`
      )
    );
  }
}

export async function updateClientExecutableFile(
  auth: Authenticator,
  params: UpdateClientExecutableFileParams
): Promise<Result<FileResource, Error>> {
  const { fileId, content } = params;

  try {
    // Fetch the existing file.
    const fileResource = await FileResource.fetchById(auth, fileId);
    if (!fileResource) {
      return new Err(new Error(`File not found: ${fileId}`));
    }

    // Check if it's a file with an internal MIME type.
    if (!isInternalFileContentType(fileResource.contentType)) {
      return new Err(
        new Error(
          `File '${fileId}' is not a client executable file ` +
            `(content type: ${fileResource.contentType})`
        )
      );
    }

    // Upload new content directly.
    await fileResource.uploadContent(auth, content);

    return new Ok(fileResource);
  } catch (error) {
    return new Err(
      new Error(
        `Failed to update client executable file '${fileId}': ${normalizeError(error)}`
      )
    );
  }
}

// export function getSupportedClientExecutableMimeTypes(): Array<{
//   mimeType: InternalFileContentType;
//   description: string;
//   extensions: string[];
//   safeToDisplay: boolean;
// }> {
//   return Object.entries(INTERNAL_FILE_FORMATS).map(([mimeType, format]) => ({
//     mimeType: mimeType as InternalFileContentType,
//     description: `File category: ${format.cat}`,
//     extensions: format.exts,
//     safeToDisplay: format.isSafeToDisplay,
//   }));
// }
