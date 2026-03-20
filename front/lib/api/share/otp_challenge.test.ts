import { sendEmailWithTemplate } from "@app/lib/api/email";
import {
  generateFrameOtpChallenge,
  sendFrameOtpEmail,
  validateFrameOtpChallenge,
} from "@app/lib/api/share/otp_challenge";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: vi.fn().mockResolvedValue(1),
}));

vi.mock("@app/lib/api/email", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/email")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...mod,
    sendEmailWithTemplate: vi.fn().mockResolvedValue(new Ok(undefined)),
  };
});

const EMAIL = "user@example.com";
const SHARE_TOKEN = "share-token-abc";

describe("generateFrameOtpChallenge", () => {
  it("returns Ok with a 6-digit code string", async () => {
    const result = await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.code).toMatch(/^\d{6}$/);
    }
  });

  it("stores the challenge in Redis (verifiable via validate)", async () => {
    const genResult = await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
    });
    expect(genResult.isOk()).toBe(true);
    if (!genResult.isOk()) {
      return;
    }

    const validateResult = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
      submittedCode: genResult.value.code,
    });
    expect(validateResult.isOk()).toBe(true);
  });

  it("returns Err('rate_limited') when rateLimiter returns 0", async () => {
    vi.mocked(rateLimiter).mockResolvedValueOnce(0);

    const result = await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("rate_limited");
    }
  });
});

describe("validateFrameOtpChallenge", () => {
  it("returns Ok on correct code", async () => {
    const genResult = await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
    });
    expect(genResult.isOk()).toBe(true);
    if (!genResult.isOk()) {
      return;
    }

    const result = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
      submittedCode: genResult.value.code,
    });
    expect(result.isOk()).toBe(true);
  });

  it("returns Err('expired') when no challenge exists", async () => {
    const result = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
      submittedCode: "123456",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("expired");
    }
  });

  it("returns Err('invalid_code') on wrong code", async () => {
    const genResult = await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
    });
    expect(genResult.isOk()).toBe(true);

    const result = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
      submittedCode: "000000",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("invalid_code");
    }
  });

  it("returns Err('max_attempts') after 5 wrong attempts", async () => {
    await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
    });

    for (let i = 0; i < 5; i++) {
      const result = await validateFrameOtpChallenge({
        email: EMAIL,
        shareToken: SHARE_TOKEN,
        submittedCode: "000000",
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("invalid_code");
      }
    }

    const finalResult = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
      submittedCode: "000000",
    });
    expect(finalResult.isErr()).toBe(true);
    if (finalResult.isErr()) {
      expect(finalResult.error).toBe("max_attempts");
    }
  });

  it("returns Err('rate_limited') when verify rate limiter is exhausted", async () => {
    await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
    });

    // The rateLimiter is called by both generate and validate.
    // Mock it to return 0 on the next call (which will be validate's rate limiter).
    vi.mocked(rateLimiter).mockResolvedValueOnce(0);

    const result = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
      submittedCode: "123456",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("rate_limited");
    }
  });

  it("deletes the challenge after successful validation", async () => {
    const genResult = await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
    });
    expect(genResult.isOk()).toBe(true);
    if (!genResult.isOk()) {
      return;
    }

    const firstValidation = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
      submittedCode: genResult.value.code,
    });
    expect(firstValidation.isOk()).toBe(true);

    const secondValidation = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: SHARE_TOKEN,
      submittedCode: genResult.value.code,
    });
    expect(secondValidation.isErr()).toBe(true);
    if (secondValidation.isErr()) {
      expect(secondValidation.error).toBe("expired");
    }
  });

  it("code is specific to shareToken+email combination", async () => {
    const genResult = await generateFrameOtpChallenge({
      email: EMAIL,
      shareToken: "token-A",
    });
    expect(genResult.isOk()).toBe(true);
    if (!genResult.isOk()) {
      return;
    }

    const result = await validateFrameOtpChallenge({
      email: EMAIL,
      shareToken: "token-B",
      submittedCode: genResult.value.code,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("expired");
    }
  });
});

describe("sendFrameOtpEmail", () => {
  it("calls sendEmailWithTemplate with correct params", async () => {
    const result = await sendFrameOtpEmail({
      to: "user@example.com",
      code: "123456",
      sharedByName: "Alice",
    });

    expect(result.isOk()).toBe(true);
    expect(sendEmailWithTemplate).toHaveBeenCalledOnce();
    expect(sendEmailWithTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        from: { name: "Dust team", email: "support@dust.tt" },
        subject: "Your Dust login code",
      })
    );

    const call = vi.mocked(sendEmailWithTemplate).mock.calls[0][0];
    expect(call.body).toContain("Alice");
    expect(call.body).toContain("123456");
    expect(call.body).toContain("15 minutes");
  });
});
