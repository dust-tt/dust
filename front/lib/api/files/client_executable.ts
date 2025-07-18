import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { InteractiveFileContentType, Result } from "@app/types";
import {
  clientExecutableContentType,
  INTERACTIVE_FILE_FORMATS,
  normalizeError,
} from "@app/types";
import { Err, Ok } from "@app/types";

export async function createClientExecutableFile(
  auth: Authenticator,
  params: {
    content: string;
    conversationId: string;
    fileName: string;
    mimeType: InteractiveFileContentType;
  }
): Promise<Result<FileResource, Error>> {
  const { content, conversationId, fileName, mimeType } = params;

  try {
    const workspace = auth.getNonNullableWorkspace();

    // Validate that the MIME type is supported.
    if (mimeType !== clientExecutableContentType) {
      const supportedTypes = Object.keys(INTERACTIVE_FILE_FORMATS).join(", ");

      return new Err(
        new Error(
          `Unsupported MIME type: ${mimeType}. Supported types: ${supportedTypes}`
        )
      );
    }

    // Validate that the file extension matches the MIME type.
    const fileFormat = INTERACTIVE_FILE_FORMATS[mimeType];
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
    if (!(fileFormat.exts as string[]).includes(extension)) {
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
      // Attach the conversation id so we can use it to control access to the file.
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
  params: {
    content: string;
    fileId: string;
  }
): Promise<Result<FileResource, Error>> {
  const { fileId, content } = params;

  try {
    // Fetch the existing file.
    const fileResource = await FileResource.fetchById(auth, fileId);
    if (!fileResource) {
      return new Err(new Error(`File not found: ${fileId}`));
    }

    // Check if it's a file with an internal MIME type.
    if (fileResource.contentType !== clientExecutableContentType) {
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
