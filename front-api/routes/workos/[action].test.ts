import { authenticateWithWorkOSCode } from "@app/lib/api/workos/authenticate";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/api/config")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      getWorkOSClientId: () => "client_test",
      getWorkOSSessionCookieDomain: () => "dust.test",
    },
  };
});

vi.mock("@app/lib/api/workos/authenticate", () => ({
  authenticateWithWorkOSCode: vi.fn(),
}));

vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    userManagement: {
      getAuthorizationUrl: ({ state }: { state?: string }) =>
        `https://auth.example.com/authorize?state=${state ?? ""}`,
    },
  }),
}));

function encodeState(state: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(state)).toString("base64");
}

async function startLogin(query = "") {
  const res = await honoApp.request(`/api/workos/login${query}`);
  const location = new URL(res.headers.get("location") ?? "");
  const rawState = location.searchParams.get("state");
  const state = rawState
    ? JSON.parse(Buffer.from(rawState, "base64").toString())
    : {};
  const nonceCookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("workos_login_nonce="));
  return { res, state, nonceCookie };
}

describe("WorkOS login nonce", () => {
  beforeEach(() => {
    vi.mocked(authenticateWithWorkOSCode).mockReset();
    vi.mocked(authenticateWithWorkOSCode).mockRejectedValue(
      new Error("exchange reached")
    );
  });

  it("sets a nonce cookie and carries the nonce in state on web login", async () => {
    const { state, nonceCookie } = await startLogin("?returnTo=/w/abc");

    expect(state.nonce).toEqual(expect.any(String));
    expect(state.returnTo).toBe("/w/abc");
    expect(nonceCookie).toContain(`workos_login_nonce=${state.nonce}`);
    expect(nonceCookie).toContain("HttpOnly");
    expect(nonceCookie).toContain("SameSite=Lax");
  });

  it("does not set a nonce for logins with a custom redirect_uri", async () => {
    const { state, nonceCookie } = await startLogin(
      "?redirect_uri=https://extension.example.com/cb&code_challenge=abc&code_challenge_method=S256"
    );

    expect(state.nonce).toBeUndefined();
    expect(nonceCookie).toBeUndefined();
  });

  it("restarts the login with the original state when the nonce cookie is missing", async () => {
    const state = encodeState({
      nonce: "attacker-nonce",
      returnTo: "/w/abc",
      organizationId: "org_123",
      utm: { utm_source: "newsletter" },
    });

    const res = await honoApp.request(
      `/api/workos/callback?code=CODE&state=${encodeURIComponent(state)}`
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "/api/workos/login?utm_source=newsletter&returnTo=%2Fw%2Fabc&organizationId=org_123"
    );
    expect(authenticateWithWorkOSCode).not.toHaveBeenCalled();
  });

  it("restarts the login when the nonce does not match the cookie", async () => {
    const state = encodeState({ nonce: "attacker-nonce" });

    const res = await honoApp.request(
      `/api/workos/callback?code=CODE&state=${encodeURIComponent(state)}`,
      { headers: { cookie: "workos_login_nonce=victim-nonce" } }
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/api/workos/login?");
    expect(authenticateWithWorkOSCode).not.toHaveBeenCalled();
  });

  it.each([
    "not-base64-json",
    encodeURIComponent(Buffer.from("null").toString("base64")),
  ])("restarts the login instead of failing on state %s", async (state) => {
    const res = await honoApp.request(
      `/api/workos/callback?code=CODE&state=${state}`,
      { headers: { cookie: "workos_login_nonce=victim-nonce" } }
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/api/workos/login?");
    expect(authenticateWithWorkOSCode).not.toHaveBeenCalled();
  });

  it("exchanges the code and clears the cookie when the nonce matches", async () => {
    const { state } = await startLogin();

    const res = await honoApp.request(
      `/api/workos/callback?code=CODE&state=${encodeURIComponent(encodeState(state))}`,
      { headers: { cookie: `workos_login_nonce=${state.nonce}` } }
    );

    expect(authenticateWithWorkOSCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CODE" })
    );
    expect(
      res.headers
        .getSetCookie()
        .some((c) => c.startsWith("workos_login_nonce=;"))
    ).toBe(true);
  });
});
