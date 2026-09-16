import { sendEmailWithTemplate } from "@app/lib/api/email";
import { requestFrameEmailVerification } from "@app/lib/api/share/frame_verification";
import assert from "assert";
import { vi } from "vitest";

// Requires the email gateway to be mocked by the calling test.
export async function requestFrameVerificationCode({
  shareToken,
  email,
}: {
  shareToken: string;
  email: string;
}): Promise<string> {
  const sendEmail = vi.mocked(sendEmailWithTemplate);
  sendEmail.mockClear();
  const result = await requestFrameEmailVerification({ shareToken, email });
  assert(result.isOk());
  const sent = sendEmail.mock.lastCall?.[0];
  assert(sent?.to === email.toLowerCase().trim());
  const code = sent.body.match(/\b\d{6}\b/)?.[0];
  assert(code, "Expected a six-digit verification code in the email");
  return code;
}
