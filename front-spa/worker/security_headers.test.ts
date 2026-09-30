import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APP_FRAME_ANCESTORS,
  applySecurityHeaders,
  frameAncestorsCsp,
  SHARE_FRAME_ANCESTORS,
} from "./security_headers.ts";

describe("frameAncestorsCsp", () => {
  it("allows Dust-owned hosts for share paths", () => {
    assert.equal(
      frameAncestorsCsp("/share/frame/abc"),
      `frame-ancestors ${SHARE_FRAME_ANCESTORS}`
    );
    assert.equal(
      frameAncestorsCsp("/share"),
      `frame-ancestors ${SHARE_FRAME_ANCESTORS}`
    );
  });

  it("restricts non-share paths to self", () => {
    assert.equal(
      frameAncestorsCsp("/"),
      `frame-ancestors ${APP_FRAME_ANCESTORS}`
    );
    assert.equal(
      frameAncestorsCsp("/w/abc/assistant"),
      `frame-ancestors ${APP_FRAME_ANCESTORS}`
    );
    assert.equal(
      frameAncestorsCsp("/favicon.ico"),
      `frame-ancestors ${APP_FRAME_ANCESTORS}`
    );
  });
});

describe("applySecurityHeaders", () => {
  it("sets nosniff and CSP on every response", () => {
    const res = applySecurityHeaders(
      new Response("ok", { status: 200 }),
      "/robots.txt"
    );
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(
      res.headers.get("Content-Security-Policy"),
      `frame-ancestors ${APP_FRAME_ANCESTORS}`
    );
    assert.equal(res.headers.get("X-Frame-Options"), "SAMEORIGIN");
    assert.equal(
      res.headers.get("Referrer-Policy"),
      "strict-origin-when-cross-origin"
    );
  });

  it("omits X-Frame-Options on share paths so dust.tt can frame", () => {
    const res = applySecurityHeaders(
      new Response("<html></html>", { status: 200 }),
      "/share/frame/token"
    );
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(
      res.headers.get("Content-Security-Policy"),
      `frame-ancestors ${SHARE_FRAME_ANCESTORS}`
    );
    assert.equal(res.headers.get("X-Frame-Options"), null);
  });

  it("applies nosniff to missing-asset 404s", () => {
    const res = applySecurityHeaders(
      new Response("Not Found", { status: 404 }),
      "/assets/missing.js"
    );
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  });
});
