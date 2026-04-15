#!/usr/bin/env bun
// End-to-end smoke tests against a live egress-proxy instance.
//
// Usage:
//   bun run egress-proxy/scripts/smoke.ts <command> [args]
//
// Env vars:
//   EGRESS_PROXY_HOST                 (required)  e.g. eu.sandbox-egress.dust.tt
//   EGRESS_PROXY_PORT                 (default 4443)
//   EGRESS_PROXY_JWT_SECRET           (required)  HS256 secret shared with the proxy
//   EGRESS_PROXY_SB_ID                (default "smoke-<timestamp>")
//   EGRESS_PROXY_JWT_TTL_SECONDS      (default 300)
//   EGRESS_PROXY_INSECURE_SKIP_VERIFY (default false)  skip TLS verification
//   EGRESS_PROXY_ALLOWED_DOMAIN       (matrix only)  known-allowed target
//   EGRESS_PROXY_DENIED_DOMAIN        (matrix only)  known-denied target
//
// Commands (exit 0 if outcome matches expectation, 1 otherwise):
//   allow <domain> [port]    handshake, expect ALLOW
//   deny <domain> [port]     handshake, expect DENY
//   expired <domain> [port]  JWT exp in the past, expect DENY
//   wrong-iss <domain>       JWT iss != "dust-front", expect DENY
//   wrong-aud <domain>       JWT aud != "dust-egress-proxy", expect DENY
//   bad-sig <domain>         JWT signed with a different secret, expect DENY
//   no-jwt <domain>          empty token, expect DENY (or connection drop)
//   https <domain> [path]    full e2e: ALLOW + TLS-in-TLS + HTTP GET, expect 2xx/3xx
//   http <domain> [path]     full e2e over plain :80 upstream
//   matrix                   run all auth checks against allowed + denied domain

import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";

const PROTOCOL_VERSION = 0x01;
const ALLOW_RESPONSE = 0x00;
const DENY_RESPONSE = 0x01;
const DEFAULT_ISSUER = "dust-front";
const DEFAULT_AUDIENCE = "dust-egress-proxy";

type JwtOverrides = {
  secret?: string;
  iss?: string;
  aud?: string;
  expOffsetSeconds?: number;
};

