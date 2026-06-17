import {
  ENTERPRISE_THRESHOLD,
  enrichCompanyFromDomain,
} from "@app/lib/api/enrichment/company";
import { fetchUsersFromWorkOSWithEmails } from "@app/lib/api/workos/user";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isEmailValid } from "@app/lib/utils";
import { extractDomain, hasValidMxRecords } from "@app/lib/utils/email";
import { isPersonalEmailDomain } from "@app/lib/utils/personal_email_domains";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { sendUserOperationMessage } from "@app/types/shared/user_operation";
import { isString } from "@app/types/shared/utils/general";
import { createHono } from "@front-api/lib/hono";
import { getClientIpFromContext } from "@front-api/lib/request";
import type { HandlerResult } from "@front-api/middlewares/utils";

interface EnrichmentResponse {
  success: boolean;
  companySize?: number;
  companyName?: string;
  redirectUrl: string;
  error?: string;
}

const GTM_LEADS_SLACK_CHANNEL_ID = "C0A1XKES0JY";
const RATE_LIMIT_MAX_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function escapeSlackText(text: string): string {
  // Slack control characters must be HTML-escaped before being sent in a
  // message body. This prevents user-controlled strings from creating links,
  // mentions, or special mrkdwn commands such as <!channel>.
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatSlackValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }

  return escapeSlackText(String(value));
}

// Mounted at /api/enrichment/company.
const app = createHono();

/** @ignoreswagger */
app.post("/", async (ctx): HandlerResult<EnrichmentResponse> => {
  const clientIp = getClientIpFromContext(ctx);
  const remaining = await rateLimiter({
    key: `enrichment_company:ip:${clientIp}`,
    maxPerTimeframe: RATE_LIMIT_MAX_PER_MINUTE,
    timeframeSeconds: RATE_LIMIT_WINDOW_SECONDS,
    logger,
  });
  if (remaining <= 0) {
    return ctx.json(
      {
        success: false,
        redirectUrl: "/home/pricing",
        error: "Too many requests",
      },
      429
    );
  }

  const body = await ctx.req.json().catch(() => ({}));
  const { email } = body ?? {};

  const submittedEmail = isString(email) ? email.trim() : null;

  if (!submittedEmail) {
    return ctx.json(
      {
        success: false,
        redirectUrl: "/home/pricing",
        error: "Email is required",
      },
      400
    );
  }

  if (!isEmailValid(submittedEmail)) {
    return ctx.json(
      {
        success: false,
        redirectUrl: "/home/pricing",
        error: "Invalid email format",
      },
      400
    );
  }

  const domain = extractDomain(submittedEmail);

  if (!domain) {
    return ctx.json(
      {
        success: false,
        redirectUrl: "/home/pricing",
        error: "Invalid email format",
      },
      400
    );
  }

  const encodedEmail = encodeURIComponent(submittedEmail);

  // Check if user already exists in WorkOS — if so, redirect to login.
  const existingUsers = await fetchUsersFromWorkOSWithEmails([submittedEmail]);
  if (existingUsers.length > 0) {
    return ctx.json({
      success: true,
      redirectUrl: `/api/workos/login?loginHint=${encodedEmail}`,
    });
  }

  // Skip enrichment for personal email domains (gmail, outlook, yahoo, etc.).
  if (isPersonalEmailDomain(domain)) {
    return ctx.json({
      success: true,
      redirectUrl: `/api/workos/login?screenHint=sign-up&loginHint=${encodedEmail}`,
    });
  }

  // Check if domain has auto-join enabled — redirect to sign-up.
  const isAutoJoinDomain =
    await WorkspaceResource.isDomainAutoJoinEnabled(domain);
  if (isAutoJoinDomain) {
    return ctx.json({
      success: true,
      redirectUrl: `/api/workos/login?screenHint=sign-up&loginHint=${encodedEmail}`,
    });
  }

  // Check if domain has valid MX records before calling Apollo.
  const hasMx = await hasValidMxRecords(domain);
  if (!hasMx) {
    return ctx.json(
      {
        success: false,
        redirectUrl: "/home/pricing",
        error: "Please use a valid work email address",
      },
      400
    );
  }

  const { size, name, region, funding, revenue } =
    await enrichCompanyFromDomain(domain);

  let redirectUrl: string;
  if (size === null || size <= ENTERPRISE_THRESHOLD) {
    redirectUrl = `/api/workos/login?screenHint=sign-up&loginHint=${encodedEmail}`;
  } else {
    const params = new URLSearchParams();
    params.set("email", submittedEmail);
    if (name) {
      params.set("company", name);
    }
    if (size) {
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

  const destinationLabel = redirectUrl.includes("/home/contact")
    ? "Contact Sales"
    : "Self-serve Signup";

  const enrichmentDetails = [
    `Email submitted: ${formatSlackValue(submittedEmail)}`,
    `Domain: ${formatSlackValue(domain)}`,
    `Company: ${formatSlackValue(name)}`,
    `Company size: ${
      size !== null ? `${formatSlackValue(size)} employees` : "Unknown"
    }`,
    `Region: ${formatSlackValue(region)}`,
    `Funding: ${formatSlackValue(funding)}`,
    `Revenue: ${formatSlackValue(revenue)}`,
    `Routed to: ${formatSlackValue(destinationLabel)}`,
  ].join("\n");

  void sendUserOperationMessage({
    message: `:email: New homepage email submission\n${enrichmentDetails}`,
    logger,
    channel: GTM_LEADS_SLACK_CHANNEL_ID,
    mrkdwn: false,
    parse: "none",
  });

  return ctx.json({
    success: true,
    companySize: size ?? undefined,
    companyName: name ?? undefined,
    redirectUrl,
  });
});

export default app;
