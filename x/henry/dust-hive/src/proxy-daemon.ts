#!/usr/bin/env bun
// HTTP proxy daemon - the public entry point for a hive env.
//
// Usage: bun run proxy-daemon.ts <listen-port> <front-api-port> <marketing-port>
//
// Routing:
//   /__hive/healthz → 200 ok (proxy's own health)
//   /m/api/*        → marketing (Next.js dev server, internally rewrites to /api/*)
//   /api/*          → front-api (Hono+Next hybrid)
//   *               → marketing
//
// WebSocket upgrades are forwarded to the same target the HTTP routing would
// pick, so Next.js HMR keeps working through the proxy.
//
// Hostname: we use "localhost" both for listen and upstream. node-server (used
// by front-api) and Next dev bind to "localhost" by default, and on Node 17+
// macOS that's IPv6-only (::1) — picking "localhost" everywhere makes the OS
// resolve both ends the same way.

import type { ServerWebSocket } from "bun";

import { logger } from "./lib/logger";

type Target = "front-api" | "marketing";

// Declarative routing table: first matching pattern wins. Patterns are anchored
// regexes so they describe the full pathname — `^/api(/.*)?$` matches `/api`,
// `/api/`, `/api/x` but NOT `/apidocs`. Order matters: more specific patterns
// (e.g. `/m/api/*`) must come before less specific ones (e.g. `/api/*`).
const ROUTES: ReadonlyArray<{ pattern: RegExp; target: Target }> = [
  { pattern: /^\/m\/api(\/.*)?$/, target: "marketing" }, // /m/api/*
  { pattern: /^\/api(\/.*)?$/, target: "front-api" }, //   /api/*
  { pattern: /^\/oauth(\/.*)?$/, target: "front-api" }, // /oauth/*
];

const DEFAULT_TARGET: Target = "marketing";

export function routeFor(pathname: string): Target {
  for (const { pattern, target } of ROUTES) {
    if (pattern.test(pathname)) {
      return target;
    }
  }
  return DEFAULT_TARGET;
}

function parsePort(value: string | undefined, label: string): number {
  if (value === undefined) {
    logger.error("Usage: proxy-daemon.ts <listen-port> <front-api-port> <marketing-port>");
    process.exit(1);
  }
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) {
    logger.error(`Invalid ${label}: ${value}`);
    process.exit(1);
  }
  return n;
}

// Hop-by-hop headers (RFC 7230 §6.1) must not be forwarded. On top of that:
// - drop `host` from the request so fetch sets it correctly for the upstream;
// - drop `content-length` / `content-encoding` from the response so the runtime
//   is free to re-frame the body it actually delivers to the client.
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

const STRIP_REQUEST = new Set<string>([...HOP_BY_HOP, "host"]);
const STRIP_RESPONSE = new Set<string>([...HOP_BY_HOP, "content-encoding", "content-length"]);

// IMPORTANT: use `append`, not `set`. Bun's `headers.forEach` emits multi-value
// headers (notably `Set-Cookie`) as one callback per value; `set` would
// overwrite earlier values and only the last Set-Cookie would survive, which
// breaks any session/auth flow that issues more than one cookie at a time.
function filterHeaders(headers: Headers, blocked: Set<string>): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    if (!blocked.has(key.toLowerCase())) {
      out.append(key, value);
    }
  });
  return out;
}

type PendingMessage = string | ArrayBufferLike | Uint8Array;

interface WsClientData {
  upstreamUrl: string;
  upstream: WebSocket | null;
  pending: PendingMessage[];
  closed: boolean;
}

// Swallow close-on-already-closed errors — both ServerWebSocket and the global
// WebSocket throw if the peer has already gone away, and that's expected at
// shutdown / teardown time.
function safeClose(
  socket: { close: (code?: number, reason?: string) => void },
  code?: number,
  reason?: string
): void {
  try {
    socket.close(code, reason);
  } catch {
    // ignore
  }
}

