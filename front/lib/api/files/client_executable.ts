import { getFileContent } from "@app/lib/api/files/utils";
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
            `${mimeType}: ${supportedExts}.`
        )
      );
    }

    const extension = `.${fileNameParts[fileNameParts.length - 1].toLowerCase()}`;
    if (!(fileFormat.exts as string[]).includes(extension)) {
      const supportedExts = fileFormat.exts.join(", ");
      return new Err(
        new Error(
          `File extension ${extension} is not supported for MIME type ${mimeType}. ` +
            `Supported extensions: ${supportedExts}.`
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

export async function editClientExecutableFile(
  auth: Authenticator,
  params: {
    fileId: string;
    oldString: string;
    newString: string;
    expectedReplacements?: number;
  }
): Promise<
  Result<{ fileResource: FileResource; replacementCount: number }, Error>
> {
  const { fileId, oldString, newString, expectedReplacements = 1 } = params;

  // Fetch the existing file.
  const fileContentResult = await getClientExecutableFileContent(auth, fileId);
  if (fileContentResult.isErr()) {
    return fileContentResult;
  }
  const { fileResource, content: currentContent } = fileContentResult.value;

  // Count occurrences of oldString.
  const regex = new RegExp(
    oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "g"
  );
  const matches = currentContent.match(regex);
  const occurrences = matches ? matches.length : 0;

  if (occurrences === 0) {
    return new Err(new Error(`String not found in file: "${oldString}"`));
  }

  if (occurrences !== expectedReplacements) {
    return new Err(
      new Error(
        `Expected ${expectedReplacements} replacements, but found ${occurrences} occurrences`
      )
    );
  }

  // Perform the replacement.
  const updatedContent = currentContent.replace(regex, newString);

  // Upload the updated content.
  await fileResource.uploadContent(auth, updatedContent);

  return new Ok({ fileResource, replacementCount: occurrences });
}

export async function getClientExecutableFileContent(
  auth: Authenticator,
  fileId: string
): Promise<Result<{ fileResource: FileResource; content: string }, Error>> {
  try {
    // Fetch the existing file.
    const fileResource = await FileResource.fetchById(auth, fileId);
    if (!fileResource) {
      return new Err(new Error(`File not found: ${fileId}`));
    }

    // Check if it's an interactive file.
    if (fileResource.contentType !== clientExecutableContentType) {
      return new Err(
        new Error(
          `File '${fileId}' is not an interactive content file ` +
            `(content type: ${fileResource.contentType})`
        )
      );
    }

    // Get the file content.
    const content = await getFileContent(auth, fileResource, "original");
    if (!content) {
      return new Err(new Error(`Failed to read content from file '${fileId}'`));
    }

    return new Ok({ fileResource, content });
  } catch (error) {
    return new Err(
      new Error(
        `Failed to retrieve file content for '${fileId}': ${normalizeError(error)}`
      )
    );
  }
}
