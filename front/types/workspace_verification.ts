// Computed status (derived from verifiedAt).
export const VERIFICATION_STATUSES = ["pending", "verified"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// API request/response types.
export type StartVerificationRequest = {
  phoneNumber: string;
  captchaToken: string;
};

export type StartVerificationResponse =
  | { status: "code_sent"; message: string }
  | { status: "already_verified" };

export type VerifyCodeRequest = {
  phoneNumber: string;
  code: string;
};

export type VerifyCodeResponse = {
  success: true;
  verified: true;
};

// Error response.
export type VerificationErrorType =
  | "rate_limit_error"
  | "invalid_request_error"
  | "verification_error"
  | "phone_already_used_error"
  | "invalid_captcha";

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
