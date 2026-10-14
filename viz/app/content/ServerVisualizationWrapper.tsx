import { ServerVisualizationWrapperClient } from "@viz/app/content/ServerVisualizationWrapperClient";
import { concurrentExecutor } from "@viz/app/lib/async_utils";
import type { PreFetchedFile } from "@viz/app/lib/data-apis/cache-data-api";
import type { VizCatalog } from "@viz/app/lib/i18n/catalogs";
import logger from "@viz/app/lib/logger";
import { extractFileRefs } from "@viz/app/lib/parseFileRefs";

const FRAME_MIME_TYPES = new Set([
  "application/vnd.dust.frame",
  "application/vnd.dust.frame.slideshow",
]);

const MAX_PREFETCHED_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PREFETCHED_TOTAL_BYTES = 50 * 1024 * 1024;
const PREFETCH_CONCURRENCY = 4;

/**
 * @cc [owner:tdraier,label:performance] prefetch-size-budget
 * A single render MUST NOT buffer more than `MAX_PREFETCHED_FILE_BYTES` for one file nor more than
 * `MAX_PREFETCHED_TOTAL_BYTES` across all fetched files, including nested frames. A file exceeding
 * either limit MUST be skipped (left out of the returned files) and its body read aborted, rather
 * than failing the render.
 */
async function prefetchFileRefs(
  code: string,
  frontApiUrl: string,
  headers: Record<string, string>,
  identifier: string
): Promise<PreFetchedFile[]> {
  const visited = new Set<string>();
  let remainingBytes = MAX_PREFETCHED_TOTAL_BYTES;

  async function readBodyWithinBudget(
    response: Response
  ): Promise<Buffer | null> {
    const declaredBytes = Number(response.headers.get("content-length"));
    if (
      declaredBytes > MAX_PREFETCHED_FILE_BYTES ||
      declaredBytes > remainingBytes
    ) {
      await response.body?.cancel();
      return null;
    }
    if (!response.body) {
      return Buffer.alloc(0);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let readBytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return Buffer.concat(chunks);
      }
      readBytes += value.byteLength;
      remainingBytes -= value.byteLength;
      if (readBytes > MAX_PREFETCHED_FILE_BYTES || remainingBytes < 0) {
        remainingBytes += readBytes;
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }

  async function fetchRefs(text: string): Promise<PreFetchedFile[]> {
    const refs = extractFileRefs(text);
    const results: PreFetchedFile[] = [];

    await concurrentExecutor(
      refs,
      async (ref) => {
        // The files endpoint accepts the "conversation/" and "pod/" prefixes (and
        // their canonical "conversation-{id}/" / "pod-{id}/" forms), but not the
        // legacy "project/" prefix, which older frame code may still reference and
        // which maps to the same Pod files. Rewrite only the request path; the
        // prefetched file stays keyed by the original scopedPath (`key`) so the
        // frame's useFile("project/...") lookup still resolves.
        // Package-relative refs (`./data.csv`) are fetched under the synthetic
        // `frame/` scope and keyed as `./…` for useFile lookup.
        let requestPath: string;
        let key: string;
        if (ref.type === "fileId") {
          key = ref.fileId;
          requestPath = ref.fileId;
        } else if (ref.type === "frameRelative") {
          key = `./${ref.relativePath}`;
          requestPath = `frame/${ref.relativePath}`;
        } else if (ref.scopedPath.startsWith("project/")) {
          logger.info(
            { scopedPath: ref.scopedPath },
            "Legacy project/ file scope referenced in frame"
          );
          key = ref.scopedPath;
          requestPath = `pod/${ref.scopedPath.slice("project/".length)}`;
        } else {
          key = ref.scopedPath;
          requestPath = ref.scopedPath;
        }

        if (visited.has(key)) {
          return;
        }
        visited.add(key);

        const fileEndpoint = `${frontApiUrl}/api/v1/viz/files/${requestPath}`;

        try {
          const fileResponse = await fetch(fileEndpoint, {
            headers,
            cache: "no-store",
          });

          if (!fileResponse.ok) {
            logger.warn(
              { key, statusCode: fileResponse.status },
              "Failed to fetch file ref"
            );
            return;
          }

          const body = await readBodyWithinBudget(fileResponse);
          if (!body) {
            logger.warn(
              {
                identifier,
                key,
                contentLength: fileResponse.headers.get("content-length"),
              },
              "Skipped prefetching file ref over size budget"
            );
            return;
          }

          const mimeType =
            fileResponse.headers.get("content-type") ||
            "application/octet-stream";

          results.push({
            data: body.toString("base64"),
            fileId: key,
            mimeType,
          });

          // Recursively fetch refs from nested frames.
          if (FRAME_MIME_TYPES.has(mimeType)) {
            results.push(...(await fetchRefs(body.toString("utf-8"))));
          }
        } catch (_err) {
          logger.error({ key }, "Failed to fetch file ref");
        }
      },
      { concurrency: PREFETCH_CONCURRENCY }
    );

    return results;
  }

  return fetchRefs(code);
}

interface ServerSideVisualizationWrapperProps {
  accessToken: string;
  allowedOrigins: string[];
  identifier: string;
  isFullHeight?: boolean;
  isPdfMode?: boolean;
  catalog: VizCatalog;
}

/**
 * Server-side visualization wrapper for JWT-authenticated public frames
 *
 * This component runs on the server and:
 * 1. Pre-fetches visualization code using the JWT access token
 * 2. Extracts file refs from the code and pre-fetches all referenced files
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
  isPdfMode = false,
  catalog,
}: ServerSideVisualizationWrapperProps) {
  let prefetchedCode: string | undefined;
  let preFetchedFiles: PreFetchedFile[] = [];
  let isAuthenticatedMember = false;

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
      isAuthenticatedMember = responseData.isAuthenticatedMember ?? false;

      if (!prefetchedCode) {
        logger.warn({ identifier }, "No code content found for visualization");
        prefetchedCode = undefined;

        return;
      }

      // SERVER-SIDE: Recursively fetch all file refs (including nested frame imports).
      preFetchedFiles = await prefetchFileRefs(
        prefetchedCode,
        process.env.DUST_FRONT_API ?? "",
        headers,
        identifier
      );
    } else {
      logger.warn(
        { identifier, statusCode: codeResponse.status },
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
      isPdfMode={isPdfMode}
      prefetchedCode={prefetchedCode}
      prefetchedFiles={preFetchedFiles}
      isAuthenticatedMember={isAuthenticatedMember}
      catalog={catalog}
    />
  );
}
