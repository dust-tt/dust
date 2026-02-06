import { beforeEach, describe, expect, it, vi } from "vitest";

import { startVerification } from "@app/lib/api/workspace_verification/start_verification";
import { validateVerification } from "@app/lib/api/workspace_verification/validate_verification";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { WorkspaceVerificationAttemptFactory } from "@app/tests/utils/WorkspaceVerificationAttemptFactory";

const { mockLookupPhoneNumber } = vi.hoisted(() => {
  return {
    mockLookupPhoneNumber: vi.fn(),
  };
});

vi.mock("@app/lib/api/workspace_verification/persona", () => ({
  lookupPhoneNumber: mockLookupPhoneNumber,
  PhoneLookupError: class PhoneLookupError extends Error {
    constructor(
      public readonly code: string,
      message: string
    ) {
      super(message);
      this.name = "PhoneLookupError";
    }
  },
}));

const { mockSendOtp, mockCheckOtp } = vi.hoisted(() => {
  return {
    mockSendOtp: vi.fn(),
    mockCheckOtp: vi.fn(),
  };
});

vi.mock("@app/lib/api/workspace_verification/twilio", () => ({
  sendOtp: mockSendOtp,
  checkOtp: mockCheckOtp,
  VerifyOtpError: class VerifyOtpError extends Error {
    constructor(
      public readonly code: string,
      message: string
    ) {
      super(message);
      this.name = "VerifyOtpError";
    }
  },
}));

const { mockRateLimiter } = vi.hoisted(() => {
  return {
    mockRateLimiter: vi.fn(),
  };
});

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: mockRateLimiter,
}));

import { PhoneLookupError } from "@app/lib/api/workspace_verification/persona";
import { VerifyOtpError } from "@app/lib/api/workspace_verification/twilio";
import { Err, Ok } from "@app/types";

