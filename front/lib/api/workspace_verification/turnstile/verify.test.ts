import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstileToken } from "./verify";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getTurnstileSecretKey: () => "test-secret-key",
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VALID_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

function siteVerifyResponse(
  body: { success: boolean; "error-codes"?: string[] },
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}
) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe("verifyTurnstileToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Ok when Cloudflare confirms the token is valid", async () => {
    mockFetch.mockResolvedValue(siteVerifyResponse({ success: true }));

    const result = await verifyTurnstileToken({
      token: VALID_TOKEN,
      remoteIp: "1.2.3.4",
    });

    expect(result.isOk()).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe(SITEVERIFY_URL);
    expect(calledInit.method).toBe("POST");
    const body = new URLSearchParams(calledInit.body);
    expect(body.get("secret")).toBe("test-secret-key");
    expect(body.get("response")).toBe(VALID_TOKEN);
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("omits remoteip from the payload when not provided", async () => {
    mockFetch.mockResolvedValue(siteVerifyResponse({ success: true }));

    await verifyTurnstileToken({ token: VALID_TOKEN });

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    expect(body.has("remoteip")).toBe(false);
  });

  it("returns an `invalid` CaptchaError when Cloudflare rejects the token", async () => {
    mockFetch.mockResolvedValue(
      siteVerifyResponse({
        success: false,
        "error-codes": ["invalid-input-response"],
      })
    );

    const result = await verifyTurnstileToken({ token: "bad-token" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("invalid");
    }
  });

  it("returns a `network` CaptchaError when the request throws", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNRESET"));

    const result = await verifyTurnstileToken({ token: VALID_TOKEN });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("network");
    }
  });

  it("returns a `network` CaptchaError when Cloudflare returns a non-200", async () => {
    mockFetch.mockResolvedValue(
      siteVerifyResponse({ success: false }, { ok: false, status: 503 })
    );

    const result = await verifyTurnstileToken({ token: VALID_TOKEN });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("network");
    }
  });
});
