import { trustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type {
  LineType,
  PhoneLookupErrorCode,
  PhoneLookupResult,
  RiskRecommendation,
} from "@app/types/workspace_verification";
import {
  LINE_TYPES,
  RISK_RECOMMENDATIONS,
} from "@app/types/workspace_verification";
import { z } from "zod";

import { getPersonaClient } from "./client";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 5;

const PersonaCreateReportResponseSchema = z.object({
  data: z.object({
    type: z.string(),
    id: z.string(),
  }),
});

const PersonaReportResponseSchema = z.object({
  data: z.object({
    type: z.string(),
    id: z.string(),
    attributes: z.object({
      status: z.string(),
      "phone-number": z.string().optional(),
      "phone-type": z.string().optional(),
      "phone-carrier": z.string().nullable().optional(),
      "phone-risk-level": z.string().optional(),
      "phone-risk-score": z.number().optional(),
      "phone-risk-recommendation": z.string().optional(),
      "phone-risk-sim-swap": z.string().nullable().optional(),
    }),
  }),
});

type PersonaReportResponse = z.infer<typeof PersonaReportResponseSchema>;

function isLineType(value: unknown): value is LineType {
  return typeof value === "string" && LINE_TYPES.some((t) => t === value);
}

function isRiskRecommendation(value: unknown): value is RiskRecommendation {
  return (
    typeof value === "string" && RISK_RECOMMENDATIONS.some((r) => r === value)
  );
}

function normalizePhoneType(personaPhoneType: string): LineType {
  const mapping: Record<string, LineType> = {
    MOBILE: "mobile",
    FIXED_LINE: "fixed_line",
    PREPAID: "prepaid",
    TOLL_FREE: "toll_free",
    VOIP: "voip",
    PAGER: "pager",
    PAYPHONE: "payphone",
    INVALID: "invalid",
    RESTRICTED_PREMIUM: "restricted_premium",
    PERSONAL: "personal",
    VOICEMAIL: "voicemail",
    OTHER: "other",
  };

  const normalized = mapping[personaPhoneType];
  if (isLineType(normalized)) {
    return normalized;
  }
  return "unknown";
}

function normalizeRiskRecommendation(
  personaRecommendation: string
): RiskRecommendation {
  const lowercased = personaRecommendation.toLowerCase();
  if (isRiskRecommendation(lowercased)) {
    return lowercased;
  }
  return "flag";
}

export class PhoneLookupError extends Error {
  constructor(
    public readonly code: PhoneLookupErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PhoneLookupError";
  }
}

function isCompletedReport(
  attrs: PersonaReportResponse["data"]["attributes"]
): boolean {
  return (
    attrs.status === "ready" &&
    typeof attrs["phone-type"] === "string" &&
    typeof attrs["phone-risk-score"] === "number" &&
    typeof attrs["phone-risk-recommendation"] === "string"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createReport(
  client: { baseUrl: string; apiKey: string },
  phoneNumber: string
): Promise<Result<string, PhoneLookupError>> {
  let response;
  try {
    response = await trustedFetch(`${client.baseUrl}/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "report/phone-number",
          attributes: {
            query: {
              "phone-number": phoneNumber,
            },
          },
        },
      }),
    });
  } catch (error) {
    const err = normalizeError(error);
    logger.error({ err }, "[Persona] createReport error");
    return new Err(
      new PhoneLookupError(
        "lookup_failed",
        "Phone lookup failed. Please try again."
      )
    );
  }

  if (!response.ok) {
    const statusCode = response.status;
    if (statusCode === 400 || statusCode === 422) {
      return new Err(
        new PhoneLookupError("invalid_phone_number", "Invalid phone number")
      );
    }
    return new Err(
      new PhoneLookupError(
        "lookup_failed",
        "Phone lookup failed. Please try again."
      )
    );
  }

  const data = await response.json();
  const parsed = PersonaCreateReportResponseSchema.safeParse(data);

  if (!parsed.success) {
    logger.error({ error: parsed.error }, "[Persona] Invalid response format");
    return new Err(
      new PhoneLookupError(
        "lookup_failed",
        "Phone lookup failed. Please try again."
      )
    );
  }

  return new Ok(parsed.data.data.id);
}

async function fetchReport(
  client: { baseUrl: string; apiKey: string },
  reportId: string
): Promise<Result<PersonaReportResponse, PhoneLookupError>> {
  let response;
  try {
    response = await trustedFetch(`${client.baseUrl}/reports/${reportId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${client.apiKey}`,
      },
    });
  } catch (error) {
    const err = normalizeError(error);
    logger.error({ err }, "[Persona] fetchReport error");
    return new Err(
      new PhoneLookupError(
        "lookup_failed",
        "Phone lookup failed. Please try again."
      )
    );
  }

  if (!response.ok) {
    return new Err(
      new PhoneLookupError(
        "lookup_failed",
        "Phone lookup failed. Please try again."
      )
    );
  }

  const data = await response.json();
  const parsed = PersonaReportResponseSchema.safeParse(data);

  if (!parsed.success) {
    logger.error({ error: parsed.error }, "[Persona] Invalid report format");
    return new Err(
      new PhoneLookupError(
        "lookup_failed",
        "Phone lookup failed. Please try again."
      )
    );
  }

  return new Ok(parsed.data);
}

export async function lookupPhoneNumber(
  phoneNumber: string
): Promise<Result<PhoneLookupResult, PhoneLookupError>> {
  const client = getPersonaClient();

  const createResult = await createReport(client, phoneNumber);
  if (createResult.isErr()) {
    return createResult;
  }

  const reportId = createResult.value;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const fetchResult = await fetchReport(client, reportId);
    if (fetchResult.isErr()) {
      return fetchResult;
    }

    const report = fetchResult.value;
    const attrs = report.data.attributes;

    if (!isCompletedReport(attrs)) {
      continue;
    }

    const phoneType = normalizePhoneType(attrs["phone-type"] ?? "");
    const riskRecommendation = normalizeRiskRecommendation(
      attrs["phone-risk-recommendation"] ?? ""
    );

    if (phoneType !== "mobile") {
      return new Err(
        new PhoneLookupError(
          phoneType === "prepaid" ? "prepaid_not_accepted" : "not_mobile",
          phoneType === "prepaid"
            ? "Prepaid phone numbers are not accepted for verification."
            : "Only mobile phone numbers are accepted for verification."
        )
      );
    }

    if (riskRecommendation === "block") {
      return new Err(
        new PhoneLookupError(
          "high_risk_blocked",
          "This phone number cannot be used for verification."
        )
      );
    }

    if (riskRecommendation === "flag") {
      return new Err(
        new PhoneLookupError(
          "flagged_for_review",
          "This phone number cannot be used for verification."
        )
      );
    }

    return new Ok({
      phoneType,
      phoneCarrier: attrs["phone-carrier"] ?? null,
      riskScore: attrs["phone-risk-score"] ?? 0,
      riskLevel: attrs["phone-risk-level"] ?? "unknown",
      riskRecommendation,
      simSwapRisk: attrs["phone-risk-sim-swap"] ?? null,
    });
  }

  // eng-oncall : we took the 80/20 route for Persona risks report,
  // Instead of webhooks we poll 5 times the reports api
  // The kind of reports we create are supposed to be super lightweight, so 5x2s should be enough
  throw Error("Unexpected: got no Persona report after 5 tries");
}
