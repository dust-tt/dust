import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applySecurityHeaders, frameAncestorsCsp } from "./security_headers.ts";

describe("frameAncestorsCsp", () => {
  it("allows dust.tt for share paths", () => {
    assert.equal(
      frameAncestorsCsp("/share/frame/abc"),
      "frame-ancestors 'self' https://dust.tt"
    );
    assert.equal(
      frameAncestorsCsp("/share"),
      "frame-ancestors 'self' https://dust.tt"
    );
  });

  it("restricts non-share paths to self", () => {
    assert.equal(frameAncestorsCsp("/"), "frame-ancestors 'self'");
    assert.equal(
      frameAncestorsCsp("/w/abc/assistant"),
      "frame-ancestors 'self'"
    );
    assert.equal(frameAncestorsCsp("/favicon.ico"), "frame-ancestors 'self'");
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
      "frame-ancestors 'self'"
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
      "frame-ancestors 'self' https://dust.tt"
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
