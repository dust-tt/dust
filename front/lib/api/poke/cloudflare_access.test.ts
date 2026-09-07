import { beforeEach, describe, expect, it, vi } from "vitest";

const TEAM_DOMAIN = "https://dust.cloudflareaccess.com";
const AUD = "test-aud-tag";

const jwtVerifyMock = vi.hoisted(() => vi.fn());
const createRemoteJWKSetMock = vi.hoisted(() => vi.fn(() => "mock-jwks"));

vi.mock("jose", () => ({
  jwtVerify: jwtVerifyMock,
  createRemoteJWKSet: createRemoteJWKSetMock,
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getCloudflareAccessTeamDomain: () => TEAM_DOMAIN,
    getCloudflareAccessAud: () => AUD,
  },
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  clearCloudflareAccessJwksCacheForTests,
  getCloudflareAccessConfig,
  verifyCloudflareAccessJwt,
} from "./cloudflare_access";

describe("cloudflare_access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCloudflareAccessJwksCacheForTests();
  });

  describe("getCloudflareAccessConfig", () => {
    it("returns normalized team domain and aud", () => {
      expect(getCloudflareAccessConfig()).toEqual({
        teamDomain: TEAM_DOMAIN,
        aud: AUD,
      });
    });
  });

  describe("verifyCloudflareAccessJwt", () => {
    it("returns identity when JWT verifies", async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          email: "Seb@dust.tt",
          name: "Seb",
          sub: "cf-sub-1",
        },
      });

      const identity = await verifyCloudflareAccessJwt("valid.jwt.token");

      expect(identity).toEqual({
        email: "seb@dust.tt",
        name: "Seb",
        sub: "cf-sub-1",
      });
      expect(createRemoteJWKSetMock).toHaveBeenCalledWith(
        new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`)
      );
      expect(jwtVerifyMock).toHaveBeenCalledWith(
        "valid.jwt.token",
        "mock-jwks",
        {
          issuer: TEAM_DOMAIN,
          audience: AUD,
        }
      );
    });

    it("returns null when email claim is missing", async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: { sub: "cf-sub-1" },
      });

      expect(await verifyCloudflareAccessJwt("token")).toBeNull();
    });

    it("returns null when verification throws", async () => {
      jwtVerifyMock.mockRejectedValue(new Error("signature mismatch"));

      expect(await verifyCloudflareAccessJwt("bad.token")).toBeNull();
    });

    it("reuses the JWKS client across calls", async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          email: "seb@dust.tt",
          sub: "cf-sub-1",
        },
      });

      await verifyCloudflareAccessJwt("token-1");
      await verifyCloudflareAccessJwt("token-2");

      expect(createRemoteJWKSetMock).toHaveBeenCalledTimes(1);
    });
  });
});