type HandshakeResult = {
  response: number;
  socket: TLSSocket;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`missing required env: ${name}`);
    process.exit(2);
  }
  return value;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function mintJwt(overrides: JwtOverrides = {}): string {
  const secret = overrides.secret ?? requiredEnv("EGRESS_PROXY_JWT_SECRET");
  const sbId = process.env.EGRESS_PROXY_SB_ID ?? `smoke-${Date.now()}`;
  const ttl = Number(process.env.EGRESS_PROXY_JWT_TTL_SECONDS ?? "300");
  const expOffset = overrides.expOffsetSeconds ?? ttl;
  const exp = Math.floor(Date.now() / 1000) + expOffset;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sbId,
    iss: overrides.iss ?? DEFAULT_ISSUER,
    aud: overrides.aud ?? DEFAULT_AUDIENCE,
    exp,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload)
  )}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${b64url(signature)}`;
}

function buildHandshakeFrame(
  token: string,
  domain: string,
  originalDestPort: number
): Buffer {
  const tokenBuf = Buffer.from(token, "utf8");
  const domainBuf = Buffer.from(domain, "utf8");
  const frame = Buffer.alloc(
    1 + 2 + tokenBuf.length + 2 + domainBuf.length + 2
  );
  let offset = 0;
  frame.writeUInt8(PROTOCOL_VERSION, offset);
  offset += 1;
  frame.writeUInt16BE(tokenBuf.length, offset);
  offset += 2;
  tokenBuf.copy(frame, offset);
  offset += tokenBuf.length;
  frame.writeUInt16BE(domainBuf.length, offset);
  offset += 2;
  domainBuf.copy(frame, offset);
  offset += domainBuf.length;
  frame.writeUInt16BE(originalDestPort, offset);
  return frame;
}

function connectProxy(): Promise<TLSSocket> {
  const host = requiredEnv("EGRESS_PROXY_HOST");
  const port = Number(process.env.EGRESS_PROXY_PORT ?? "4443");
  const rejectUnauthorized =
    (process.env.EGRESS_PROXY_INSECURE_SKIP_VERIFY ?? "").toLowerCase() !==
    "true";
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host,
      port,
      servername: host,
      rejectUnauthorized,
    });
    socket.setNoDelay(true);
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function readOneByte(socket: TLSSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    const onReadable = () => {
      const chunk = socket.read(1) as Buffer | null;
      if (chunk) {
        cleanup();
        resolve(chunk[0]);
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error("proxy closed connection before response"));
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off("readable", onReadable);
      socket.off("close", onClose);
      socket.off("error", onError);
    };
    socket.on("readable", onReadable);
    socket.on("close", onClose);
    socket.on("error", onError);
  });
}

async function runHandshake(opts: {
  domain: string;
  port?: number;
  jwtOverrides?: JwtOverrides;
  rawToken?: string;
}): Promise<HandshakeResult> {
  const port = opts.port ?? 443;
  const token = opts.rawToken ?? mintJwt(opts.jwtOverrides ?? {});
  const socket = await connectProxy();
  try {
    socket.write(buildHandshakeFrame(token, opts.domain, port));
    const response = await readOneByte(socket);
    return { response, socket };
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

function labelResponse(byte: number): string {
  if (byte === ALLOW_RESPONSE) return "ALLOW";
  if (byte === DENY_RESPONSE) return "DENY";
  return `UNKNOWN(0x${byte.toString(16).padStart(2, "0")})`;
}

async function assertOutcome(
  description: string,
  run: () => Promise<HandshakeResult>,
  expected: "ALLOW" | "DENY"
): Promise<boolean> {
  try {
    const { response, socket } = await run();
    socket.destroy();
    const got = labelResponse(response);
    const ok =
      (expected === "ALLOW" && response === ALLOW_RESPONSE) ||
      (expected === "DENY" && response === DENY_RESPONSE);
    console.log(
      `${ok ? "✓" : "✗"} ${description.padEnd(40)} expected=${expected.padEnd(5)} got=${got}`
    );
    return ok;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`✗ ${description.padEnd(40)} error=${message}`);
    return false;
  }
}

async function cmdSimple(
  expected: "ALLOW" | "DENY",
  jwtOverrides: JwtOverrides = {}
): Promise<void> {
  const domain = process.argv[3];
  const port = Number(process.argv[4] ?? "443");
  if (!domain) {
    console.error("usage: <command> <domain> [port]");
    process.exit(2);
  }
  const label = `${process.argv[2]} ${domain}:${port}`;
  const ok = await assertOutcome(
    label,
    () => runHandshake({ domain, port, jwtOverrides }),
    expected
  );
  process.exit(ok ? 0 : 1);
}

async function cmdHttps(): Promise<void> {
  const domain = process.argv[3];
  const path = process.argv[4] ?? "/";
  if (!domain) {
    console.error("usage: https <domain> [path]");
    process.exit(2);
  }
  const { response, socket } = await runHandshake({ domain, port: 443 });
  if (response !== ALLOW_RESPONSE) {
    console.log(`✗ proxy denied at handshake (${labelResponse(response)})`);
    socket.destroy();
    process.exit(1);
  }

  // TLS-in-TLS: inner TLS connection to <domain> over the already-TLS outer tunnel.
  const innerSocket = await new Promise<TLSSocket>((resolve, reject) => {
    const inner = tlsConnect({
      socket,
      servername: domain,
      rejectUnauthorized: true,
    });
    inner.once("secureConnect", () => resolve(inner));
    inner.once("error", reject);
  });

  const request = `GET ${path} HTTP/1.1\r\nHost: ${domain}\r\nUser-Agent: egress-proxy-smoke\r\nConnection: close\r\nAccept: */*\r\n\r\n`;
  innerSocket.write(request);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    innerSocket.on("data", (c: Buffer) => chunks.push(c));
    innerSocket.on("end", resolve);
    innerSocket.on("error", reject);
  });
  innerSocket.destroy();
  socket.destroy();

  const responseText = Buffer.concat(chunks).toString("utf8");
  const statusLine = responseText.split("\r\n", 1)[0] ?? "";
  const match = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
  const status = match ? Number(match[1]) : null;
  const ok = status !== null && status >= 200 && status < 400;
  console.log(
    `${ok ? "✓" : "✗"} https GET https://${domain}${path}  ->  ${statusLine || "(no response line)"}`
  );
  process.exit(ok ? 0 : 1);
}

async function cmdHttp(): Promise<void> {
  const domain = process.argv[3];
  const path = process.argv[4] ?? "/";
  if (!domain) {
    console.error("usage: http <domain> [path]");
    process.exit(2);
  }
  const { response, socket } = await runHandshake({ domain, port: 80 });
  if (response !== ALLOW_RESPONSE) {
    console.log(`✗ proxy denied at handshake (${labelResponse(response)})`);
    socket.destroy();
    process.exit(1);
  }
  const request = `GET ${path} HTTP/1.1\r\nHost: ${domain}\r\nUser-Agent: egress-proxy-smoke\r\nConnection: close\r\nAccept: */*\r\n\r\n`;
  socket.write(request);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    socket.on("data", (c: Buffer) => chunks.push(c));
    socket.on("end", resolve);
    socket.on("error", reject);
  });
  socket.destroy();

  const responseText = Buffer.concat(chunks).toString("utf8");
  const statusLine = responseText.split("\r\n", 1)[0] ?? "";
  const match = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
  const status = match ? Number(match[1]) : null;
  const ok = status !== null && status >= 200 && status < 400;
  console.log(
    `${ok ? "✓" : "✗"} http GET http://${domain}${path}  ->  ${statusLine || "(no response line)"}`
  );
  process.exit(ok ? 0 : 1);
}

