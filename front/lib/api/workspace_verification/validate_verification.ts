import { checkOtp } from "@app/lib/api/workspace_verification/twilio";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { VerificationErrorType } from "@app/types/workspace_verification";

export type ValidateVerificationError = {
  type: VerificationErrorType;
  message: string;
};

export async function validateVerification(
  auth: Authenticator,
  phoneNumber: string,
  code: string
): Promise<Result<{ verified: true }, ValidateVerificationError>> {
  const workspace = auth.getNonNullableWorkspace();
  const phoneNumberHash =
    WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

  const attempt = await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
    auth,
    phoneNumberHash
  );

  if (!attempt) {
    return new Err({
      type: "verification_error",
      message:
        "No pending verification found. Please start a new verification.",
    });
  }

  if (attempt.status === "verified") {
    return new Err({
      type: "invalid_request_error",
      message: "This workspace is already verified.",
    });
  }

  const verifyResult = await checkOtp(phoneNumber, code);
  if (verifyResult.isErr()) {
    const error = verifyResult.error;
    logger.warn(
      {
        workspaceId: workspace.sId,
        phoneNumberHash,
        errorCode: error.code,
      },
      "OTP verification failed"
    );

    if (error.code === "expired") {
      return new Err({
        type: "verification_error",
        message: "Verification code has expired. Please request a new code.",
      });
    }
    if (error.code === "invalid_code") {
      return new Err({
        type: "verification_error",
        message: "Invalid verification code. Please try again.",
      });
    }

    return new Err({
      type: "verification_error",
      message: "Failed to verify code. Please try again.",
    });
  }

  await attempt.markVerified();

  logger.info(
    {
      workspaceId: workspace.sId,
      phoneNumberHash,
      attemptModelId: attempt.id,
    },
    "Workspace verification completed successfully"
  );

  return new Ok({ verified: true });
}
