import { getClientIp } from "@app/lib/utils/request";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

// Resolves the client IP for a Hono request. Prefers Cloudflare/forwarded
// headers, falling back to the underlying socket's remote address (exposed by
// the Node server adapter) so internal pod-to-pod requests still log a real IP
// instead of "internal".
export function getClientIpFromContext(c: Context): string {
  const headers: Record<string, string | string[] | undefined> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return getClientIp({
    headers,
    socket: { remoteAddress: getRemoteAddress(c) },
  });
}

// `getConnInfo` reads the Node server bindings off `c.env`, which only exist
// when the app runs through the `@hono/node-server` adapter. Under
// `honoApp.request(...)` (tests, plain fetch) those bindings are absent and it
// throws, so we guard the external call and fall back to no socket address.
function getRemoteAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}
