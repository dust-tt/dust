import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

// Lazy so the front-api dependency graph doesn't load until callApi runs.
// In tests, vi.mock declarations in helpers (e.g. createPrivateApiMockRequest
// mocking getSession) only register when their file is imported; if honoApp
// loads first, workspaceAuth captures the un-mocked auth and requests 401.
async function getHonoApp() {
  const { honoApp } = await import("@dust-tt/front-api/app");
  return honoApp;
}

/**
 * Selects which implementation the helper invokes. Default is "next"
 * Set `TEST_HANDLER=hono` to run the same test body against the legacy Next handler
 * useful for parity checking during the migration.
 */
const TEST_HANDLER = (process.env.TEST_HANDLER ?? "next") as "hono" | "next";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiCallOptions {
  /** Route template, with `:name` placeholders. Same string for both modes. */
  route: string;
  /** Values to substitute into `:name` placeholders. */
  params?: Record<string, string>;
  method?: Method;
  /** Extra query parameters (added to the URL in Hono mode, to req.query in Next mode). */
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Shorthand for `headers.authorization = "Bearer <token>"`. */
  bearerToken?: string;
  /** Next handler imported from the corresponding pages/api/... file. */
  nextHandler: NextApiHandler;
}

export interface ApiCallResult {
  status: number;
  body: any;
}

function buildPath(route: string, params: Record<string, string> = {}): string {
  let path = route;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }
  return path;
}

/**
 * Invokes an API endpoint via either Hono (default) or the legacy Next
 * handler, depending on `TEST_HANDLER`. The test body is identical in both
 * modes — only the dispatch differs.
 *
 * In Next mode, `nextHandler` is called with mocked req/res; path params are
 * passed via `req.query` (matching Next.js convention).
 *
 * In Hono mode, `honoApp.request(...)` is called with the substituted URL;
 * path params end up in `c.req.param(...)`.
 */
export async function callApi({
  route,
  params = {},
  method = "GET",
  query,
  body,
  headers,
  bearerToken,
  nextHandler,
}: ApiCallOptions): Promise<ApiCallResult> {
  const path = buildPath(route, params);
  const allHeaders: Record<string, string> = {
    ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
    ...headers,
  };

  if (TEST_HANDLER === "hono") {
    const url = query
      ? `${path}?${new URLSearchParams(query).toString()}`
      : path;
    const honoApp = await getHonoApp();
    const response = await honoApp.request(url, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...allHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let parsed: any;
    const text = await response.text();
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  }

  // Next mode.
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    url: path,
    query: { ...params, ...query },
    headers: allHeaders,
    body,
  });
  await nextHandler(req, res);
  return {
    status: res._getStatusCode(),
    body: res._getJSONData(),
  };
}
