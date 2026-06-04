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

  const remoteAddress = getConnInfo(c).remote.address;

  return getClientIp({ headers, socket: { remoteAddress } });
}