describe("workspace_verification", () => {
  let authW1: Authenticator;
  let authW2: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();

    const testSetup1 = await createResourceTest({ role: "admin" });
    authW1 = testSetup1.authenticator;

    const testSetup2 = await createResourceTest({ role: "admin" });
    authW2 = testSetup2.authenticator;

    mockRateLimiter.mockResolvedValue(10);
  });

  describe("startVerification", () => {
    const validPhoneNumber = "+33612345678";

    beforeEach(() => {
      mockLookupPhoneNumber.mockResolvedValue(
        new Ok({
          lineType: "mobile",
          smsPumpingRiskScore: 0,
          isValidMobile: true,
          isHighSmsPumpingRisk: false,
        })
      );
      mockSendOtp.mockResolvedValue(
        new Ok({
          verificationSid: "VA123456789",
          status: "pending",
        })
      );
    });

    it("should create a new verification attempt on success", async () => {
      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isOk()).toBe(true);
      expect(mockLookupPhoneNumber).toHaveBeenCalledWith(validPhoneNumber);
      expect(mockSendOtp).toHaveBeenCalledWith(validPhoneNumber);

      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      const attempt =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          phoneNumberHash
        );
      expect(attempt).not.toBeNull();
      expect(attempt?.attemptNumber).toBe(1);
    });

    it("should record new attempt on existing unverified attempt", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      mockSendOtp.mockResolvedValue(
        new Ok({
          verificationSid: "VA987654321",
          status: "pending",
        })
      );

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isOk()).toBe(true);

      const attempt =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          phoneNumberHash
        );
      expect(attempt?.attemptNumber).toBe(2);
      expect(attempt?.twilioVerificationSid).toBe("VA987654321");
    });

    it("should return error if workspace is already verified", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });
      await attempt.markVerified();

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_request_error");
        expect(result.error.message).toBe(
          "This workspace is already verified."
        );
      }
    });

    it("should return error if phone is already verified in another workspace", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });
      await attempt.markVerified();

      const result = await startVerification(authW2, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("phone_already_used_error");
        expect(result.error.message).toBe(
          "This phone number is already associated with another workspace."
        );
      }
    });

    it("should return error if phone lookup fails with not_mobile", async () => {
      mockLookupPhoneNumber.mockResolvedValue(
        new Err(new PhoneLookupError("not_mobile", "Phone is not mobile"))
      );

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_request_error");
        expect(result.error.message).toBe(
          "Only mobile phone numbers are accepted for verification."
        );
      }
    });

    it("should return error if phone lookup fails with prepaid_not_accepted", async () => {
      mockLookupPhoneNumber.mockResolvedValue(
        new Err(
          new PhoneLookupError(
            "prepaid_not_accepted",
            "Prepaid phone numbers are not accepted for verification."
          )
        )
      );

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_request_error");
        expect(result.error.message).toBe(
          "Prepaid phone numbers are not accepted for verification."
        );
      }
    });

    it("should return error if phone is flagged as high risk", async () => {
      mockLookupPhoneNumber.mockResolvedValue(
        new Err(new PhoneLookupError("high_risk_blocked", "High risk blocked"))
      );

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_request_error");
        expect(result.error.message).toBe(
          "This phone number cannot be used for verification."
        );
      }
    });

    it("should return error if phone is flagged for review", async () => {
      mockLookupPhoneNumber.mockResolvedValue(
        new Err(
          new PhoneLookupError("flagged_for_review", "Flagged for review")
        )
      );

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_request_error");
        expect(result.error.message).toBe(
          "This phone number cannot be used for verification."
        );
      }
    });

    it("should return error if phone number is invalid", async () => {
      mockLookupPhoneNumber.mockResolvedValue(
        new Err(
          new PhoneLookupError("invalid_phone_number", "Invalid phone number")
        )
      );

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_request_error");
        expect(result.error.message).toBe("Invalid phone number");
      }
    });

    it("should return error if phone rate limit is exceeded", async () => {
      mockRateLimiter.mockResolvedValueOnce(0);

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("rate_limit_error");
        expect(result.error.message).toBe(
          "Too many verification attempts for this phone number."
        );
        expect(result.error.retryAfterSeconds).toBeDefined();
      }
    });

    it("should return error if workspace rate limit is exceeded", async () => {
      mockRateLimiter.mockResolvedValueOnce(10).mockResolvedValueOnce(0);

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("rate_limit_error");
        expect(result.error.message).toBe(
          "Too many different phone numbers attempted for this workspace today."
        );
      }
    });

    it("should return error if sending OTP fails", async () => {
      mockSendOtp.mockResolvedValue(new Err(new Error("Failed to send")));

      const result = await startVerification(authW1, validPhoneNumber);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("verification_error");
        expect(result.error.message).toBe(
          "Failed to send verification code. Please try again."
        );
      }
    });
  });

  describe("validateVerification", () => {
    const validPhoneNumber = "+33612345678";
    const validCode = "123456";

    beforeEach(() => {
      mockCheckOtp.mockResolvedValue(
        new Ok({
          valid: true,
          status: "approved",
        })
      );
    });

    it("should mark attempt as verified on success", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      const result = await validateVerification(
        authW1,
        validPhoneNumber,
        validCode
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.verified).toBe(true);
      }

      const attempt =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          phoneNumberHash
        );
      expect(attempt?.status).toBe("verified");
      expect(attempt?.verifiedAt).not.toBeNull();
    });

    it("should return error if no pending verification found", async () => {
      const result = await validateVerification(
        authW1,
        validPhoneNumber,
        validCode
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("verification_error");
        expect(result.error.message).toBe(
          "No pending verification found. Please start a new verification."
        );
      }
    });

    it("should return error if workspace is already verified", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });
      await attempt.markVerified();

      const result = await validateVerification(
        authW1,
        validPhoneNumber,
        validCode
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_request_error");
        expect(result.error.message).toBe(
          "This workspace is already verified."
        );
      }
    });

    it("should return error if OTP is invalid", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      mockCheckOtp.mockResolvedValue(
        new Err(new VerifyOtpError("invalid_code", "Invalid code"))
      );

      const result = await validateVerification(
        authW1,
        validPhoneNumber,
        "000000"
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("verification_error");
        expect(result.error.message).toBe(
          "Invalid verification code. Please try again."
        );
      }
    });

    it("should return error if OTP is expired", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      mockCheckOtp.mockResolvedValue(
        new Err(new VerifyOtpError("expired", "Code expired"))
      );

      const result = await validateVerification(
        authW1,
        validPhoneNumber,
        validCode
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("verification_error");
        expect(result.error.message).toBe(
          "Verification code has expired. Please request a new code."
        );
      }
    });

    it("should not allow verifying from different workspace", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber(validPhoneNumber);
      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      const result = await validateVerification(
        authW2,
        validPhoneNumber,
        validCode
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("verification_error");
        expect(result.error.message).toBe(
          "No pending verification found. Please start a new verification."
        );
      }
    });
  });
});