export function startProxy(listenPort: number, ports: Record<Target, number>) {
  return Bun.serve<WsClientData>({
    port: listenPort,
    hostname: "localhost",
    async fetch(req, srv) {
      const url = new URL(req.url);

      if (url.pathname === "/__hive/healthz") {
        return new Response("ok", { status: 200 });
      }

      const target = routeFor(url.pathname);
      const upstreamPort = ports[target];

      if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const upstreamUrl = `ws://localhost:${upstreamPort}${url.pathname}${url.search}`;
        logger.info(`[proxy] WS ${url.pathname} → ${target}`);
        const upgraded = srv.upgrade(req, {
          data: {
            upstreamUrl,
            upstream: null,
            pending: [],
            closed: false,
          } satisfies WsClientData,
        });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 426 });
        }
        return undefined;
      }

      const upstreamUrl = `http://localhost:${upstreamPort}${url.pathname}${url.search}`;
      const init: RequestInit & { duplex?: "half" } = {
        method: req.method,
        headers: filterHeaders(req.headers, STRIP_REQUEST),
        redirect: "manual",
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = req.body;
        init.duplex = "half";
      }

      const t0 = performance.now();
      try {
        const upstream = await fetch(upstreamUrl, init);
        const dt = (performance.now() - t0).toFixed(0);
        logger.info(
          `[proxy] ${req.method} ${url.pathname} → ${target} (${upstream.status}, ${dt}ms)`
        );
        // Re-wrap so Bun.serve gets a fresh stream + clean headers (drops
        // content-encoding/length/transfer-encoding from upstream so the
        // runtime re-frames the response as it streams to the client).
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: filterHeaders(upstream.headers, STRIP_RESPONSE),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[proxy] ${req.method} ${url.pathname} → ${target} failed: ${message}`);
        return new Response(`Bad Gateway: ${message}`, { status: 502 });
      }
    },
    websocket: {
      open(ws: ServerWebSocket<WsClientData>) {
        const upstream = new WebSocket(ws.data.upstreamUrl);
        upstream.binaryType = "arraybuffer";
        ws.data.upstream = upstream;

        upstream.addEventListener("open", () => {
          for (const msg of ws.data.pending) {
            upstream.send(msg);
          }
          ws.data.pending = [];
        });
        upstream.addEventListener("message", (event) => {
          if (ws.data.closed) return;
          ws.send(event.data as string | ArrayBufferLike | Uint8Array);
        });
        upstream.addEventListener("close", (event) => {
          if (ws.data.closed) return;
          safeClose(ws, event.code, event.reason);
        });
        upstream.addEventListener("error", () => {
          if (ws.data.closed) return;
          safeClose(ws, 1011, "upstream error");
        });
      },
      message(ws, message) {
        const upstream = ws.data.upstream;
        if (!upstream || upstream.readyState === 0 /* CONNECTING */) {
          ws.data.pending.push(message);
          return;
        }
        if (upstream.readyState !== 1 /* OPEN */) {
          return;
        }
        upstream.send(message);
      },
      close(ws, code, reason) {
        ws.data.closed = true;
        const upstream = ws.data.upstream;
        if (upstream && upstream.readyState <= 1) {
          safeClose(upstream, code, reason);
        }
      },
    },
  });
}

if (import.meta.main) {
  const [listenPortArg, frontApiPortArg, marketingPortArg] = process.argv.slice(2);
  const listenPort = parsePort(listenPortArg, "listen port");
  const ports: Record<Target, number> = {
    "front-api": parsePort(frontApiPortArg, "front-api port"),
    marketing: parsePort(marketingPortArg, "marketing port"),
  };

  const server = startProxy(listenPort, ports);

  logger.info(
    `proxy daemon listening on http://${server.hostname}:${server.port} ` +
      `(front-api: ${ports["front-api"]}, marketing: ${ports.marketing})`
  );

  const shutdown = () => {
    logger.info("Shutting down proxy daemon...");
    server.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
