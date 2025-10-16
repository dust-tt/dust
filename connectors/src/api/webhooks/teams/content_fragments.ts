import type {
  DustAPI,
  PublicPostContentFragmentRequestBody,
  Result,
  SupportedFileContentType,
} from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { ChatMessageAttachment } from "@microsoft/microsoft-graph-types";
import axios from "axios";

import {
  downloadSharepointFile,
  getSharepointFileInfo,
} from "@connectors/connectors/microsoft/lib/files";
import logger from "@connectors/logger/logger";

import { getTenantSpecificToken } from "./bot_messaging_utils";

const MAX_FILE_SIZE_TO_UPLOAD = 10 * 1024 * 1024; // 10 MB

/**
 * Download Teams attachment using Bot Framework authentication
 * Used for direct Teams attachments (smba.trafficmanager.net URLs)
 */
export async function downloadTeamsAttachment(
  attachmentUrl: string
): Promise<Result<Buffer, Error>> {
  const token = await getTenantSpecificToken();
  if (!token) {
    return new Err(new Error("Cannot download attachment - no valid token"));
  }

  const response = await axios.get(attachmentUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Microsoft-BotFramework/3.1",
    },
    responseType: "arraybuffer",
    timeout: 30000,
  });

  if (response.status !== 200) {
    return new Err(
      new Error(
        `Failed to download attachment: ${response.status} ${response.statusText}`
      )
    );
  }

  const buffer = Buffer.from(response.data);
  logger.info(
    {
      attachmentUrl,
      fileSize: buffer.length,
      statusCode: response.status,
    },
    "Teams attachment downloaded successfully"
  );

  return new Ok(buffer);
}

