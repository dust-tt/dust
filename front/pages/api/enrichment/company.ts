import dns from "dns";
import type { NextApiRequest, NextApiResponse } from "next";
import { promisify } from "util";

import config from "@app/lib/api/config";
import { fetchUsersFromWorkOSWithEmails } from "@app/lib/api/workos/user";
import { untrustedFetch } from "@app/lib/egress/server";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { isPersonalEmailDomain } from "@app/lib/utils/personal_email_domains";
import logger from "@app/logger/logger";
import { sendUserOperationMessage } from "@app/types";

const resolveMx = promisify(dns.resolveMx);

// Check if domain has valid MX records
async function hasValidMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    // ENODATA, ENOTFOUND, etc. - domain has no MX records
    return false;
  }
}

// Company size thresholds
const ENTERPRISE_THRESHOLD = 100;
const GTM_LEADS_SLACK_CHANNEL_ID = "C0A1XKES0JY";

interface EnrichmentResponse {
  success: boolean;
  companySize?: number;
  companyName?: string;
  redirectUrl: string;
  error?: string;
}

// Extract domain from email
function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

async function checkAutoJoinDomain(domain: string): Promise<boolean> {
  const workspaceDomain = await WorkspaceHasDomainModel.findOne({
    where: {
      domain,
      domainAutoJoinEnabled: true,
    },
  });
  return workspaceDomain !== null;
}

