import { VisualizationWrapperWithErrorBoundary } from "@viz/app/components/VisualizationWrapper";
import { extractFileIds } from "@viz/app/lib/parseFileIds";

interface PreFetchedFile {
  fileId: string;
  data: string; // base64
  mimeType: string;
}

export async function ServerVisualizationWrapper({
  identifier,
  allowedOrigins,
  isFullHeight = false,
}: {
  identifier: string;
  allowedOrigins: string[];
  isFullHeight?: boolean;
}) {
  // Extract share token from identifier if needed
  // Assuming identifier could be a share token or contain one
  const shareToken = identifier.startsWith("viz-")
    ? identifier.replace("viz-", "")
    : identifier;

  let preFetchedFiles: PreFetchedFile[] = [];

  try {
    // SERVER-SIDE: Fetch code from the public API
    const codeResponse = await fetch(
      `${
        process.env.DUST_API_URL || "http://localhost:3000"
      }/api/v1/public/frames/${shareToken}`,
      {
        cache: "no-store",
      }
    );

    console.log(">> Fetched code response for visualization:", codeResponse);

    if (codeResponse.ok) {
      const code = await codeResponse.json();

      console.log(">> code:", code);

      // SERVER-SIDE: Extract fileIds from code
      const fileIds = extractFileIds(code.content);

      if (fileIds.length > 0) {
        // SERVER-SIDE: Fetch all files
        const fetchedFiles = await Promise.all(
          fileIds.map(async (fileId) => {
            try {
              // Use the same file fetching endpoint pattern as PublicFrameServer
              const fileResponse = await fetch(
                `${
                  process.env.DUST_API_URL || "http://localhost:3000"
                }/api/v1/public/frames/${shareToken}/files/${fileId}`,
                {
                  cache: "no-store",
                }
              );

              if (!fileResponse.ok) {
                console.warn(
                  `Failed to fetch file ${fileId}: ${fileResponse.status}`
                );
                return null;
              }

              const arrayBuffer = await fileResponse.arrayBuffer();
              const mimeType =
                fileResponse.headers.get("content-type") ||
                "application/octet-stream";

              return {
                fileId,
                data: Buffer.from(arrayBuffer).toString("base64"),
                mimeType,
              };
            } catch (err) {
              console.error(`Failed to fetch file ${fileId}:`, err);
              return null;
            }
          })
        );

        preFetchedFiles = fetchedFiles.filter(
          (f): f is PreFetchedFile => f !== null
        );
        console.log(
          `Pre-fetched ${preFetchedFiles.length} files for visualization`
        );
      }
    } else {
      console.warn(
        `Failed to fetch code for ${shareToken}: ${codeResponse.status}`
      );
    }
  } catch (err) {
    console.error("Error pre-fetching files:", err);
    // Fall back to empty array - existing RPC system will handle file fetching
  }

  return (
    <VisualizationWrapperWithErrorBoundary
      identifier={identifier}
      allowedOrigins={allowedOrigins}
      isFullHeight={isFullHeight}
      prefetchedFiles={preFetchedFiles}
    />
  );
}
