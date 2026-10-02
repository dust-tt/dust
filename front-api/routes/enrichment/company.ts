import {
  ENTERPRISE_THRESHOLD,
  enrichCompanyFromDomain,
} from "@app/lib/api/enrichment/company";
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

const MAX_REQUESTS_PER_MINUTE = 10;

function escapeSlackText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Mounted at /api/enrichment/company.
/**
 * @cc [owner:tdraier,label:security] no-account-or-customer-disclosure
 * This route is unauthenticated. Its response (status, body fields, redirect target) MUST NOT
 * depend on Dust-internal data about the submitted email or its domain: whether a Dust/WorkOS user
 * exists for it, or whether a workspace owns or auto-joins the domain. Routing may only use the
 * email syntax, public DNS (MX), the personal-domain list and third-party company enrichment.
 */
/**
 * @cc [owner:tdraier,label:security;performance] rate-limited-enrichment
 * Requests MUST be rate limited per client IP before any third-party call (DNS, Apollo) or Slack
 * notification. Once over the limit, the route MUST return the generic sign-up redirect without
 * enrichment or notification, so legitimate visitors are never blocked from signing up.
 */
const app = createHono();

/** @ignoreswagger */
app.post("/", async (ctx): HandlerResult<EnrichmentResponse> => {
  const body = await ctx.req.json().catch(() => ({}));
  const { email } = body ?? {};

  if (!isString(email)) {
    return ctx.json(
      {
        success: false,
        redirectUrl: "/home/pricing",
        error: "Email is required",
      },
      400
    );
  }

  const domain = extractDomain(email);

  if (!domain || !isEmailValid(email)) {
    return ctx.json(
      {
        success: false,
        redirectUrl: "/home/pricing",
        error: "Invalid email format",
      },
      400
    );
  }

  const signUpUrl = `/api/workos/login?screenHint=sign-up&loginHint=${encodeURIComponent(email)}`;

  const remaining = await rateLimiter({
    key: `enrichment_company:${getClientIpFromContext(ctx)}`,
    maxPerTimeframe: MAX_REQUESTS_PER_MINUTE,
    timeframeSeconds: 60,
    logger,
  });
  if (remaining <= 0) {
    return ctx.json({ success: true, redirectUrl: signUpUrl });
  }

  // Skip enrichment for personal email domains (gmail, outlook, yahoo, etc.).
  if (isPersonalEmailDomain(domain)) {
    return ctx.json({ success: true, redirectUrl: signUpUrl });
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
    redirectUrl = signUpUrl;
  } else {
    const params = new URLSearchParams();
    params.set("email", email);
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
    `*Email submitted:* ${escapeSlackText(email)}`,
    `*Domain:* ${escapeSlackText(domain)}`,
    `*Company:* ${escapeSlackText(name ?? "Unknown")}`,
    `*Company size:* ${size !== null ? `${size} employees` : "Unknown"}`,
    `*Region:* ${escapeSlackText(region ?? "Unknown")}`,
    `*Funding:* ${escapeSlackText(funding ?? "Unknown")}`,
    `*Revenue:* ${escapeSlackText(revenue ?? "Unknown")}`,
    `*Routed to:* ${destinationLabel}`,
  ].join("\n");

  void sendUserOperationMessage({
    message: `:email: New homepage email submission\n${enrichmentDetails}`,
    logger,
    channel: GTM_LEADS_SLACK_CHANNEL_ID,
  });

  return ctx.json({
    success: true,
    companySize: size ?? undefined,
    companyName: name ?? undefined,
    redirectUrl,
  });
});

export default app;