// Parse employee count from Apollo's employee range strings
// e.g., "11-20", "51-100", "1,001-5,000", "10,001+"
function parseEmployeeCount(employeeRange: string | null): number | null {
  if (!employeeRange) {
    return null;
  }

  // Remove commas and get the first number
  const cleaned = employeeRange.replace(/,/g, "");
  const match = cleaned.match(/^(\d+)/);

  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

// Map country to HubSpot headquarters region
function mapCountryToRegion(country: string | null): string | null {
  if (!country) {
    return null;
  }

  const c = country.toLowerCase();

  // Europe
  const europeCountries = [
    "albania",
    "andorra",
    "austria",
    "belarus",
    "belgium",
    "bosnia and herzegovina",
    "bulgaria",
    "croatia",
    "cyprus",
    "czech republic",
    "czechia",
    "denmark",
    "estonia",
    "finland",
    "france",
    "germany",
    "greece",
    "hungary",
    "iceland",
    "ireland",
    "italy",
    "kosovo",
    "latvia",
    "liechtenstein",
    "lithuania",
    "luxembourg",
    "malta",
    "moldova",
    "monaco",
    "montenegro",
    "netherlands",
    "north macedonia",
    "norway",
    "poland",
    "portugal",
    "romania",
    "russia",
    "san marino",
    "serbia",
    "slovakia",
    "slovenia",
    "spain",
    "sweden",
    "switzerland",
    "ukraine",
    "united kingdom",
    "uk",
    "vatican city",
  ];
  if (europeCountries.some((ec) => c.includes(ec))) {
    return "Europe";
  }

  // North America
  const northAmericaCountries = [
    "united states",
    "usa",
    "us",
    "canada",
    "mexico",
  ];
  if (northAmericaCountries.some((na) => c.includes(na))) {
    return "North America";
  }

  // Latin America (Central America, South America, Caribbean)
  const latinAmericaCountries = [
    "argentina",
    "belize",
    "bolivia",
    "brazil",
    "chile",
    "colombia",
    "costa rica",
    "cuba",
    "dominican republic",
    "ecuador",
    "el salvador",
    "guatemala",
    "guyana",
    "haiti",
    "honduras",
    "jamaica",
    "nicaragua",
    "panama",
    "paraguay",
    "peru",
    "puerto rico",
    "suriname",
    "trinidad and tobago",
    "uruguay",
    "venezuela",
  ];
  if (latinAmericaCountries.some((la) => c.includes(la))) {
    return "Latin America";
  }

  // Asia
  const asiaCountries = [
    "afghanistan",
    "armenia",
    "azerbaijan",
    "bahrain",
    "bangladesh",
    "bhutan",
    "brunei",
    "cambodia",
    "china",
    "georgia",
    "hong kong",
    "india",
    "indonesia",
    "iran",
    "iraq",
    "israel",
    "japan",
    "jordan",
    "kazakhstan",
    "kuwait",
    "kyrgyzstan",
    "laos",
    "lebanon",
    "macau",
    "malaysia",
    "maldives",
    "mongolia",
    "myanmar",
    "nepal",
    "north korea",
    "oman",
    "pakistan",
    "palestine",
    "philippines",
    "qatar",
    "saudi arabia",
    "singapore",
    "south korea",
    "korea",
    "sri lanka",
    "syria",
    "taiwan",
    "tajikistan",
    "thailand",
    "timor-leste",
    "turkey",
    "turkmenistan",
    "united arab emirates",
    "uae",
    "uzbekistan",
    "vietnam",
    "yemen",
  ];
  if (asiaCountries.some((a) => c.includes(a))) {
    return "Asia";
  }

  // Oceania
  const oceaniaCountries = [
    "australia",
    "fiji",
    "kiribati",
    "marshall islands",
    "micronesia",
    "nauru",
    "new zealand",
    "palau",
    "papua new guinea",
    "samoa",
    "solomon islands",
    "tonga",
    "tuvalu",
    "vanuatu",
  ];
  if (oceaniaCountries.some((o) => c.includes(o))) {
    return "Oceania";
  }

  // Africa (remaining countries)
  const africaCountries = [
    "algeria",
    "angola",
    "benin",
    "botswana",
    "burkina faso",
    "burundi",
    "cameroon",
    "cape verde",
    "central african republic",
    "chad",
    "comoros",
    "congo",
    "djibouti",
    "egypt",
    "equatorial guinea",
    "eritrea",
    "eswatini",
    "ethiopia",
    "gabon",
    "gambia",
    "ghana",
    "guinea",
    "ivory coast",
    "kenya",
    "lesotho",
    "liberia",
    "libya",
    "madagascar",
    "malawi",
    "mali",
    "mauritania",
    "mauritius",
    "morocco",
    "mozambique",
    "namibia",
    "niger",
    "nigeria",
    "rwanda",
    "senegal",
    "seychelles",
    "sierra leone",
    "somalia",
    "south africa",
    "south sudan",
    "sudan",
    "tanzania",
    "togo",
    "tunisia",
    "uganda",
    "zambia",
    "zimbabwe",
  ];
  if (africaCountries.some((af) => c.includes(af))) {
    return "Africa";
  }

  return null;
}

// Enrichment using Apollo API
// Docs: https://docs.apollo.io/reference/organization-enrichment
async function enrichCompanyFromDomain(domain: string): Promise<{
  size: number | null;
  name: string | null;
  region: string | null;
  funding: string | null;
  revenue: string | null;
}> {
  const apiKey = config.getApolloApiKey();

  if (!apiKey) {
    logger.warn("APOLLO_API_KEY not configured, using fallback");
    return {
      size: null,
      name: null,
      region: null,
      funding: null,
      revenue: null,
    };
  }

  try {
    const response = await untrustedFetch(
      "https://api.apollo.io/api/v1/organizations/enrich",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify({ domain }),
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        // Company not found
        return {
          size: null,
          name: null,
          region: null,
          funding: null,
          revenue: null,
        };
      }
      throw new Error(`Apollo API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      organization?: {
        name?: string;
        estimated_num_employees?: number;
        employee_count_range?: string;
        country?: string;
        total_funding?: number;
        total_funding_printed?: string;
        annual_revenue?: number;
        annual_revenue_printed?: string;
      };
    };
    const org = data.organization;

    if (!org) {
      return {
        size: null,
        name: null,
        region: null,
        funding: null,
        revenue: null,
      };
    }

    // Apollo returns estimated_num_employees (number) or employee_count_range (string)
    let size: number | null = null;

    if (typeof org.estimated_num_employees === "number") {
      size = org.estimated_num_employees;
    } else if (org.employee_count_range) {
      size = parseEmployeeCount(org.employee_count_range);
    }

    return {
      size,
      name: org.name ?? null,
      region: mapCountryToRegion(org.country ?? null),
      funding: org.total_funding_printed ?? null,
      revenue: org.annual_revenue_printed ?? null,
    };
  } catch (error) {
    logger.error({ error }, "Enrichment error");
    return {
      size: null,
      name: null,
      region: null,
      funding: null,
      revenue: null,
    };
  }
}

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

  if (!email || typeof email !== "string") {
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
  const isAutoJoinDomain = await checkAutoJoinDomain(domain);
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
