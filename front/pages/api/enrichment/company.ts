// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import {
  ENTERPRISE_THRESHOLD,
  enrichCompanyFromDomain,
} from "@app/lib/api/enrichment/company";
import { fetchUsersFromWorkOSWithEmails } from "@app/lib/api/workos/user";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { extractDomain, hasValidMxRecords } from "@app/lib/utils/email";
import { isPersonalEmailDomain } from "@app/lib/utils/personal_email_domains";
import logger from "@app/logger/logger";
import { sendUserOperationMessage } from "@app/types/shared/user_operation";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

const GTM_LEADS_SLACK_CHANNEL_ID = "C0A1XKES0JY";

interface EnrichmentResponse {
  success: boolean;
  companySize?: number;
  companyName?: string;
  redirectUrl: string;
  error?: string;
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EnrichmentResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      redirectUrl: "/home/pricing",
      error: "Method not allowed",
    });
  }

  const { email } = req.body;

  if (!isString(email)) {
    return res.status(400).json({
      success: false,
      redirectUrl: "/home/pricing",
      error: "Email is required",
    });
  }

  const domain = extractDomain(email);

  if (!domain) {
    return res.status(400).json({
      success: false,
      redirectUrl: "/home/pricing",
      error: "Invalid email format",
    });
  }

  const encodedEmail = encodeURIComponent(email);

  // Check if user already exists in WorkOS - if so, redirect to login.
  const existingUsers = await fetchUsersFromWorkOSWithEmails([email]);
  if (existingUsers.length > 0) {
    return res.status(200).json({
      success: true,
      redirectUrl: `/api/workos/login?loginHint=${encodedEmail}`,
    });
  }

  // Skip enrichment for personal email domains (gmail, outlook, yahoo, etc.)
  // Redirect directly to signup
  if (isPersonalEmailDomain(domain)) {
    return res.status(200).json({
      success: true,
      redirectUrl: `/api/workos/login?screenHint=sign-up&loginHint=${encodedEmail}`,
    });
  }

  // Check if domain has auto-join enabled - redirect to sign-up (user doesn't exist yet)
  const isAutoJoinDomain =
    await WorkspaceResource.isDomainAutoJoinEnabled(domain);
  if (isAutoJoinDomain) {
    return res.status(200).json({
      success: true,
      redirectUrl: `/api/workos/login?screenHint=sign-up&loginHint=${encodedEmail}`,
    });
  }

  // Check if domain has valid MX records before calling Apollo
  const hasMx = await hasValidMxRecords(domain);
  if (!hasMx) {
    return res.status(400).json({
      success: false,
      redirectUrl: "/home/pricing",
      error: "Please use a valid work email address",
    });
  }

  // Enrich company data for work emails
  const { size, name, region, funding, revenue } =
    await enrichCompanyFromDomain(domain);

  // Determine redirect based on company size
  let redirectUrl: string;

  if (size === null) {
    // Unknown company size - default to signup (self-serve)
    redirectUrl = `/api/workos/login?screenHint=sign-up&loginHint=${encodedEmail}`;
  } else if (size <= ENTERPRISE_THRESHOLD) {
    // Small company - self-serve signup
    redirectUrl = `/api/workos/login?screenHint=sign-up&loginHint=${encodedEmail}`;
  } else {
    // Enterprise - contact sales with email and company data prefilled for HubSpot
    const params = new URLSearchParams();
    params.set("email", email);
    if (name) {
      params.set("company", name);
    }
    if (size) {
      // Map size to HubSpot headcount ranges
      let headcount: string;
      if (size <= 100) {
        headcount = "1-100";
      } else if (size <= 500) {
        headcount = "101-500";
      } else if (size <= 1000) {
        headcount = "501-1000";
      } else if (size <= 10000) {
        headcount = "1000-10000";
      } else {
        headcount = "10000+";
      }
      params.set("company_headcount_form", headcount);
    }
    if (region) {
      params.set("headquarters_region", region);
    }
    redirectUrl = `/home/contact?${params.toString()}`;
  }

  // Send Slack notification for all Apollo enrichments
  const destinationLabel = redirectUrl.includes("/home/contact")
    ? "Contact Sales"
    : "Self-serve Signup";

  const enrichmentDetails = [
    `*Email submitted:* ${email}`,
    `*Domain:* ${domain}`,
    `*Company:* ${name ?? "Unknown"}`,
    `*Company size:* ${size !== null ? `${size} employees` : "Unknown"}`,
    `*Region:* ${region ?? "Unknown"}`,
    `*Funding:* ${funding ?? "Unknown"}`,
    `*Revenue:* ${revenue ?? "Unknown"}`,
    `*Routed to:* ${destinationLabel}`,
  ].join("\n");

  void sendUserOperationMessage({
    message: `:email: New homepage email submission\n${enrichmentDetails}`,
    logger,
    channel: GTM_LEADS_SLACK_CHANNEL_ID,
  });

  return res.status(200).json({
    success: true,
    companySize: size ?? undefined,
    companyName: name ?? undefined,
    redirectUrl,
  });
}
