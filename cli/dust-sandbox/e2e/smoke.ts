#!/usr/bin/env bun
// End-to-end smoke tests for `dsbx forward` + the live egress-proxy.
//
// Runs inside the e2e Docker image as root. For each case: mints a JWT,
// writes it to the forwarder's token file, spawns `dsbx forward`, then drops
// to the `dust-fwd` uid (whose outbound :80/:443 is iptables-REDIRECTed to
// the forwarder) to issue the actual HTTPS request. Denied cases also
// validate the `/tmp/dust-egress-denied.log` contents.
//
// Commands:
//   matrix     JWT / domain matrix (6 cases) + deny-log validation per deny
//   streaming  Real-world streaming call to a Dust agent via the forwarder
//   all        matrix + streaming (default)
//
// Required env:
//   EGRESS_PROXY_JWT_SECRET   HS256 secret shared with the proxy
//   DUST_API_KEY              (streaming only) Dust workspace API key
//   DUST_WORKSPACE_ID         (streaming only) target workspace sId
//
// Optional env:
//   EGRESS_PROXY_HOST         default eu.sandbox-egress.dust.tt
//   EGRESS_PROXY_PORT         default 4443
//   EGRESS_PROXY_TLS_NAME     default = EGRESS_PROXY_HOST
//   EGRESS_PROXY_ALLOWED_DOMAIN default dust.tt
//   EGRESS_PROXY_DENIED_DOMAIN  default example.com
//   EGRESS_PROXY_SB_ID        default e2e-<timestamp>
//   EGRESS_PROXY_JWT_TTL_SECONDS default 300
//   DSBX_LISTEN_ADDR          default 127.0.0.1:9990
//   DSBX_TOKEN_FILE           default /tmp/egress-token
//   DSBX_DENY_LOG             default /tmp/dust-egress-denied.log
//   DUST_AGENT_ID             default dust
//   DUST_API_BASE_URL         default https://dust.tt
//   DUST_AGENT_PROMPT         default a "write a short poem" prompt

import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import net from "node:net";
import { promises as dns } from "node:dns";

const PROXY_HOST = process.env.EGRESS_PROXY_HOST ?? "eu.sandbox-egress.dust.tt";
const PROXY_PORT = Number(process.env.EGRESS_PROXY_PORT ?? "4443");
const PROXY_TLS_NAME = process.env.EGRESS_PROXY_TLS_NAME ?? PROXY_HOST;
const LISTEN_ADDR = process.env.DSBX_LISTEN_ADDR ?? "127.0.0.1:9990";
const TOKEN_FILE = process.env.DSBX_TOKEN_FILE ?? "/tmp/egress-token";
const DENY_LOG_PATH =
  process.env.DSBX_DENY_LOG ?? "/tmp/dust-egress-denied.log";
const ALLOWED_DOMAIN = process.env.EGRESS_PROXY_ALLOWED_DOMAIN ?? "dust.tt";
const DENIED_DOMAIN = process.env.EGRESS_PROXY_DENIED_DOMAIN ?? "example.com";
const JWT_ISSUER = "dust-front";
const JWT_AUDIENCE = "dust-egress-proxy";
const FORWARD_READY_TIMEOUT_MS = 3_000;

type JwtOverrides = {
  secret?: string;
  iss?: string;
  aud?: string;
  expOffsetSeconds?: number;
};

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`missing required env: ${name}`);
    process.exit(2);
  }
  return value;
}

