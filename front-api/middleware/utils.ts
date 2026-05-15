import type { Context } from "hono";
import type { NextApiRequest, NextApiResponse } from "next";

export function parseCookieHeader(
  header: string | undefined
): Record<string, string> {
  if (!header) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    cookies[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return cookies;
}

// Bridge a Hono Context to the minimal NextApiRequest/NextApiResponse shape
// required by the existing auth helpers (which read req.cookies/req.headers
// and call res.setHeader to refresh the workos_session cookie).
export function buildNextLikeReqRes(c: Context): {
  req: NextApiRequest;
  res: NextApiResponse;
  setCookies: string[];
} {
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const cookies = parseCookieHeader(headers.cookie);
  const setCookies: string[] = [];

  const req = {
    cookies,
    headers,
    query: {},
    socket: { remoteAddress: undefined },
    method: c.req.method,
    url: c.req.url,
  };

  const res = {
    setHeader: (name: string, value: string | string[]) => {
      if (name.toLowerCase() === "set-cookie") {
        if (Array.isArray(value)) {
          setCookies.push(...value);
        } else {
          setCookies.push(value);
        }
      }
    },
  };

  return {
    req: req as unknown as NextApiRequest,
    res: res as unknown as NextApiResponse,
    setCookies,
  };
}
