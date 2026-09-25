import { sendEmailWithTemplate } from "@app/lib/api/email";
import {
  generateFrameOtpChallenge,
  getFrameFunctionSharingConflict,
  sendFrameOtpEmail,
  validateFrameOtpChallenge,
} from "@app/lib/api/share/frame_sharing";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SharingGrantFactory } from "@app/tests/utils/SharingGrantFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import assert from "assert";
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

describe("getFrameFunctionSharingConflict", () => {
  const DECLARES_FUNCTIONS = { declaresFunctions: true };

  async function setupFrame() {
    const { authenticator: auth, user } = await createResourceTest({
      role: "admin",
    });
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 32,
      status: "ready",
      useCase: "conversation",
    });
    await frame.ensureShareableFrame(auth);

    return { auth, frame, user };
  }

  it("returns no conflict for a Frame shared with the workspace only", async () => {
    const { auth, frame } = await setupFrame();
    await frame.setShareScope(auth, "workspace_and_emails");

    expect(
      await getFrameFunctionSharingConflict(auth, frame, DECLARES_FUNCTIONS)
    ).toBeNull();
  });

  it("reports a conflict when the Frame is shared publicly", async () => {
    const { auth, frame } = await setupFrame();
    await frame.setShareScope(auth, "public");

    const conflict = await getFrameFunctionSharingConflict(
      auth,
      frame,
      DECLARES_FUNCTIONS
    );
    assert(conflict, "Expected a sharing conflict");
    expect(conflict).toContain("anyone holding its link");
    expect(conflict).toContain("restrict the Frame's sharing");
  });

  it("reports a conflict when a grant reaches an email outside the workspace", async () => {
    const { auth, frame } = await setupFrame();
    await frame.setShareScope(auth, "workspace_and_emails");
    await SharingGrantFactory.create(auth, frame, {
      kind: "email",
      value: "outsider@example.com",
    });

    const conflict = await getFrameFunctionSharingConflict(
      auth,
      frame,
      DECLARES_FUNCTIONS
    );
    assert(conflict, "Expected a sharing conflict");
    expect(conflict).toContain("1 recipient outside the workspace");
  });

  it("returns no conflict when every grant is a workspace member", async () => {
    const { auth, frame, user } = await setupFrame();
    await frame.setShareScope(auth, "workspace_and_emails");
    await SharingGrantFactory.create(auth, frame, {
      kind: "email",
      value: user.email,
    });

    expect(
      await getFrameFunctionSharingConflict(auth, frame, DECLARES_FUNCTIONS)
    ).toBeNull();
  });

  it("returns no conflict for a publicly shared Frame whose update declares no function", async () => {
    const { auth, frame } = await setupFrame();
    await frame.setShareScope(auth, "public");

    expect(
      await getFrameFunctionSharingConflict(auth, frame, {
        declaresFunctions: false,
      })
    ).toBeNull();
  });

  it("reports a conflict for a publicly shared Frame whose active publication already declares functions", async () => {
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace, user.id);
    const { frame } = await createTestFrameFunction(auth, { space });
    await frame.setShareScope(auth, "public");

    expect(
      await getFrameFunctionSharingConflict(auth, frame, DECLARES_FUNCTIONS)
    ).toContain("anyone holding its link");
  });
});