// Helper function to process and upload file attachments
export async function processFileAttachments(
  attachments: ChatMessageAttachment[],
  dustAPI: DustAPI,
  microsoftGraphClient: Client
): Promise<PublicPostContentFragmentRequestBody[]> {
  const contentFragments: PublicPostContentFragmentRequestBody[] = [];

  for (const attachment of attachments) {
    let fileName = attachment.name || "teams_file";

    // Determine the actual content type for the file
    let actualContentType: string = "application/octet-stream";
    if (attachment.contentType === "reference") {
      // For Teams reference attachments, get MIME type from file extension
      const fileExtension = fileName.split(".").pop()?.toLowerCase();
      // actualContentType =
      //   getFileTypeFromExtension(fileExtension) || "application/octet-stream";
      logger.info(
        {
          fileName,
          fileExtension,
          contentUrl: attachment.contentUrl,
        },
        `Processing Teams reference attachment`
      );
    } else {
      actualContentType = attachment.contentType || "application/octet-stream";
    }

    let fileContent: Buffer | null = null;

    if (attachment.contentType === "reference" && attachment.contentUrl) {
      // For SharePoint/OneDrive files, use Microsoft Graph API approach
      logger.info(
        { fileName, contentUrl: attachment.contentUrl },
        "Downloading Teams reference file using Microsoft Graph API"
      );

      const sharepointFileInfoRes = await getSharepointFileInfo(
        attachment.contentUrl,
        microsoftGraphClient,
        logger
      );

      if (sharepointFileInfoRes.isErr()) {
        logger.warn(
          {
            fileName,
            error: sharepointFileInfoRes.error,
            contentUrl: attachment.contentUrl,
          },
          "Failed to get Sharepoint file info"
        );
        continue;
      }

      const { itemId, mimeType, siteId } = sharepointFileInfoRes.value;

      const downloadResult = await downloadSharepointFile(
        itemId,
        siteId,
        microsoftGraphClient,
        logger
      );

      if (downloadResult.isErr()) {
        logger.warn(
          {
            fileName,
            error: downloadResult.error,
            contentUrl: attachment.contentUrl,
          },
          "Failed to download SharePoint file"
        );
        continue;
      }

      fileContent = downloadResult.value;
      actualContentType = mimeType;
    } else if (attachment.contentUrl) {
      // For direct file attachments, use Bot Framework authentication
      logger.info(
        { fileName, contentUrl: attachment },
        "Downloading direct Teams file attachment"
      );

      const downloadResult = await downloadTeamsAttachment(
        attachment.contentUrl
      );
      if (downloadResult.isErr()) {
        logger.warn(
          {
            fileName,
            error: downloadResult.error,
            contentUrl: attachment.contentUrl,
          },
          "Failed to download Teams file attachment"
        );
        continue;
      }

      fileContent = downloadResult.value;

      // Add proper file extension based on detected file type
      const { fileTypeFromBuffer } = await import("file-type");
      const fileType = await fileTypeFromBuffer(new Uint8Array(fileContent));
      actualContentType = fileType?.mime || "application/octet-stream";

      if (
        fileType?.ext &&
        !fileName.toLowerCase().endsWith(`.${fileType.ext}`)
      ) {
        fileName = fileName + `.${fileType.ext}`;
        logger.info(
          {
            originalFileName: attachment.name || "teams_file",
            newFileName: fileName,
            detectedExtension: fileType.ext,
          },
          "Added file extension based on detected file type"
        );
      }

      logger.info(
        {
          fileName,
          detectedContentType: actualContentType,
          originalContentType: attachment.contentType,
          fileSize: fileContent.length,
        },
        "Successfully downloaded and analyzed direct Teams file attachment"
      );
    } else {
      // Check if this is an HTML content attachment (inline content, not a file)
      if (attachment.contentType === "text/html" || !attachment.contentUrl) {
        logger.debug(
          {
            fileName,
            contentType: attachment.contentType,
            hasContentUrl: !!attachment.contentUrl,
          },
          "Skipping non-file attachment (HTML content or no URL)"
        );
        continue;
      }

      logger.warn(
        { fileName, attachment },
        "Teams attachment has unknown type, skipping"
      );
      continue;
    }

    // Check if fileContent was successfully downloaded
    if (!fileContent || fileContent.length === 0) {
      logger.warn(
        {
          fileName,
          fileContentExists: !!fileContent,
          fileSize: fileContent?.length || 0,
        },
        "File content is null or empty, skipping Teams file attachment"
      );
      continue;
    }

    if (fileContent.length > MAX_FILE_SIZE_TO_UPLOAD) {
      logger.warn(
        {
          fileName,
          fileSize: fileContent.length,
          maxSize: MAX_FILE_SIZE_TO_UPLOAD,
        },
        "Teams file attachment too large"
      );
      continue;
    }

    // Log the content type for debugging but proceed with upload
    logger.info(
      { fileName, actualContentType, fileSize: fileContent.length },
      "Preparing Teams file attachment for Dust upload"
    );

    // Create file object with proper buffer handling
    let fileObject: File;
    try {
      // Ensure we have a proper Uint8Array for the File constructor
      const uint8Array = new Uint8Array(fileContent);
      fileObject = new File([uint8Array], fileName, {
        type: actualContentType,
      });
    } catch (fileCreationError) {
      logger.error(
        {
          fileName,
          error: fileCreationError,
          fileContentLength: fileContent.length,
        },
        "Failed to create File object"
      );
      continue;
    }

    // Prepare upload parameters
    // Note: useCaseMetadata with conversationId was causing "File not found" errors
    // so we omit it for now to ensure successful uploads
    const uploadParams = {
      contentType: actualContentType as SupportedFileContentType,
      fileName,
      fileSize: fileContent.length,
      useCase: "conversation" as const,
      fileObject,
    };

    logger.info(
      {
        fileName,
        contentType: uploadParams.contentType,
        fileSize: uploadParams.fileSize,
        useCase: uploadParams.useCase,
      },
      "Uploading Teams file attachment to Dust"
    );

    const fileRes = await dustAPI.uploadFile(uploadParams);

    if (fileRes.isOk()) {
      contentFragments.push({
        title: fileName,
        url: fileRes.value.publicUrl,
        fileId: fileRes.value.sId,
        context: null,
      });
      logger.info(
        { fileName, actualContentType, fileId: fileRes.value.sId },
        "Successfully uploaded Teams file attachment"
      );
    } else {
      logger.error(
        { fileName, error: fileRes.error },
        "Failed to upload Teams file attachment to Dust"
      );
    }
  }

  return contentFragments;
}
