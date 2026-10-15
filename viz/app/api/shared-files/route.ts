import logger from "@viz/app/lib/logger";
import type { FileRef } from "@viz/app/lib/parseFileRefs";
import { parseFileRefKey } from "@viz/app/lib/parseFileRefs";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The front-api files endpoint accepts the "conversation/" and "pod/" prefixes (and their canonical
 * "conversation-{id}/" / "pod-{id}/" forms), but not the legacy "project/" prefix, which older frame
 * code may still reference and which maps to the same Pod files. Package-relative refs
 * (`./data.csv`) are served under the synthetic `frame/` scope.
 */
function frontApiFilePath(ref: FileRef): string {
  switch (ref.type) {
    case "fileId":
      return ref.fileId;
    case "frameRelative":
      return `frame/${ref.relativePath}`;
    case "path":
      if (ref.scopedPath.startsWith("project/")) {
        logger.info(
          { scopedPath: ref.scopedPath },
          "Legacy project/ file scope referenced in frame"
        );
        return `pod/${ref.scopedPath.slice("project/".length)}`;
      }
      return ref.scopedPath;
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}

/**
 * @cc [owner:tdraier,label:security;performance] shared-file-relay
 * The upstream front-api request MUST carry only the caller's viz access token as credential. The
 * body MUST be streamed through without buffering, and the response MUST be served as an
 * attachment with `nosniff`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authorization = request.headers.get("authorization");
  const fileRefKey = request.nextUrl.searchParams.get("fileRef");
  const fileRef = fileRefKey ? parseFileRefKey(fileRefKey) : null;
  if (!authorization?.startsWith("Bearer ") || !fileRef) {
    return new Response(null, { status: 400 });
  }

  const filePath = frontApiFilePath(fileRef)
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  let upstream: Response;
  try {
    upstream = await fetch(
      `${process.env.DUST_FRONT_API}/api/v1/viz/files/${filePath}`,
      {
        headers: { Authorization: authorization },
        cache: "no-store",
      }
    );
  } catch (err) {
    logger.error({ err, fileRefKey }, "Failed to relay shared frame file");
    return new Response(null, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    logger.warn(
      { fileRefKey, statusCode: upstream.status },
      "Failed to fetch shared frame file"
    );
    await upstream.body?.cancel();
    return new Response(null, { status: upstream.ok ? 502 : upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": "attachment",
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Sandboxed Frames have an opaque origin, so the Authorization header triggers a preflight.
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Authorization",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
