import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchSpy = vi.spyOn(globalThis, "fetch");

function getUpstreamRequest(): Request {
  const [input] = fetchSpy.mock.calls[0];
  if (!(input instanceof Request)) {
    throw new Error("Expected fetch to be called with a Request");
  }
  return input;
}

describe("/subtle1 PostHog proxy", () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));
  });

  it("proxies ingestion requests to eu.i.posthog.com, preserving path and query", async () => {
    const response = await honoApp.request("/subtle1/decide/?v=3&ip=1");

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getUpstreamRequest().url).toBe(
      "https://eu.i.posthog.com/decide/?v=3&ip=1"
    );
  });

  it("proxies static asset requests to eu-assets.i.posthog.com", async () => {
    const response = await honoApp.request("/subtle1/static/array.js");

    expect(response.status).toBe(200);
    expect(getUpstreamRequest().url).toBe(
      "https://eu-assets.i.posthog.com/static/array.js"
    );
  });

  it("forwards method and body, and drops the client Host header", async () => {
    const response = await honoApp.request("/subtle1/e/", {
      method: "POST",
      body: '{"batch":[]}',
      headers: {
        "content-type": "application/json",
        host: "us-api.dust.tt",
      },
    });

    expect(response.status).toBe(200);
    const upstreamRequest = getUpstreamRequest();
    expect(upstreamRequest.url).toBe("https://eu.i.posthog.com/e/");
    expect(upstreamRequest.method).toBe("POST");
    expect(await upstreamRequest.text()).toBe('{"batch":[]}');
    expect(upstreamRequest.headers.get("content-type")).toBe(
      "application/json"
    );
    expect(upstreamRequest.headers.get("host")).toBeNull();
  });

  it("does not forward Cookie, Authorization or non-allowlisted headers", async () => {
    const response = await honoApp.request("/subtle1/e/", {
      method: "POST",
      body: '{"batch":[]}',
      headers: {
        authorization: "Bearer y",
        cookie: "workos_session=x; dust-has-session=1",
        "x-csrf-token": "z",
      },
    });

    expect(response.status).toBe(200);
    const upstreamHeaders = getUpstreamRequest().headers;
    expect(upstreamHeaders.get("cookie")).toBeNull();
    expect(upstreamHeaders.get("authorization")).toBeNull();
    expect(upstreamHeaders.get("x-csrf-token")).toBeNull();
  });

  it("forwards allowlisted headers", async () => {
    const response = await honoApp.request("/subtle1/e/", {
      method: "POST",
      body: '{"batch":[]}',
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0",
        "x-forwarded-for": "203.0.113.1",
      },
    });

    expect(response.status).toBe(200);
    const upstreamHeaders = getUpstreamRequest().headers;
    expect(upstreamHeaders.get("content-type")).toBe("application/json");
    expect(upstreamHeaders.get("user-agent")).toBe("Mozilla/5.0");
    expect(upstreamHeaders.get("x-forwarded-for")).toBe("203.0.113.1");
  });

  it("drops Set-Cookie from the upstream response", async () => {
    fetchSpy.mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "set-cookie": "ph=1; Path=/" },
      })
    );

    const response = await honoApp.request("/subtle1/e/", { method: "POST" });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("relays upstream error statuses", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 502 }));

    const response = await honoApp.request("/subtle1/e/", { method: "POST" });

    expect(response.status).toBe(502);
  });

  it("returns 502 instead of an unhandled 500 when the upstream fetch fails", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

    const response = await honoApp.request("/subtle1/e/", { method: "POST" });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.type).toBe("service_unavailable");
  });
});
