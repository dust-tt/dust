import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { LineType } from "@app/types/workspace_verification";
import { LINE_TYPES } from "@app/types/workspace_verification";

import { getTwilioClient } from "./client";

function isLineType(value: unknown): value is LineType {
  return typeof value === "string" && LINE_TYPES.some((t) => t === value);
}

// SMS pumping risk threshold (0-100). Numbers with risk score >= this are rejected.
const SMS_PUMPING_RISK_THRESHOLD = 60;

export type PhoneLookupResult = {
  lineType: LineType;
  smsPumpingRiskScore: number;
  isValidMobile: boolean;
  isHighSmsPumpingRisk: boolean;
};

export type PhoneLookupErrorCode =
  | "invalid_phone_number"
  | "lookup_failed"
  | "not_mobile"
  | "high_sms_pumping_risk";

export class PhoneLookupError extends Error {
  constructor(
    public readonly code: PhoneLookupErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PhoneLookupError";
  }
}

export async function lookupPhoneNumber(
  phoneNumber: string
): Promise<Result<PhoneLookupResult, PhoneLookupError>> {
  const client = getTwilioClient();

  let lookup;
  try {
    lookup = await client.lookups.v2.phoneNumbers(phoneNumber).fetch({
      fields: "line_type_intelligence,sms_pumping_risk",
    });
  } catch (error) {
    const err = normalizeError(error);
    if (err.message.includes("not valid")) {
      return new Err(
        new PhoneLookupError("invalid_phone_number", "Invalid phone number")
      );
    }
    return new Err(
      new PhoneLookupError(
        "lookup_failed",
        `Phone lookup failed: ${err.message}`
      )
    );
  }

  const lineTypeIntelligence = lookup.lineTypeIntelligence;
  const smsPumpingRisk = lookup.smsPumpingRisk;

  const rawLineType = lineTypeIntelligence?.type;
  const lineType: LineType = isLineType(rawLineType) ? rawLineType : "unknown";

  const smsPumpingRiskScore = smsPumpingRisk?.smsPumpingRiskScore ?? 0;

  const isValidMobile = lineType === "mobile";
  const isHighSmsPumpingRisk =
    smsPumpingRiskScore >= SMS_PUMPING_RISK_THRESHOLD;

  if (!isValidMobile) {
    return new Err(
      new PhoneLookupError(
        "not_mobile",
        `Phone number is not a mobile number (type: ${lineType})`
      )
    );
  }

  if (isHighSmsPumpingRisk) {
    return new Err(
      new PhoneLookupError(
        "high_sms_pumping_risk",
        `Phone number has high SMS pumping risk (score: ${smsPumpingRiskScore})`
      )
    );
  }

  return new Ok({
    lineType,
    smsPumpingRiskScore,
    isValidMobile,
    isHighSmsPumpingRisk,
  });
}
