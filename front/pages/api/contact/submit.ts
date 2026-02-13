import { submitToHubSpotForm } from "@app/lib/api/hubspot";
import type {
  ContactFormData,
  ContactSubmitResponse,
  TrackingParams,
} from "@app/lib/api/hubspot/contactFormSchema";
import {
  ContactFormSchema,
  TrackingParamsSchema,
} from "@app/lib/api/hubspot/contactFormSchema";
import { extractDomain, hasValidMxRecords } from "@app/lib/utils/email";
import { isPersonalEmailDomain } from "@app/lib/utils/personal_email_domains";
import logger from "@app/logger/logger";
import { sendUserOperationMessage } from "@app/types/shared/user_operation";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

const GTM_LEADS_SLACK_CHANNEL_ID = "C0A1XKES0JY";

// Headcount value for small companies (<=100 employees) - not qualified for enterprise demo
const SMALL_COMPANY_HEADCOUNT = "1-100";

function sendQualifiedLeadSlackNotification(
  formData: ContactFormData,
  tracking: TrackingParams
): void {
  const enrichmentDetails = [
    `:tada: *Qualified Lead from Contact Form*`,
    `*Email:* ${formData.email}`,
    `*Name:* ${formData.firstname ?? ""} ${formData.lastname ?? ""}`.trim(),
    `*Phone:* ${formData.mobilephone ?? "Not provided"}`,
    `*Language:* ${formData.language}`,
    `*Headquarters Region:* ${formData.headquarters_region ?? "Not provided"}`,
    `*Company Headcount:* ${formData.company_headcount_form}`,
    `*How they want to use Dust:* ${formData.landing_use_cases ?? "Not provided"}`,
    `*UTM Source:* ${tracking.utm_source ?? "Not tracked"}`,
    `*GCLID:* ${tracking.gclid ?? "Not tracked"}`,
  ].join("\n");

  void sendUserOperationMessage({
    message: enrichmentDetails,
    logger,
    channel: GTM_LEADS_SLACK_CHANNEL_ID,
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ContactSubmitResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      isQualified: false,
      error: "Method not allowed",
    });
  }

  // Parse and validate form data
  const parseResult = ContactFormSchema.safeParse(req.body.formData);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      isQualified: false,
      error: parseResult.error.errors[0]?.message ?? "Invalid form data",
    });
  }

  const formData = parseResult.data;
  const tracking = TrackingParamsSchema.parse(req.body.tracking ?? {});
  const { pageUri: rawPageUri, pageName: rawPageName } = req.body;
  const pageUri = isString(rawPageUri) ? rawPageUri : "";
  const pageName = isString(rawPageName) ? rawPageName : "Contact Dust";

  // Extract and validate domain
  const domain = extractDomain(formData.email);
  if (!domain) {
    return res.status(400).json({
      success: false,
      isQualified: false,
      error: "Invalid email format",
    });
  }

  // Check for personal email domains
  const isPersonalEmail = isPersonalEmailDomain(domain);

  // Check MX records for work emails
  if (!isPersonalEmail) {
    const hasMx = await hasValidMxRecords(domain);
    if (!hasMx) {
      return res.status(400).json({
        success: false,
        isQualified: false,
        error: "Please use a valid work email address",
      });
    }
  }

  // Determine if lead is qualified based on self-reported headcount (>100 employees)
  const isQualified =
    formData.company_headcount_form !== SMALL_COMPANY_HEADCOUNT;

  // Extract IP address from request headers
  const forwardedFor = req.headers["x-forwarded-for"];
  const ipAddress =
    (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(",")[0]
      ?.trim() ??
    req.socket.remoteAddress ??
    undefined;

  // Submit to HubSpot
  const hubspotResult = await submitToHubSpotForm({
    formData,
    tracking,
    context: {
      pageUri,
      pageName,
      ipAddress,
    },
  });

  if (hubspotResult.isErr()) {
    logger.error({ error: hubspotResult.error }, "Failed to submit to HubSpot");
    return res.status(500).json({
      success: false,
      isQualified: false,
      error: "Failed to submit form. Please try again.",
    });
  }

  // Send Slack notification for qualified leads
  if (isQualified) {
    sendQualifiedLeadSlackNotification(formData, tracking);
  }

  return res.status(200).json({
    success: true,
    isQualified,
  });
}
