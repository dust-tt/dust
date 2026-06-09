import config from "@app/lib/api/config";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";

/**
 * Below this employee count we treat a workspace as self-serve and route to
 * signup; above it we route to "Contact Sales".
 */
export const ENTERPRISE_THRESHOLD = 100;

export interface CompanyEnrichment {
  size: number | null;
  name: string | null;
  region: string | null;
  funding: string | null;
  revenue: string | null;
}

const EMPTY_ENRICHMENT: CompanyEnrichment = {
  size: null,
  name: null,
  region: null,
  funding: null,
  revenue: null,
};

const EUROPE_COUNTRIES = [
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

const NORTH_AMERICA_COUNTRIES = [
  "united states",
  "usa",
  "us",
  "canada",
  "mexico",
];

const LATIN_AMERICA_COUNTRIES = [
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

const ASIA_COUNTRIES = [
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

const OCEANIA_COUNTRIES = [
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

const AFRICA_COUNTRIES = [
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

/**
 * Parse employee count from Apollo's employee range strings.
 * e.g., "11-20", "51-100", "1,001-5,000", "10,001+".
 */
export function parseEmployeeCount(
  employeeRange: string | null
): number | null {
  if (!employeeRange) {
    return null;
  }
  const cleaned = employeeRange.replace(/,/g, "");
  const match = cleaned.match(/^(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/** Map an Apollo country string to a HubSpot headquarters region. */
export function mapCountryToRegion(country: string | null): string | null {
  if (!country) {
    return null;
  }
  const c = country.toLowerCase();
  if (EUROPE_COUNTRIES.some((ec) => c.includes(ec))) {
    return "Europe";
  }
  if (NORTH_AMERICA_COUNTRIES.some((na) => c.includes(na))) {
    return "North America";
  }
  if (LATIN_AMERICA_COUNTRIES.some((la) => c.includes(la))) {
    return "Latin America";
  }
  if (ASIA_COUNTRIES.some((a) => c.includes(a))) {
    return "Asia";
  }
  if (OCEANIA_COUNTRIES.some((o) => c.includes(o))) {
    return "Oceania";
  }
  if (AFRICA_COUNTRIES.some((af) => c.includes(af))) {
    return "Africa";
  }
  return null;
}

/**
 * Enrich a company from a domain using the Apollo API.
 * Docs: https://docs.apollo.io/reference/organization-enrichment
 *
 * Always resolves — on missing API key, 404 response, or any other failure
 * returns an all-null enrichment so callers can keep the request flow simple.
 */
export async function enrichCompanyFromDomain(
  domain: string
): Promise<CompanyEnrichment> {
  const apiKey = config.getApolloApiKey();
  if (!apiKey) {
    logger.warn("APOLLO_API_KEY not configured, using fallback");
    return EMPTY_ENRICHMENT;
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
        // Company not found.
        return EMPTY_ENRICHMENT;
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
      return EMPTY_ENRICHMENT;
    }

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
    return EMPTY_ENRICHMENT;
  }
}
