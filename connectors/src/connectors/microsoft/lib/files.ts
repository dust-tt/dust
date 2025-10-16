import type { LoggerInterface, Result } from "@dust-tt/client";
import { Err, normalizeError, Ok } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";

export async function getSharepointFileInfo(
  contentUrl: string,
  microsoftGraphClient: Client,
  logger: LoggerInterface
): Promise<
  Result<{ itemId: string; mimeType: string; siteId: string }, Error>
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
  const siteResponse = await microsoftGraphClient
    .api(`/sites/${tenant}.sharepoint.com:/sites/${siteName}`)
    .get();

  const siteId = siteResponse.id;
  if (!siteId) {
    return new Err(new Error("Could not get site ID from SharePoint URL"));
  }

  // Handle "Shared Documents" which is the default library name for Teams
  let filePath: string;
  if (remainingPath.startsWith("Shared Documents/")) {
    // Remove "Shared Documents/" prefix for default drive
    filePath = remainingPath.replace("Shared Documents/", "");
  } else {
    // For other document libraries, keep the full path
    filePath = remainingPath;
  }

  // URL decode the file path to handle spaces and special characters
  filePath = decodeURIComponent(filePath);

  logger.info(
    { siteId, filePath, siteName },
    "Attempting Graph API download with parsed SharePoint path"
  );

  // Get file metadata using the file path
  const fileItemResponse = await microsoftGraphClient
    .api(`/sites/${siteId}/drive/root:/${filePath}`)
    .get();
  const itemId = fileItemResponse?.id;

  const mimeType =
    fileItemResponse.file?.mimeType || "application/octet-stream";

  if (!itemId) {
    return new Err(new Error("Could not get file item ID from Graph API"));
  }

  return new Ok({ itemId, mimeType, siteId });
}

// Helper function to download a file from SharePoint/Teams URL using Microsoft Graph API
export async function downloadSharepointFile(
  itemId: string,
  siteId: string,
  microsoftGraphClient: Client
): Promise<Result<Buffer, Error>> {
  // Download the file content using the item ID
  const downloadApi = `/sites/${siteId}/drive/items/${itemId}/content`;

  try {
    // Get file content and handle Blob response
    const fileContentResponse = await microsoftGraphClient
      .api(downloadApi)
      .get();
    // Convert Blob to Buffer
    let fileContent: Buffer;
    if (fileContentResponse instanceof Blob) {
      const arrayBuffer = await fileContentResponse.arrayBuffer();
      fileContent = Buffer.from(arrayBuffer);
    } else {
      // Fallback for other response types
      fileContent = Buffer.from(fileContentResponse);
    }

    return new Ok(fileContent);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
