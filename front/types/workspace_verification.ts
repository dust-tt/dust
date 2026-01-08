// Computed status (derived from verifiedAt).
export const VERIFICATION_STATUSES = [
  "pending",
  "verified",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// API request/response types.
export type StartVerificationRequest = {
  phoneNumber: string;
};

export type StartVerificationResponse = {
  success: true;
  message: string;
};

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
  | "phone_already_used_error";

export type VerificationErrorResponse = {
  error: {
    type: VerificationErrorType;
    message: string;
    retryAfterSeconds?: number; // Unix timestamp (seconds).
  };
};

// Twilio Lookup API types.
export const LINE_TYPES = [
  "mobile",
  "landline",
  "fixedVoip",
  "nonFixedVoip",
  "personal",
  "tollFree",
  "premium",
  "sharedCost",
  "uan",
  "voicemail",
  "pager",
  "unknown",
] as const;
export type LineType = (typeof LINE_TYPES)[number];

export const SMS_PUMPING_RISK_CATEGORIES = ["low", "medium", "high"] as const;
export type SmsPumpingRiskCategory =
  (typeof SMS_PUMPING_RISK_CATEGORIES)[number];
