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
import { createHono } from "@front-api/lib/hono";
import type { HandlerResult } from "@front-api/middlewares/utils";

interface EnrichmentResponse {
  success: boolean;
  companySize?: number;
  companyName?: string;
  redirectUrl: string;
  error?: string;
}

const GTM_LEADS_SLACK_CHANNEL_ID = "C0A1XKES0JY";

// Mounted at /api/enrichment/company.
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

  const encodedEmail = encodeURIComponent(email);

  // Check if user already exists in WorkOS — if so, redirect to login.
  const existingUsers = await fetchUsersFromWorkOSWithEmails([email]);
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

  return ctx.json({
    success: true,
    companySize: size ?? undefined,
    companyName: name ?? undefined,
    redirectUrl,
  });
});

export default app;
