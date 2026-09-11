import fs from "fs";
import https from "https";

/**
 * A local HTTPS mirror of a sign-in host, served at its own origin.
 *
 * The Excel WebView refuses to load WorkOS's default AuthKit host, so the
 * sign-in page has to be reached through an origin it will load. Mirroring it
 * at the *root* of a dedicated port rather than under a path prefix on the
 * add-in's own origin is what makes this workable: the AuthKit app is a Next.js
 * app whose markup is full of root-relative URLs (`/apps/hosted-authkit/...`,
 * `/api/login`, `/sign-up`), and it builds more of them in JavaScript at
 * runtime. Under a prefix those would escape it and hit the dev server —
 * `/api/login` would even collide with the Dust API proxy. At a root, they
 * resolve correctly with no body rewriting at all.
 *
 * Only headers are touched: redirect targets are mapped back onto local
 * origins, `Set-Cookie` loses its upstream `Domain` so the browser keeps it for
 * this origin, and `Origin`/`Referer` are restored to the upstream so its CSRF
 * checks still pass. Bodies stream through untouched.
 *
 * Development only. Production reaches `signin.dust.tt` directly, which the
 * dialog loads.
 */
export interface SignInProxyOptions {
  /** Port to serve the mirror on. */
  port: number;
  /** Absolute origin being mirrored, e.g. `https://xyz.authkit.app`. */
  upstreamOrigin: string;
  /** Locally-trusted certificate, as used for the add-in's own dev server. */
  serverOptions: { key: Buffer; cert: Buffer; ca?: Buffer };
  /**
   * Absolute-origin substitutions applied to redirect targets, as
   * `[upstream, local]`. Also applied in reverse to outgoing
   * `Origin`/`Referer`.
   */
  rewrites: Array<[upstream: string, local: string]>;
}

const applyRewrites = (
  value: string,
  rewrites: Array<[string, string]>,
  reverse = false
): string =>
  rewrites.reduce((acc, [upstream, local]) => {
    const [from, to] = reverse ? [local, upstream] : [upstream, local];
    return acc.split(from).join(to);
  }, value);

export const startSignInProxy = ({
  port,
  upstreamOrigin,
  serverOptions,
  rewrites,
}: SignInProxyOptions): void => {
  const upstream = new URL(upstreamOrigin);

  const server = https.createServer(serverOptions, (req, res) => {
    const headers: Record<string, string | string[] | undefined> = {
      ...req.headers,
      host: upstream.host,
    };

    // The upstream validates these against itself.
    for (const header of ["origin", "referer"] as const) {
      const value = headers[header];
      if (typeof value === "string") {
        headers[header] = applyRewrites(value, rewrites, true);
      }
    }

    const proxyReq = https.request(
      {
        hostname: upstream.hostname,
        port: upstream.port || 443,
        method: req.method,
        path: req.url,
        headers,
        servername: upstream.hostname,
      },
      (proxyRes) => {
        const outgoing: Record<string, string | string[]> = {};

        for (const [name, value] of Object.entries(proxyRes.headers)) {
          if (value === undefined) {
            continue;
          }

          if (name === "location" && typeof value === "string") {
            outgoing[name] = applyRewrites(value, rewrites);
          } else if (name === "set-cookie") {
            // Node hands `set-cookie` over as an array, but the header map is
            // typed as either shape, so normalize rather than assert.
            const cookies = Array.isArray(value) ? value : [value];
            outgoing[name] = cookies.map((cookie) =>
              cookie.replace(/;\s*Domain=[^;]*/i, "")
            );
          } else {
            outgoing[name] = value;
          }
        }

        res.writeHead(proxyRes.statusCode ?? 502, outgoing);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", (error) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(
        `Sign-in proxy could not reach ${upstreamOrigin}: ${error.message}`
      );
    });

    req.pipe(proxyReq);
  });

  server.on("error", (error) => {
    console.error(`Sign-in proxy failed on port ${port}:`, error);
  });

  server.listen(port, () => {
    console.log(
      `\n🔐 Sign-in proxy: https://localhost:${port} → ${upstreamOrigin}\n`
    );
  });
};

/** Reads the same locally-trusted certificate the dev server uses. */
export const readDevCertificate = (
  certPath: string,
  keyPath: string
): { key: Buffer; cert: Buffer } | undefined => {
  try {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  } catch {
    return undefined;
  }
};
