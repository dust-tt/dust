import { type ChildProcess, spawn } from "node:child_process";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect, createServer as createNetServer } from "node:net";
import esbuild from "esbuild";

import {
  BUILD_TARGETS,
  type BuildTarget,
  getBaseBuildOptions,
} from "./esbuild.shared";

// The watch loop only follows the default entry. The strangler shim is
// opt-in (autostart: false in mprocs) and rarely the focus of inner-loop
// dev — keeping a single child process here avoids racing two ports.
const WATCH_TARGET = BUILD_TARGETS[0];

const SHUTDOWN_GRACE_MS = 2000;
const UPSTREAM_READY_TIMEOUT_MS = 30_000;
const UPSTREAM_PROBE_INTERVAL_MS = 75;
const UPSTREAM_HOSTNAME = "127.0.0.1";

// Public-facing dev port: clients always connect here. The watcher binds it
// permanently and proxies to whichever child is currently healthy, so a
// rebuild never produces ECONNREFUSED on the client side.
const PUBLIC_PORT = parseInt(process.env.PORT ?? "3000", 10);
const PUBLIC_HOSTNAME = process.env.HOSTNAME ?? "localhost";

let child: ChildProcess | null = null;
let upstreamPort: number | null = null;
let proxyServer: Server | null = null;

function waitForExit(proc: ChildProcess, graceMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      done();
    }, graceMs);
    proc.once("exit", done);
  });
}

// Externalized requires resolve relative to the bundle's directory, but
// most runtime deps live under `front/node_modules` (front-api itself
// declares almost nothing). The Dockerfile sets the same NODE_PATH at
// runtime (see dockerfiles/front.Dockerfile, "ENV NODE_PATH=/app/front/node_modules").
const FRONT_NODE_MODULES = "../front/node_modules";

function childEnv(): NodeJS.ProcessEnv {
  const existing = process.env.NODE_PATH;
  return {
    ...process.env,
    NODE_PATH: existing
      ? `${FRONT_NODE_MODULES}:${existing}`
      : FRONT_NODE_MODULES,
    // V8 compile cache persists across restarts (Node >= 22.8). Each child
    // reuses the parsed/compiled bytecode of the 6 MB bundle from disk,
    // cutting cold-parse cost out of every dev rebuild.
    NODE_COMPILE_CACHE:
      process.env.NODE_COMPILE_CACHE ?? ".cache/node-compile-cache",
  };
}

function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, UPSTREAM_HOSTNAME, () => {
      const addr = srv.address();
      if (addr === null || typeof addr === "string") {
        srv.close();
        reject(new Error("Failed to allocate ephemeral port"));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

function probeUpstream(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect(port, UPSTREAM_HOSTNAME);
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

async function waitForUpstream(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeUpstream(port)) {
      return;
    }
    await new Promise((r) => setTimeout(r, UPSTREAM_PROBE_INTERVAL_MS));
  }
  throw new Error(
    `Upstream ${UPSTREAM_HOSTNAME}:${port} did not become ready in ${timeoutMs}ms`
  );
}

function startProxy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = createServer(handleProxyRequest);
    srv.on("error", reject);
    srv.listen(PUBLIC_PORT, PUBLIC_HOSTNAME, () => {
      proxyServer = srv;
      resolve();
    });
  });
}

function handleProxyRequest(req: IncomingMessage, res: ServerResponse): void {
  const port = upstreamPort;
  if (port === null) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("front-api: no upstream ready yet (initial build in progress)\n");
    return;
  }
  const upstreamReq = httpRequest(
    {
      host: UPSTREAM_HOSTNAME,
      port,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );
  upstreamReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end(`upstream error: ${err.message}\n`);
  });
  req.on("error", () => upstreamReq.destroy());
  req.pipe(upstreamReq);
}

async function restartServer(target: BuildTarget) {
  let port: number;
  try {
    port = await allocatePort();
  } catch (err) {
    console.error(`[watch] failed to allocate upstream port: ${String(err)}`);
    return;
  }

  const next = spawn("node", [target.outfile], {
    stdio: "inherit",
    env: {
      ...childEnv(),
      PORT: String(port),
      HOSTNAME: UPSTREAM_HOSTNAME,
    },
  });
  next.on("exit", (code, signal) => {
    // Expected exits happen via SIGTERM/SIGKILL when we swap upstreams; only
    // log unexpected deaths (crashes, exit(1), etc.) to keep dev output quiet.
    if (signal !== "SIGTERM" && signal !== "SIGKILL") {
      console.error(`[server exited code=${code} signal=${signal}]`);
    }
    if (next === child) {
      child = null;
      upstreamPort = null;
    }
  });

  try {
    await waitForUpstream(port, UPSTREAM_READY_TIMEOUT_MS);
  } catch (err) {
    console.error(
      `[watch] new child not ready: ${String(err)} — keeping previous upstream`
    );
    next.kill("SIGKILL");
    return;
  }

  // Atomic swap: from this point new requests flow to the new child.
  const previous = child;
  child = next;
  upstreamPort = port;

  // Drain the previous child in the background. The proxy already routes new
  // requests to the new child, so we don't need to block the next restart on
  // the SIGTERM grace window — waitForExit will SIGKILL after grace_ms.
  if (previous) {
    previous.kill("SIGTERM");
    void waitForExit(previous, SHUTDOWN_GRACE_MS);
  }
}

// Collapses bursts of rebuilds into a single trailing restart. A rebuild that
// completes while a restart is in flight just flips `pendingRestart`; the
// in-flight restart finishes, then the loop runs once more against the latest
// bundle. We deliberately do not await `scheduleRestart` from `onEnd` — that
// would block esbuild from starting the next build, which is the very signal
// we need to coalesce on.
let restarting = false;
let pendingRestart = false;

async function scheduleRestart(target: BuildTarget): Promise<void> {
  if (restarting) {
    pendingRestart = true;
    return;
  }
  restarting = true;
  try {
    do {
      pendingRestart = false;
      await restartServer(target);
    } while (pendingRestart);
  } finally {
    restarting = false;
  }
}

function makeRestartPlugin(target: BuildTarget): esbuild.Plugin {
  return {
    name: "restart-server",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) {
          // esbuild itself has already printed the errors via logLevel: "info".
          return;
        }
        void scheduleRestart(target);
      });
    },
  };
}

function getDevBuildOptions(target: BuildTarget): esbuild.BuildOptions {
  const base = getBaseBuildOptions(target);
  return {
    ...base,
    plugins: [...(base.plugins ?? []), makeRestartPlugin(target)],
    sourcemap: "inline",
    legalComments: "inline",
  };
}

async function watchAndServe() {
  await startProxy();

  const ctx = await esbuild.context(getDevBuildOptions(WATCH_TARGET));

  const shutdown = async () => {
    const running = child;
    child = null;
    upstreamPort = null;
    if (running) {
      running.kill("SIGTERM");
      await waitForExit(running, SHUTDOWN_GRACE_MS);
    }
    if (proxyServer) {
      await new Promise<void>((resolve) => proxyServer?.close(() => resolve()));
      proxyServer = null;
    }
    await ctx.dispose();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await ctx.watch();
}

watchAndServe().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