function mintJwt(overrides: JwtOverrides = {}): string {
  const secret = overrides.secret ?? requireEnv("EGRESS_PROXY_JWT_SECRET");
  const sbId = process.env.EGRESS_PROXY_SB_ID ?? `e2e-${Date.now()}`;
  const ttl = Number(process.env.EGRESS_PROXY_JWT_TTL_SECONDS ?? "300");
  const expOffsetSeconds = overrides.expOffsetSeconds ?? ttl;
  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sbId,
    iss: overrides.iss ?? JWT_ISSUER,
    aud: overrides.aud ?? JWT_AUDIENCE,
    exp,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload)
  )}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${b64url(signature)}`;
}

async function writeTokenFile(jwt: string): Promise<void> {
  await fs.writeFile(TOKEN_FILE, `${jwt}\n`, { mode: 0o600 });
}

async function waitForListen(addr: string, timeoutMs: number): Promise<void> {
  const [host, portStr] = addr.split(":");
  const port = Number(portStr);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (reachable) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`dsbx forward did not bind ${addr} within ${timeoutMs}ms`);
}

async function truncateDenyLog(): Promise<void> {
  if (existsSync(DENY_LOG_PATH)) {
    await fs.truncate(DENY_LOG_PATH, 0);
  }
}

async function readDenyLogLines(): Promise<string[]> {
  if (!existsSync(DENY_LOG_PATH)) return [];
  const contents = await fs.readFile(DENY_LOG_PATH, "utf8");
  return contents.split("\n").filter((line) => line.length > 0);
}

type ForwardHandle = {
  stop: () => Promise<string>;
};

async function resolveProxyAddr(): Promise<string> {
  // --proxy-addr takes a SocketAddr (IP:port); --proxy-tls-name carries the
  // DNS name for certificate validation. Resolve the host to its first A/AAAA.
  if (net.isIP(PROXY_HOST)) return `${PROXY_HOST}:${PROXY_PORT}`;
  const addresses = await dns.lookup(PROXY_HOST, { all: true });
  if (addresses.length === 0) {
    throw new Error(`failed to resolve ${PROXY_HOST}`);
  }
  const v4 = addresses.find((a) => a.family === 4) ?? addresses[0];
  const host = v4.family === 6 ? `[${v4.address}]` : v4.address;
  return `${host}:${PROXY_PORT}`;
}

async function startForward(): Promise<ForwardHandle> {
  const proxyAddr = await resolveProxyAddr();
  const proc = Bun.spawn({
    cmd: [
      "dsbx",
      "forward",
      "--token-file",
      TOKEN_FILE,
      "--proxy-addr",
      proxyAddr,
      "--proxy-tls-name",
      PROXY_TLS_NAME,
      "--listen",
      LISTEN_ADDR,
      "--deny-log",
      DENY_LOG_PATH,
    ],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? "info" },
  });

  const stop = async () => {
    try {
      proc.kill("SIGTERM");
    } catch {}
    try {
      await proc.exited;
    } catch {}
    const stderr = proc.stderr
      ? await new Response(proc.stderr as ReadableStream).text()
      : "";
    return stderr;
  };

  try {
    await waitForListen(LISTEN_ADDR, FORWARD_READY_TIMEOUT_MS);
  } catch (err) {
    const stderr = await stop();
    throw new Error(
      `${(err as Error).message}\ndsbx forward stderr:\n${stderr}`
    );
  }
  return { stop };
}

async function runAsDustFwd(
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  // `runuser --preserve-environment` keeps DUST_API_KEY / DUST_WORKSPACE_ID etc.
  // visible to the child process. Without it, DUST_* envs get wiped.
  const proc = Bun.spawn({
    cmd: [
      "runuser",
      "-u",
      "dust-fwd",
      "--preserve-environment",
      "--",
      "bun",
      "/app/case.ts",
      ...args,
    ],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

type Expected = "ALLOW" | "DENY";

type MatrixCase = {
  label: string;
  overrides: JwtOverrides;
  domain: string;
  expected: Expected;
};

function icon(ok: boolean): string {
  return ok ? "\u2713" : "\u2717";
}

function pad(value: string, width: number): string {
  return value.length >= width
    ? value
    : value + " ".repeat(width - value.length);
}

async function runMatrixCase(c: MatrixCase): Promise<boolean> {
  await writeTokenFile(mintJwt(c.overrides));
  await truncateDenyLog();

  const handle = await startForward();
  let details = "";
  let outcomeOk = false;
  try {
    const url = `https://${c.domain}/`;
    const res = await runAsDustFwd(["fetch", url]);
    const fetchSucceeded = res.code === 0;
    const observed: Expected = fetchSucceeded ? "ALLOW" : "DENY";
    outcomeOk = observed === c.expected;

    if (c.expected === "DENY") {
      const log = await readDenyLogLines();
      const expectedMarker = `DENIED ${c.domain}:443`;
      const denyLine = log.find(
        (line) =>
          line.includes(expectedMarker) && line.includes("reason: proxy_denied")
      );
      if (denyLine) {
        details = "deny_log=ok";
      } else {
        outcomeOk = false;
        details = `deny_log=MISSING (lines=${log.length})`;
      }
    } else if (res.stdout.trim()) {
      details = res.stdout.trim();
    }

    console.log(
      `${icon(outcomeOk)} ${pad(c.label, 44)} expected=${pad(c.expected, 5)} got=${observed}${details ? "  " + details : ""}`
    );
    if (!outcomeOk && res.stderr.trim()) {
      for (const line of res.stderr.trim().split("\n")) {
        console.log(`    inner.stderr: ${line}`);
      }
    }
  } finally {
    const forwardStderr = await handle.stop();
    if (!outcomeOk && forwardStderr.trim()) {
      for (const line of forwardStderr.trim().split("\n").slice(-10)) {
        console.log(`    forward.stderr: ${line}`);
      }
    }
  }
  return outcomeOk;
}

