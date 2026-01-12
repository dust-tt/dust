import dns from "dns";
import type { NextApiRequest, NextApiResponse } from "next";
import { promisify } from "util";

import type {
  ContactSubmitResponse,
  TrackingParams,
} from "@app/components/home/contactFormSchema";
import { ContactFormSchema } from "@app/components/home/contactFormSchema";
import {
  getDefaultSchedulingUrl,
  submitToHubSpotForm,
} from "@app/lib/api/hubspot";
import { isPersonalEmailDomain } from "@app/lib/utils/personal_email_domains";
import logger from "@app/logger/logger";
import { sendUserOperationMessage } from "@app/types";

const resolveMx = promisify(dns.resolveMx);

const GTM_LEADS_SLACK_CHANNEL_ID = "C0A1XKES0JY";

// Headcount values that qualify as enterprise (>100 employees)
const QUALIFIED_HEADCOUNTS = ["101-500", "501-10000", "10000+"];

// Extract domain from email
function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

// Check if domain has valid MX records
async function hasValidMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
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
  const tracking = (req.body.tracking ?? {}) as TrackingParams;
  const pageUri = (req.body.pageUri as string) ?? "";
  const pageName = (req.body.pageName as string) ?? "Contact Dust";

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

  // Determine if lead is qualified based on self-reported headcount
  const isQualified = QUALIFIED_HEADCOUNTS.includes(formData.company_headcount_form);

  // Submit to HubSpot
  const hubspotResult = await submitToHubSpotForm({
    formData,
    tracking,
    context: {
      pageUri,
      pageName,
    },
  });

  if (hubspotResult.isErr()) {
    logger.error(
      { error: hubspotResult.error },
      "Failed to submit to HubSpot"
    );
    return res.status(500).json({
      success: false,
      isQualified: false,
      error: "Failed to submit form. Please try again.",
    });
  }

  // Send Slack notification for qualified leads
  if (isQualified) {
    const enrichmentDetails = [
      `:tada: *Qualified Lead from Contact Form*`,
      `*Email:* ${formData.email}`,
      `*Name:* ${formData.firstname ?? ""} ${formData.lastname ?? ""}`.trim(),
      `*Phone:* ${formData.phone ?? "Not provided"}`,
      `*Language:* ${formData.language}`,
      `*Headquarters Region:* ${formData.headquarters_region ?? "Not provided"}`,
      `*Company Headcount:* ${formData.company_headcount_form}`,
      `*How they want to use Dust:* ${formData.how_to_use_dust ?? "Not provided"}`,
      `*UTM Source:* ${tracking.utm_source ?? "Not tracked"}`,
      `*GCLID:* ${tracking.gclid ?? "Not tracked"}`,
    ].join("\n");

    void sendUserOperationMessage({
      message: enrichmentDetails,
      logger,
      channel: GTM_LEADS_SLACK_CHANNEL_ID,
    });
  }

  // Generate scheduling URL for qualified leads
  const schedulingUrl = isQualified
    ? getDefaultSchedulingUrl({
        email: formData.email,
        firstName: formData.firstname ?? "",
        lastName: formData.lastname ?? "",
      })
    : undefined;

  return res.status(200).json({
    success: true,
    isQualified,
    schedulingUrl,
  });
}
