// @ts-ignore This function only applies to NextAPIResponse
import type { NextApiResponse } from "next";

/**
 * Initialize SSE (Server-Sent Events) headers on a response.
 *
 * - `Content-Encoding: none` prevents Node/middleware from wrapping the response
 *   in a Gzip stream (which buffers data, defeating SSE's real-time purpose,
 *   and leaks ~285 KB of native zlib memory per connection).
 * - `X-Accel-Buffering: no` tells nginx/reverse proxies not to buffer.
 */
export function initSSEResponse(res: NextApiResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Content-Encoding": "none",
  });
  res.flushHeaders();
}
