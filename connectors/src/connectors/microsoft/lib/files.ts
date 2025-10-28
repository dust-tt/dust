import type { LoggerInterface, Result } from "@dust-tt/client";
import { Err, normalizeError, Ok } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { DriveItem } from "@microsoft/microsoft-graph-types";

import { clientApiGet } from "@connectors/connectors/microsoft/lib/graph_api";

export async function getSharepointFileInfo(
  contentUrl: string,
  microsoftGraphClient: Client,
  logger: LoggerInterface
): Promise<
  Result<
    { itemId: string; mimeType: string; siteId: string; driveId: string },
    Error
  >
> {
  // Parse the SharePoint URL to extract the file path
  // Expected format: https://tenant.sharepoint.com/sites/site/library/path/to/file
  const sharepointMatch = contentUrl.match(
    /https:\/\/([^.]+)\.sharepoint\.com\/sites\/([^/]+)\/(.+)/
  );

  if (!sharepointMatch) {
    return new Err(
      new Error("Could not parse SharePoint URL for Graph API access")
    );
  }

  const [, tenant, siteName, remainingPath] = sharepointMatch;

  if (!remainingPath) {
    return new Err(
      new Error("Could not extract file path from SharePoint URL")
    );
  }

  // Get the site ID from SharePoint
  const siteResponse = await clientApiGet(
    logger,
    microsoftGraphClient,
    `/sites/${tenant}.sharepoint.com:/sites/${siteName}`
  );

  const siteId = siteResponse.id;
  if (!siteId) {
    return new Err(new Error("Could not get site ID from SharePoint URL"));
  }

  // Parse the path to identify document library and file path
  const pathParts = remainingPath.split("/");
  const driveName = decodeURIComponent(pathParts[0] ?? "Shared Documents");
  const filePath = decodeURIComponent(pathParts.slice(1).join("/"));

  logger.info(
    { siteId, driveName, filePath, siteName, tenant },
    "Parsing SharePoint path for document library access"
  );

  // Get all drives for the site to find the correct drive ID
  let driveId: string;

  if (driveName === "Shared Documents") {
    // Use default drive for "Shared Documents"
    driveId = "default";
  } else {
    if (!driveName) {
      return new Err(
        new Error("Could not extract library name from SharePoint URL")
      );
    }
    // Find the specific drive for other document libraries
    const drivesResponse = await clientApiGet(
      logger,
      microsoftGraphClient,
      `/sites/${siteId}/drives`
    );

    const targetDrive = drivesResponse.value.find(
      (drive: DriveItem) => drive.name === driveName
    );

    if (!targetDrive) {
      return new Err(
        new Error(`Document library '${driveName}' not found in site drives`)
      );
    }

    driveId = targetDrive.id;

    logger.info(
      { libraryName: driveName, driveId, filePath },
      "Found matching drive for document library"
    );
  }

  // URL decode and re-encode the file path properly
  const encodedPath = filePath
    .split("/")
    .map((component) => encodeURIComponent(component))
    .join("/");

  // Access the file using the correct drive ID
  const endpoint =
    driveId === "default"
      ? `/sites/${siteId}/drive/root:/${encodedPath}`
      : `/sites/${siteId}/drives/${driveId}/root:/${encodedPath}`;

  logger.info(
    { endpoint, driveId, encodedPath },
    "Attempting to access file with correct drive ID"
  );

  const fileItemResponse = await clientApiGet(
    logger,
    microsoftGraphClient,
    endpoint
  );
  const itemId = fileItemResponse?.id;

  if (!itemId) {
    return new Err(new Error("Could not get file item ID from Graph API"));
  }

  const mimeType =
    fileItemResponse.file?.mimeType || "application/octet-stream";

  return new Ok({ itemId, mimeType, siteId, driveId });
}

// Helper function to download a file from SharePoint/Teams URL using Microsoft Graph API
export async function downloadSharepointFile(
  itemId: string,
  siteId: string,
  driveId: string,
  microsoftGraphClient: Client,
  logger: LoggerInterface
): Promise<Result<Buffer, Error>> {
  // Download the file content using the item ID
  try {
    // Use the correct drive endpoint - default vs specific drive
    const endpoint =
      driveId === "default"
        ? `/sites/${siteId}/drive/items/${itemId}/content`
        : `/sites/${siteId}/drives/${driveId}/items/${itemId}/content`;

    logger.info(
      { endpoint, itemId, driveId },
      "Downloading file content from SharePoint"
    );

    // Get file content and handle Blob response
    const fileContentResponse = await clientApiGet(
      logger,
      microsoftGraphClient,
      endpoint
    );
    // Convert response to Buffer - handle different response types
    let fileContent: Buffer;
    if (fileContentResponse instanceof Blob) {
      const arrayBuffer = await fileContentResponse.arrayBuffer();
      fileContent = Buffer.from(arrayBuffer);
    } else if (fileContentResponse instanceof ReadableStream) {
      // Handle ReadableStream response
      const reader = fileContentResponse.getReader();
      const chunks: Uint8Array[] = [];

      try {
        let result = await reader.read();
        while (!result.done) {
          chunks.push(result.value);
          result = await reader.read();
        }

        // Combine all chunks into a single buffer
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0
        );
        const combinedArray = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          combinedArray.set(chunk, offset);
          offset += chunk.length;
        }

        fileContent = Buffer.from(combinedArray);
      } finally {
        reader.releaseLock();
      }
    } else if (Buffer.isBuffer(fileContentResponse)) {
      fileContent = fileContentResponse;
    } else {
      // Last resort: try to convert to Buffer
      fileContent = Buffer.from(fileContentResponse);
    }

    return new Ok(fileContent);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
