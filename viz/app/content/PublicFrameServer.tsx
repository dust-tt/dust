import { ClientFrameRenderer } from "@viz/app/content/ClientFrameRenderer";
import { extractFileIds } from "@viz/app/lib/parseFileIds";

export async function PublicFrameServer({
  identifier,
}: {
  identifier: string;
}) {
  // Extract token from identifier (e.g., "viz-{token}")
  const token = identifier.replace("viz-", "");

  try {
    // SERVER-SIDE: Fetch code from Dust
    const codeResponse = await fetch(
      `https://dust.tt/api/v1/internal/frames/${token}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.VIZ_API_SECRET}`,
        },
        cache: "no-store",
      }
    );

    if (!codeResponse.ok) {
      return <div>Frame not found</div>;
    }

    const { code, conversationId } = await codeResponse.json();

    // SERVER-SIDE: Extract fileIds from code
    const fileIds = extractFileIds(code);

    // SERVER-SIDE: Fetch all files
    const preFetchedFiles = await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const fileResponse = await fetch(
            `https://dust.tt/api/v1/public/frames/${conversationId}/files/${fileId}`,
            {
              // TODO: Add header.
              // headers: {
              //   Authorization: `Bearer ${process.env.VIZ_API_SECRET}`,
              // },
            }
          );

          if (!fileResponse.ok) {
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

    const validFiles = preFetchedFiles.filter((f) => f !== null);

    // Pass to Client Component.
    return <ClientFrameRenderer code={code} preFetchedFiles={validFiles} />;
  } catch (err) {
    console.error("Error loading public frame:", err);
    return <div>Error loading frame</div>;
  }
}
