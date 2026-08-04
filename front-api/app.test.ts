import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// Auth-posture tripwire (CODING_RULES [API4]).
//
// Auth is applied once at each sub-app boundary; a route opts out of a parent
// catch-all only by being mounted before it (Hono scans in registration order,
// [API1]). This test makes that surface auditable:
//
//  1. Every top-level mount must be classified in EXPECTED below. Adding a new
//     top-level mount without classifying it fails CI — the fails-open guard.
//  2. The authed catch-all parents (`w`, `v1`) must still exist, and still
//     reject unauthenticated requests.
//  3. The known public / own-auth routes nested under an authed parent must
//     still be mounted.
//
// HONEST LIMITATION: a route's *effective* posture cannot be derived statically
// — a catch-all matches by path at request time, decoupled from `honoApp.routes`
// — so this cannot detect a brand-new *nested* public sub-app added under an
// existing authed prefix without touching this file. That residual is covered by
// [API4] + code review + the per-route posture tests (e.g. join.test.ts). The
// tripwire's job is the common vector: new / relocated *top-level* mounts.

type Posture =
  | "public" // intentionally unauthenticated
  | "session" // sessionAuth (logged-in user, no workspace)
  | "workspace" // workspaceAuth catch-all owns this prefix
  | "public-api" // publicApiAuth catch-all owns this prefix
  | "own-auth" // own scheme: token / URL secret / webhook signature
  | "internal" // container / operator only
  | "poke"; // Dust super-user

// Top-level mount (first path segment under /api, or root-level for /mcp etc.)
// → intended auth posture. Keep classifications honest; a reviewer reads this to
// understand why each entry is exempt from a catch-all.
const EXPECTED: Record<string, Posture> = {
  // --- under /api ---
  healthz: "public",
  "app-status": "public",
  auth: "session", // /auth/login (WorkOS callback)
  "auth-context": "session",
  "create-new-workspace": "session",
  debug: "internal",
  doc: "public",
  email: "own-auth", // inbound email webhook
  enrichment: "internal",
  geo: "public",
  invitations: "session",
  kill: "internal",
  login: "session",
  lookup: "own-auth", // region resolver bearer secret
  marketing: "public",
  metronome: "own-auth", // webhook signature
  novu: "own-auth", // Novu-validated
  oauth: "public", // OAuth callback
  poke: "poke",
  share: "own-auth", // share tokens
  sse: "session", // dispatcher; children authenticate
  stripe: "own-auth", // webhook signature
  templates: "public",
  t: "public", // tracking pixel
  user: "session",
  workos: "own-auth", // OAuth callbacks + webhooks
  "workspace-lookup": "session",
  // workspaceAuth catch-all; /w/:wId/join is public (mounted before it).
  w: "workspace",
  // publicApiAuth catch-all; viz/triggers/sandbox use their own auth (mounted
  // before it).
  v1: "public-api",
  ":preStopSecret": "own-auth", // env secret
  // --- root (not under /api) ---
  mcp: "own-auth", // MCP bearer JWT
  ".well-known": "public", // OAuth discovery metadata
  oauth2: "public", // dev-only OAuth proxy (conditional)
  subtle1: "public", // PostHog reverse proxy
};

// Catch-all parents that must always exist (renaming/removing them would
// silently change the auth surface).
const REQUIRED_PARENTS = ["w", "v1"];

function topLevelMounts(): Set<string> {
  const mounts = new Set<string>();
  for (const route of honoApp.routes) {
    const parts = route.path.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue; // bare root "/"
    }
    let top = parts[0];
    if (top === "api") {
      if (parts.length < 2) {
        continue;
      }
      top = parts[1];
    }
    if (top === "*") {
      continue; // global "*" middleware (logger / cors / spaRedirect)
    }
    mounts.add(top);
  }
  return mounts;
}

describe("auth-posture tripwire", () => {
  it("classifies every top-level mount (fails-open guard)", () => {
    const discovered = [...topLevelMounts()].sort();
    const unclassified = discovered.filter((m) => !Object.hasOwn(EXPECTED, m));

    expect(
      unclassified,
      `Unclassified top-level mount(s): ${unclassified.join(", ")}. ` +
        `Add each to EXPECTED in front-api/app.test.ts with its auth posture ` +
        `(CODING_RULES [API4]).`
    ).toEqual([]);
  });

  it("keeps the authed catch-all parents mounted", () => {
    const discovered = topLevelMounts();
    for (const parent of REQUIRED_PARENTS) {
      expect(discovered.has(parent), `Missing catch-all parent "${parent}"`).toBe(
        true
      );
    }
  });

  it("keeps the public / own-auth routes nested under an authed parent", () => {
    const paths = honoApp.routes.map((r) => r.path);

    expect(paths.some((p) => p === "/api/w/:wId/join")).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/v1/viz"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/v1/w/:wId/triggers"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/v1/w/:wId/sandbox"))).toBe(true);
  });

  it("still rejects unauthenticated requests on the authed catch-alls", async () => {
    // workspaceAuth guards everything under /api/w/:wId/* except the public
    // routes mounted before it. A probe path (no leaf handler) still hits the
    // catch-all middleware.
    const priv = await honoApp.request("/api/w/test-wid/__posture_probe__");
    expect([401, 403]).toContain(priv.status);

    // publicApiAuth guards everything under /api/v1/w/:wId/* except triggers /
    // sandbox mounted before it.
    const pub = await honoApp.request("/api/v1/w/test-wid/__posture_probe__");
    expect(pub.status).toBe(401);
  });
});
