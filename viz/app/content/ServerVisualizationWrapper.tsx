import { extractFileIds } from "@viz/app/lib/parseFileIds";
import type { PreFetchedFile } from "@viz/app/lib/data-apis/cache-data-api";
import { ServerVisualizationWrapperClient } from "@viz/app/content/ServerVisualizationWrapperClient";
import logger from "@viz/app/lib/logger";

interface ServerSideVisualizationWrapperProps {
  accessToken: string;
  allowedOrigins: string[];
  identifier: string;
  isFullHeight?: boolean;
}

/**
 * Server-side visualization wrapper for JWT-authenticated public frames
 *
 * This component runs on the server and:
 * 1. Pre-fetches visualization code using the JWT access token
 * 2. Extracts file IDs from the code and pre-fetches all referenced files
 * 3. Passes the pre-fetched plain data to the client wrapper
 *
 * This approach avoids the React Server Component serialization boundary issue
 * by passing plain objects instead of class instances to the client component.
 */
export async function ServerSideVisualizationWrapper({
  accessToken,
  allowedOrigins,
  identifier,
  isFullHeight = false,
}: ServerSideVisualizationWrapperProps) {
  let prefetchedCode: string | undefined;
  let preFetchedFiles: PreFetchedFile[] = [];

  try {
    const headers: Record<string, string> = {};

    // Retrieve content of the visualization using the access token.
    headers["Authorization"] = `Bearer ${accessToken}`;
    const endpoint = `${process.env.DUST_FRONT_API}/api/v1/viz/content`;

    const codeResponse = await fetch(endpoint, {
      headers,
      cache: "no-store",
    });

    if (codeResponse.ok) {
      const responseData = await codeResponse.json();
      prefetchedCode = responseData.content;

      if (!prefetchedCode) {
        logger.warn({ identifier }, "No code content found for visualization");
        prefetchedCode = undefined;

        return;
      }

      // SERVER-SIDE: Extract string literal fileIds from code.
      const fileIds = extractFileIds(prefetchedCode);

      if (fileIds.length > 0) {
        // SERVER-SIDE: Fetch all files.
        const fetchedFiles = await Promise.all(
          fileIds.map(async (fileId) => {
            try {
              const fileEndpoint = `${process.env.DUST_FRONT_API}/api/v1/viz/files/${fileId}`;

              const fileResponse = await fetch(fileEndpoint, {
                headers,
                cache: "no-store",
              });

              if (!fileResponse.ok) {
                logger.warn(
                  { fileId, status: fileResponse.status },
                  "Failed to fetch file"
                );
                return null;
              }

              const arrayBuffer = await fileResponse.arrayBuffer();
              const mimeType =
                fileResponse.headers.get("content-type") ||
                "application/octet-stream";

              return {
                data: Buffer.from(arrayBuffer).toString("base64"),
                fileId,
                mimeType,
              };
            } catch (err) {
              logger.error({ fileId }, "Failed to fetch file");
              return null;
            }
          })
        );

        preFetchedFiles = fetchedFiles.filter(
          (f): f is PreFetchedFile => f !== null
        );
      }
    } else {
      logger.warn(
        { identifier, status: codeResponse.status },
        "Failed to fetch code"
      );
    }
  } catch (err) {
    logger.error({ err }, "Error pre-fetching files:");
  }

  return (
    <ServerVisualizationWrapperClient
      allowedOrigins={allowedOrigins}
      identifier={identifier}
      isFullHeight={isFullHeight}
      prefetchedCode={prefetchedCode}
      prefetchedFiles={preFetchedFiles}
    />
  );
}
