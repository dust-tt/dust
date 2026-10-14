import type { ClientRequest, IncomingHttpHeaders, IncomingMessage } from "http";
import type { ServerOptions } from "https";
import https from "https";

// Development only. The Excel WebView on Mac does not load WorkOS's default AuthKit host
// (`*.authkit.app`), and an Office dialog does not load plain-HTTP pages (error 12003). Custom
// AuthKit domains are production-only, so in development every page of the sign-in goes through
// the dev server on `https://localhost`:
// - `/api`, `/sse` and `/mcp` go to the local Dust.
// - `WORKOS_API_PREFIX` goes to the WorkOS API (`auth-api.dust.tt`).
// - The AuthKit UI is mirrored at the root of `https://localhost:AUTHKIT_MIRROR_PORT`. It needs its
//   own origin because its pages use root-relative URLs (`/api/...`, `/sign-up`).
// Production does not need this: its AuthKit host is `signin.dust.tt`, which the WebView loads.

const DUST_API_PREFIXES = ["/api", "/sse", "/mcp"];

const WORKOS_API_ORIGIN = "https://auth-api.dust.tt";
const WORKOS_API_PREFIX = "/__wos";

export const AUTHKIT_MIRROR_PORT = 3015;

// Pairs of `[upstream origin, local origin]`.
type OriginRewrites = Array<[upstream: string, local: string]>;

const replaceOrigins = (
  value: string,
  rewrites: OriginRewrites,
  direction: "to_local" | "to_upstream"
) =>
  rewrites.reduce((acc, [upstream, local]) => {
    const [from, to] =
      direction === "to_local" ? [upstream, local] : [local, upstream];
    return acc.split(from).join(to);
  }, value);

/**
 * @cc [owner:Nils-Fedrigo,label:coding] sign-in-redirects-stay-on-localhost
 * Every `Location` header returned by a proxied sign-in host (Dust, the WorkOS API and AuthKit) MUST
 * have the upstream origins of `rewrites` replaced by their local origin, so the dialog never loads
 * `*.authkit.app` directly.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:security] sign-in-proxy-drops-hsts
 * Proxied responses MUST NOT carry `Strict-Transport-Security`: browsers apply it to the whole
 * `localhost` host, which would force the plain-HTTP local Dust (`http://localhost:3000`) to HTTPS.
 */
function rewriteResponseHeaders(
  headers: IncomingHttpHeaders,
  rewrites: OriginRewrites
): IncomingHttpHeaders {
  const {
    location,
    "set-cookie": cookies,
    "strict-transport-security": _hsts,
    ...rest
  } = headers;
  return {
    ...rest,
    ...(location
      ? { location: replaceOrigins(location, rewrites, "to_local") }
      : {}),
    // The upstream domain does not match `localhost`, so the browser would drop these cookies.
    ...(cookies
      ? {
          "set-cookie": cookies.map((cookie) =>
            cookie.replace(/;\s*Domain=[^;]*/i, "")
          ),
        }
      : {}),
  };
}

// The upstream checks `Origin` and `Referer` against its own origin (CSRF protection).
function restoreUpstreamOrigins(
  proxyReq: Pick<ClientRequest, "getHeader" | "setHeader">,
  rewrites: OriginRewrites
) {
  for (const name of ["origin", "referer"]) {
    const value = proxyReq.getHeader(name);
    if (typeof value === "string") {
      proxyReq.setHeader(name, replaceOrigins(value, rewrites, "to_upstream"));
    }
  }
}

function startAuthKitMirror({
  authKitOrigin,
  serverOptions,
  rewrites,
}: {
  authKitOrigin: string;
  serverOptions: ServerOptions;
  rewrites: OriginRewrites;
}) {
  const upstream = new URL(authKitOrigin);

  const server = https.createServer(serverOptions, (req, res) => {
    const proxyReq = https.request(
      {
        hostname: upstream.hostname,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: upstream.host },
      },
      (proxyRes) => {
        res.writeHead(
          proxyRes.statusCode ?? 502,
          rewriteResponseHeaders(proxyRes.headers, rewrites)
        );
        proxyRes.pipe(res);
      }
    );
    restoreUpstreamOrigins(proxyReq, rewrites);
    proxyReq.on("error", (err) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(
        `AuthKit mirror could not reach ${authKitOrigin}: ${err.message}`
      );
    });
    req.pipe(proxyReq);
  });

  server.on("error", (err) => {
    console.error(`AuthKit mirror failed on port ${AUTHKIT_MIRROR_PORT}:`, err);
  });
  server.listen(AUTHKIT_MIRROR_PORT, () => {
    console.log(
      `AuthKit mirror: https://localhost:${AUTHKIT_MIRROR_PORT} -> ${authKitOrigin}`
    );
  });
}

// Returns the dev server proxy entries, and a function that starts the AuthKit mirror with the dev
// server's certificate.
export function getSignInProxy({
  addInOrigin,
  dustUrl,
  authKitOrigin,
}: {
  addInOrigin: string;
  dustUrl: string;
  authKitOrigin: string;
}) {
  const rewrites: OriginRewrites = [
    [authKitOrigin, `https://localhost:${AUTHKIT_MIRROR_PORT}`],
    [WORKOS_API_ORIGIN, `${addInOrigin}${WORKOS_API_PREFIX}`],
  ];

  // http-proxy calls `onProxyRes` before it copies the headers of `proxyRes` to the response, so
  // replacing them there is the way to change the response headers. Only headers are changed:
  // `/sse` and `/mcp` stream their bodies.
  const onProxyRes = (proxyRes: IncomingMessage) => {
    proxyRes.headers = rewriteResponseHeaders(proxyRes.headers, rewrites);
  };

  const proxy = [
    {
      context: DUST_API_PREFIXES,
      target: dustUrl,
      changeOrigin: false,
      ws: true,
      onProxyRes,
    },
    {
      context: [WORKOS_API_PREFIX],
      target: WORKOS_API_ORIGIN,
      changeOrigin: true,
      pathRewrite: { [`^${WORKOS_API_PREFIX}`]: "" },
      onProxyReq: (proxyReq: ClientRequest) =>
        restoreUpstreamOrigins(proxyReq, rewrites),
      onProxyRes,
    },
  ];

  return {
    proxy,
    startAuthKitMirror: (serverOptions: ServerOptions) =>
      startAuthKitMirror({ authKitOrigin, serverOptions, rewrites }),
  };
}
