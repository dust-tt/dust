import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendOtp } from "./verify";

const mockVerificationsCreate = vi.fn();

vi.mock("./client", () => ({
  getTwilioClient: () => ({
    verify: {
      v2: {
        services: () => ({
          verifications: {
            create: mockVerificationsCreate,
          },
        }),
      },
    },
  }),
  getTwilioVerifyServiceSid: () => "test-service-sid",
}));

const VALID_PHONE_NUMBER = "+33612345678";
const CHINESE_PHONE_NUMBER = "+8613812345678";
const GEO_BLOCKED_PHONE_NUMBER = "+982112345678";
const VERIFICATION_SID = "VA123456789";

describe("sendOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return success when verification is created", async () => {
    mockVerificationsCreate.mockResolvedValue({
      sid: VERIFICATION_SID,
      status: "pending",
    });

    const result = await sendOtp(VALID_PHONE_NUMBER);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.verificationSid).toBe(VERIFICATION_SID);
      expect(result.value.status).toBe("pending");
    }
  });

  it("should return error for invalid phone number format", async () => {
    mockVerificationsCreate.mockRejectedValue(
      new Error("Invalid parameter `To`: +invalid")
    );

    const result = await sendOtp("+invalid");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Invalid phone number format");
    }
  });

  it("should return error when rate limit is reached", async () => {
    mockVerificationsCreate.mockRejectedValue(
      new Error("Max send attempts reached")
    );

    const result = await sendOtp(VALID_PHONE_NUMBER);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "Too many attempts. Please try again later."
      );
    }
  });

  describe("geo-blocked countries", () => {
    it("should return region unavailable error for China (error code 60220)", async () => {
      const twilioError = new Error(
        "Unable to create record: Permission to send an SMS has not been enabled for the region indicated by the 'To' number"
      );
      Object.assign(twilioError, { code: 60220 });
      mockVerificationsCreate.mockRejectedValue(twilioError);

      const result = await sendOtp(CHINESE_PHONE_NUMBER);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "SMS verification is not available in your region. Please contact support for alternatives."
        );
      }
    });

    it("should return region unavailable error for geo-blocked countries (error code 60605)", async () => {
      const twilioError = new Error(
        "The destination phone number has been blocked by Geo-Permissions"
      );
      Object.assign(twilioError, { code: 60605 });
      mockVerificationsCreate.mockRejectedValue(twilioError);

      const result = await sendOtp(GEO_BLOCKED_PHONE_NUMBER);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "SMS verification is not available in your region. Please contact support for alternatives."
        );
      }
    });

    it("should return temporary unavailable error for Fraud Guard block (error code 60410)", async () => {
      const twilioError = new Error(
        "Message blocked by Fraud Guard for phone number prefix"
      );
      Object.assign(twilioError, { code: 60410 });
      mockVerificationsCreate.mockRejectedValue(twilioError);

      const result = await sendOtp(VALID_PHONE_NUMBER);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "Verification temporarily unavailable. Please try again later."
        );
      }
    });
  });

  it("should return generic error for unknown Twilio errors", async () => {
    mockVerificationsCreate.mockRejectedValue(
      new Error("Unknown Twilio error")
    );

    const result = await sendOtp(VALID_PHONE_NUMBER);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "Failed to send verification code. Please try again."
      );
    }
  });
});
