import type { APIErrorType } from "@app/types/error";

// Computed status (derived from verifiedAt).
export const VERIFICATION_STATUSES = ["pending", "verified"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type StartVerificationResponse =
  | { status: "code_sent"; message: string }
  | { status: "already_verified" };

export type VerifyCodeResponse = {
  success: true;
  verified: true;
};

// Error response.
/**
 * @cc [owner:sfriquet,label:error-handling;product] verification-error-is-api-error
 * Every `VerificationErrorType` MUST be an `APIErrorType`, so that the UI describes verification
 * errors from their type with `API_ERROR_MESSAGES`, and each distinct user-facing failure MUST
 * have its own type.
 */
export type VerificationErrorType = Extract<
  APIErrorType,
  | "rate_limit_error"
  | "invalid_captcha"
  | "phone_already_used_error"
  | "phone_number_not_mobile"
  | "phone_number_prepaid"
  | "phone_number_blocked"
  | "phone_number_invalid"
  | "phone_number_lookup_failed"
  | "verification_code_send_failed"
  | "verification_not_found"
  | "verification_code_expired"
  | "verification_code_invalid"
  | "verification_code_check_failed"
>;

export type VerificationErrorResponse = {
  error: {
    type: VerificationErrorType;
    message: string;
    retryAfterSeconds?: number; // Unix timestamp (seconds).
  };
};

// Persona Phone Risk Report types.
export const LINE_TYPES = [
  "mobile",
  "fixed_line",
  "prepaid",
  "toll_free",
  "voip",
  "pager",
  "payphone",
  "invalid",
  "restricted_premium",
  "personal",
  "voicemail",
  "other",
  "unknown",
] as const;
export type LineType = (typeof LINE_TYPES)[number];

export const RISK_RECOMMENDATIONS = ["allow", "flag", "block"] as const;
export type RiskRecommendation = (typeof RISK_RECOMMENDATIONS)[number];

export type PhoneLookupResult = {
  phoneType: LineType;
  phoneCarrier: string | null;
  riskScore: number;
  riskLevel: string;
  riskRecommendation: RiskRecommendation;
  simSwapRisk: string | null;
};

export type PhoneLookupErrorCode =
  | "invalid_phone_number"
  | "lookup_failed"
  // Persona accepted the report but did not finish risk analysis within our
  // poll window. Transient (Persona latency), not an error on our side.
  | "lookup_timeout"
  | "not_mobile"
  | "prepaid_not_accepted"
  | "high_risk_blocked"
  | "flagged_for_review";