function buildMatrix(): MatrixCase[] {
  return [
    {
      label: "valid JWT + allowed domain",
      overrides: {},
      domain: ALLOWED_DOMAIN,
      expected: "ALLOW",
    },
    {
      label: "valid JWT + denied domain",
      overrides: {},
      domain: DENIED_DOMAIN,
      expected: "DENY",
    },
    {
      label: "expired JWT",
      overrides: { expOffsetSeconds: -60 },
      domain: ALLOWED_DOMAIN,
      expected: "DENY",
    },
    {
      label: "wrong iss",
      overrides: { iss: "evil-service" },
      domain: ALLOWED_DOMAIN,
      expected: "DENY",
    },
    {
      label: "wrong aud",
      overrides: { aud: "evil-proxy" },
      domain: ALLOWED_DOMAIN,
      expected: "DENY",
    },
    {
      label: "bad signature",
      overrides: { secret: "wrong-secret" },
      domain: ALLOWED_DOMAIN,
      expected: "DENY",
    },
  ];
}

async function cmdMatrix(): Promise<number> {
  let failures = 0;
  for (const c of buildMatrix()) {
    const ok = await runMatrixCase(c);
    if (!ok) failures += 1;
  }
  console.log(
    `\n${failures === 0 ? "matrix: all checks passed" : `matrix: ${failures} failure(s)`}`
  );
  return failures === 0 ? 0 : 1;
}

async function cmdStreaming(): Promise<number> {
  await writeTokenFile(mintJwt());
  await truncateDenyLog();

  const handle = await startForward();
  try {
    const res = await runAsDustFwd(["stream"]);
    const ok = res.code === 0;
    if (!ok) {
      console.log(`${icon(false)} streaming agent call via forwarder`);
      if (res.stdout.trim()) {
        for (const line of res.stdout.trim().split("\n").slice(-20)) {
          console.log(`    stdout: ${line}`);
        }
      }
      if (res.stderr.trim()) {
        for (const line of res.stderr.trim().split("\n").slice(-10)) {
          console.log(`    stderr: ${line}`);
        }
      }
      return 1;
    }
    const summary =
      res.stdout
        .split("\n")
        .reverse()
        .find((line) => line.startsWith("tokens=")) ?? "";
    console.log(`${icon(true)} streaming agent call via forwarder  ${summary}`);
    return 0;
  } finally {
    await handle.stop();
  }
}

async function cmdAll(): Promise<number> {
  const matrixCode = await cmdMatrix();
  const streamingCode = await cmdStreaming();
  return matrixCode === 0 && streamingCode === 0 ? 0 : 1;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "all";
  let code = 1;
  switch (command) {
    case "matrix":
      code = await cmdMatrix();
      break;
    case "streaming":
      code = await cmdStreaming();
      break;
    case "all":
      code = await cmdAll();
      break;
    default:
      console.error("usage: smoke.ts [matrix|streaming|all]");
      code = 2;
  }
  process.exit(code);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