async function cmdNoJwt(): Promise<void> {
  const domain = process.argv[3];
  const port = Number(process.argv[4] ?? "443");
  if (!domain) {
    console.error("usage: no-jwt <domain> [port]");
    process.exit(2);
  }
  const socket = await connectProxy();
  socket.write(buildHandshakeFrame("", domain, port));
  try {
    const response = await readOneByte(socket);
    socket.destroy();
    const got = labelResponse(response);
    const ok = response === DENY_RESPONSE;
    console.log(
      `${ok ? "✓" : "✗"} no-jwt ${domain}:${port} expected=DENY got=${got}`
    );
    process.exit(ok ? 0 : 1);
  } catch (err) {
    socket.destroy();
    const message = err instanceof Error ? err.message : String(err);
    console.log(`✓ no-jwt ${domain}:${port} connection rejected (${message})`);
    process.exit(0);
  }
}

async function cmdMatrix(): Promise<void> {
  const allowed = requiredEnv("EGRESS_PROXY_ALLOWED_DOMAIN");
  const denied = requiredEnv("EGRESS_PROXY_DENIED_DOMAIN");

  type Check = [
    label: string,
    opts: { domain: string; jwtOverrides?: JwtOverrides },
    expected: "ALLOW" | "DENY",
  ];

  const checks: Check[] = [
    ["valid JWT + allowed domain", { domain: allowed }, "ALLOW"],
    ["valid JWT + denied domain", { domain: denied }, "DENY"],
    [
      "expired JWT + allowed domain",
      { domain: allowed, jwtOverrides: { expOffsetSeconds: -60 } },
      "DENY",
    ],
    [
      "wrong iss + allowed domain",
      { domain: allowed, jwtOverrides: { iss: "evil-service" } },
      "DENY",
    ],
    [
      "wrong aud + allowed domain",
      { domain: allowed, jwtOverrides: { aud: "evil-proxy" } },
      "DENY",
    ],
    [
      "bad signature + allowed domain",
      { domain: allowed, jwtOverrides: { secret: "wrong-secret" } },
      "DENY",
    ],
  ];

  let failures = 0;
  for (const [label, opts, expected] of checks) {
    const ok = await assertOutcome(
      label,
      () =>
        runHandshake({
          domain: opts.domain,
          port: 443,
          jwtOverrides: opts.jwtOverrides ?? {},
        }),
      expected
    );
    if (!ok) failures += 1;
  }
  console.log(
    `\n${failures === 0 ? "all checks passed" : `${failures} failure(s)`}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case "allow":
      return cmdSimple("ALLOW");
    case "deny":
      return cmdSimple("DENY");
    case "expired":
      return cmdSimple("DENY", { expOffsetSeconds: -60 });
    case "wrong-iss":
      return cmdSimple("DENY", { iss: "evil-service" });
    case "wrong-aud":
      return cmdSimple("DENY", { aud: "evil-proxy" });
    case "bad-sig":
      return cmdSimple("DENY", { secret: "wrong-secret" });
    case "no-jwt":
      return cmdNoJwt();
    case "https":
      return cmdHttps();
    case "http":
      return cmdHttp();
    case "matrix":
      return cmdMatrix();
    default:
      console.error(
        "commands: allow | deny | expired | wrong-iss | wrong-aud | bad-sig | no-jwt | https | http | matrix"
      );
      process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
