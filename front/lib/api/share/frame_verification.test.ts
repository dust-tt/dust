import { sendEmailWithTemplate } from "@app/lib/api/email";
import {
  requestFrameEmailVerification,
  verifyFrameEmailCode,
} from "@app/lib/api/share/frame_verification";
import { ExternalViewerSessionResource } from "@app/lib/resources/external_viewer_session_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { requestFrameVerificationCode } from "@app/tests/utils/frame_verification";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SharingGrantFactory } from "@app/tests/utils/SharingGrantFactory";
import { frameContentType } from "@app/types/files";
import { Err } from "@app/types/shared/result";
import { assert, describe, expect, it, vi } from "vitest";

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

async function setup() {
  const { authenticator: auth, workspace, user } = await createResourceTest({});
  const file = await FileFactory.create(auth, user, {
    contentType: frameContentType,
    fileName: "frame.html",
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
  });
  await file.setShareScope(auth, "emails_only");
  const grant = await SharingGrantFactory.create(auth, file, {
    kind: "domain",
    value: "example.com",
  });
  const info = await file.getShareInfo();
  assert(info);
  const shareToken = info.shareUrl.split("/").at(-1);
  assert(shareToken);
  return {
    auth,
    workspace,
    file,
    grant,
    shareToken,
    email: "alice@example.com",
  };
}

describe("Frame email verification", () => {
  it("emails a code, issues an individual session, and consumes the code", async () => {
    const { workspace, email, shareToken } = await setup();
    const code = await requestFrameVerificationCode({
      shareToken,
      email: email.toUpperCase(),
    });
    expect(sendEmailWithTemplate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: email,
        subject: "Your Dust login code",
      })
    );
    const result = await verifyFrameEmailCode({
      shareToken,
      email: email.toUpperCase(),
      code,
    });
    assert(result.isOk());
    expect(result.value).toBeInstanceOf(ExternalViewerSessionResource);
    const session = await ExternalViewerSessionResource.fetchByToken(
      workspace,
      result.value.sessionToken
    );
    expect(session?.email).toBe(email);
    expect(await verifyFrameEmailCode({ shareToken, email, code })).toEqual(
      new Err("expired")
    );
  });

  it("does not send codes or expose missing shares, grants, or unsupported scopes", async () => {
    const { auth, file, shareToken, email } = await setup();
    for (const request of [
      { shareToken: "00000000-0000-0000-0000-000000000000", email },
      { shareToken, email: "alice@sub.example.com" },
      { shareToken, email: "alice@example.org" },
    ]) {
      expect((await requestFrameEmailVerification(request)).isOk()).toBe(true);
    }
    await file.setShareScope(auth, "public");
    expect(
      (await requestFrameEmailVerification({ shareToken, email })).isOk()
    ).toBe(true);
    expect(sendEmailWithTemplate).not.toHaveBeenCalled();
  });

  it("checks codes before exposing grant access and rechecks a revoked grant", async () => {
    const { auth, grant, shareToken, email } = await setup();
    expect(
      await verifyFrameEmailCode({
        shareToken,
        email: "nobody@example.org",
        code: "123456",
      })
    ).toEqual(new Err("expired"));
    const code = await requestFrameVerificationCode({ shareToken, email });
    expect((await grant.revoke(auth)).isOk()).toBe(true);
    expect(await verifyFrameEmailCode({ shareToken, email, code })).toEqual(
      new Err("no_access")
    );
  });

  it("binds a code to its email and shared file", async () => {
    const first = await setup();
    const second = await setup();
    const code = await requestFrameVerificationCode(first);
    expect(
      await verifyFrameEmailCode({
        shareToken: second.shareToken,
        email: first.email,
        code,
      })
    ).toEqual(new Err("expired"));
    expect(
      await verifyFrameEmailCode({
        shareToken: first.shareToken,
        email: "bob@example.com",
        code,
      })
    ).toEqual(new Err("expired"));
    expect((await verifyFrameEmailCode({ ...first, code })).isOk()).toBe(true);
  });

  it("rejects wrong codes and locks a challenge after five failed attempts", async () => {
    const request = await setup();
    await requestFrameVerificationCode(request);
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(
        await verifyFrameEmailCode({ ...request, code: "000000" })
      ).toEqual(new Err("invalid_code"));
    }
    expect(await verifyFrameEmailCode({ ...request, code: "000000" })).toEqual(
      new Err("max_attempts")
    );
  });

  it("rate limits requests and verification separately", async () => {
    const request = await setup();
    vi.mocked(rateLimiter).mockResolvedValueOnce(0);
    expect(await requestFrameEmailVerification(request)).toEqual(
      new Err("rate_limited")
    );
    expect(sendEmailWithTemplate).not.toHaveBeenCalled();
    const code = await requestFrameVerificationCode(request);
    vi.mocked(rateLimiter).mockResolvedValueOnce(0);
    expect(await verifyFrameEmailCode({ ...request, code })).toEqual(
      new Err("rate_limited")
    );
  });
});
