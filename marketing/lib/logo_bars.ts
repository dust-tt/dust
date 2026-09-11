import type {
  LogoBarLogo,
  LogoBarMap,
  LogoListMap,
  LogoListRegion,
} from "@marketing/lib/contentful/types";
import { isEUCountry } from "@marketing/lib/geo/eu-detection";

export type { LogoBarLogo, LogoBarMap, LogoListMap, LogoListRegion };

// Customer logo bars ("Trusted by 3,000+ organizations").
//
// Editors own these in Contentful (`logoBar` + `customerLogo`, see
// lib/contentful/types.ts). Everything below is the *fallback*: the list a bar
// renders when Contentful is unreachable or when no `logoBar` entry has been
// published for that slug yet. That makes the rollout incremental — a bar
// moves to CMS control the moment its entry is published, with no deploy.
//
// Keep this file in rough sync with the live Contentful entries when shipping
// major logo changes, so a Contentful outage doesn't surface a stale lineup.

// One entry per company, mirroring the `customerLogo` content type. Editors
// upload their own files to Contentful; these repo assets are pre-flattened to
// a uniform gray, which is why the fallback still points at them.
const LOGOS = {
  onePassword: { name: "1Password", file: "1password.svg" },
  alan: { name: "Alan", file: "alan.svg" },
  assembled: { name: "Assembled", file: "assembled.svg" },
  backMarket: { name: "Back Market", file: "backmarket.svg" },
  blueground: { name: "Blueground", file: "blueground.svg" },
  causaly: { name: "Causaly", file: "causaly.svg" },
  clay: { name: "Clay", file: "clay.svg" },
  contentsquare: { name: "Contentsquare", file: "contentsquare.svg" },
  cursor: { name: "Cursor", file: "cursor.svg" },
  datadog: { name: "Datadog", file: "datadog.svg" },
  decagon: { name: "Decagon", file: "decagon.svg" },
  didomi: { name: "Didomi", file: "didomi.svg" },
  doctolib: { name: "Doctolib", file: "doctolib.svg" },
  evenUp: { name: "EvenUp", file: "evenup.svg" },
  fleet: { name: "Fleet", file: "fleet.svg" },
  gitGuardian: { name: "GitGuardian", file: "gitguardian.svg" },
  jumia: { name: "Jumia", file: "Jumia.svg" },
  kyriba: { name: "Kyriba", file: "kyriba.svg" },
  malt: { name: "Malt", file: "malt.svg" },
  mirakl: { name: "Mirakl", file: "mirakl.svg" },
  paddle: { name: "Paddle", file: "paddle.svg" },
  payFit: { name: "PayFit", file: "payfit.svg" },
  pennylane: { name: "Pennylane", file: "pennylane.svg" },
  persona: { name: "Persona", file: "persona.svg" },
  photoroom: { name: "Photoroom", file: "photoroom.svg" },
  profound: { name: "Profound", file: "profound.svg" },
  qonto: { name: "Qonto", file: "qonto.svg" },
  spendesk: { name: "Spendesk", file: "spendesk.svg" },
  trueLayer: { name: "TrueLayer", file: "truelayer.svg" },
  vanta: { name: "Vanta", file: "vanta.svg" },
  wakam: { name: "Wakam", file: "wakam.svg" },
  watershed: { name: "Watershed", file: "watershed.svg" },
  welcomeToTheJungle: {
    name: "Welcome to the Jungle",
    file: "welcometothejungle.svg",
  },
  whatnot: { name: "Whatnot", file: "whatnot.svg" },
} as const satisfies Record<string, { name: string; file: string }>;

type LogoKey = keyof typeof LOGOS;

// Single source of truth for case-study links. Previously duplicated between
// TrustedBy.tsx and HomeTrustedSection.tsx, where the two copies had drifted.
const CASE_STUDIES: Partial<Record<LogoKey, string>> = {
  alan: "/customers/alans-pmm-team-transforms-sales-conversations-into-intelligence-with-ai-agents",
  assembled: "/customers/part-1-assembled-ai-operating-system",
  backMarket:
    "/customers/back-markets-fraud-team-builds-ai-detection-system-in-one-week-contributing",
  blueground: "/customers/customer-support-blueground",
  clay: "/customers/clay-scaling-gtme-team",
  doctolib:
    "/customers/why-doctolib-made-company-wide-enterprise-ai-a-national-cause",
  fleet: "/customers/how-valentine-head-of-marketing-at-fleet-uses-dust",
  kyriba: "/customers/kyriba-accelerating-innovation-with-dust",
  malt: "/customers/malt-customer-support",
  mirakl: "/customers/why-mirakl-chose-dust-as-its-go-to-agentic-solution",
  payFit: "/customers/dust-ai-payfit-efficiency",
  // The `-dust-` variant that HomeTrustedSection used is not a live URL: the
  // redirect in next.config.js points at this slug.
  pennylane: "/customers/pennylane-customer-support-journey",
  persona: "/customers/how-persona-hit-80-ai-agent-adoption-with-dust",
  profound: "/customers/profound-post-sales-team-reclaimed-1800-hours",
  qonto: "/customers/qonto-dust-ai-partnership",
  spendesk:
    "/customers/how-spendesk-achieved-90-ai-adoption-in-6-months-with-dust",
  wakam:
    "/customers/how-wakam-cut-legal-contract-analysis-time-by-50-with-dust",
  watershed:
    "/customers/how-watershed-got-90-of-its-team-to-leverage-dust-agents",
  vanta:
    "/customers/how-vantas-gtm-team-saves-thousands-of-hours-annually-with-dust",
};

function bar(...keys: LogoKey[]): LogoBarLogo[] {
  return keys.map((key) => ({
    name: LOGOS[key].name,
    src: `/static/landing/logos/gray/${LOGOS[key].file}`,
    // Repo SVGs carry their own viewBox; the bars size by a fixed-height box.
    width: null,
    height: null,
    caseStudyUrl: CASE_STUDIES[key] ?? null,
  }));
}

// `barSlug` values. These are the identifiers editors type into the `logoBar`
// entries in Contentful, so they are part of the contract with GTM — renaming
// one silently detaches its entry and reverts the bar to its fallback.
export const TRUSTED_BY_LOGO_SETS = [
  "default",
  "landing",
  "b2b-saas",
  "marketplace",
  "finance",
  "insurance",
  "retail",
] as const;

export type TrustedByLogoSet = (typeof TRUSTED_BY_LOGO_SETS)[number];
export type TrustedByRegion = "us" | "eu";
export type HomeTrustedGeo = "default" | "gb" | "fr";

export function trustedByBarSlug(
  logoSet: TrustedByLogoSet,
  region: TrustedByRegion
): string {
  return `trusted-by-${logoSet}-${region}`;
}

export function homeTrustedBarSlug(geo: HomeTrustedGeo): string {
  return `home-trusted-${geo}`;
}

// The audiences a `logoList` entry can target, and the `region` values editors
// pick in Contentful. One published list supplies every bar on every marketing
// page for that audience, so a French visitor sees the same lineup throughout.
//
// `worldwide` is the catch-all: the United States plus every country not
// claimed by a more specific region below. Ordering matters in
// `toLogoListRegion` — the first match wins.
export const LOGO_LIST_REGIONS = [
  "worldwide",
  "european-union",
  "united-kingdom",
  "france",
] as const;

export function toLogoListRegion(
  countryCode: string | null | undefined
): LogoListRegion {
  if (!countryCode) {
    return "worldwide";
  }
  const code = countryCode.toUpperCase();
  if (code === "FR") {
    return "france";
  }
  if (code === "GB") {
    return "united-kingdom";
  }
  if (isEUCountry(code)) {
    return "european-union";
  }
  return "worldwide";
}

// Which hardcoded bar an audience falls back to when its region has no
// published `logoList`. This reproduces today's routing exactly: France is
// served by the EU bar on the solutions pages, and the UK by the US one,
// because `isEUCountry` excludes the UK. Changing these changes what visitors
// see *before* marketing takes a region over, so they should stay as-is.
export function fallbackTrustedByRegion(
  region: LogoListRegion
): TrustedByRegion {
  return region === "european-union" || region === "france" ? "eu" : "us";
}

export function fallbackHomeTrustedGeo(region: LogoListRegion): HomeTrustedGeo {
  if (region === "france") {
    return "fr";
  }
  if (region === "united-kingdom") {
    return "gb";
  }
  return "default";
}

// Cursor is temporarily withheld from most bars; it stays in `LOGOS` so it can
// be restored (in Contentful, or here) without re-adding the asset path.
export const FALLBACK_LOGO_BARS: LogoBarMap = {
  [trustedByBarSlug("default", "us")]: bar(
    "datadog",
    "clay",
    "assembled",
    "decagon",
    "kyriba",
    "evenUp",
    "persona",
    "onePassword",
    "vanta",
    "watershed",
    "whatnot",
    "profound"
  ),
  [trustedByBarSlug("default", "eu")]: bar(
    "alan",
    "backMarket",
    "blueground",
    "clay",
    "doctolib",
    "malt",
    "vanta",
    "payFit",
    "datadog",
    "pennylane",
    "qonto"
  ),
  [trustedByBarSlug("landing", "us")]: bar(
    "datadog",
    "clay",
    "cursor",
    "assembled",
    "decagon",
    "evenUp",
    "persona",
    "onePassword",
    "vanta",
    "watershed",
    "whatnot",
    "profound"
  ),
  [trustedByBarSlug("landing", "eu")]: bar(
    "alan",
    "backMarket",
    "blueground",
    "clay",
    "doctolib",
    "malt",
    "vanta",
    "payFit",
    "datadog",
    "pennylane",
    "qonto"
  ),
  [trustedByBarSlug("b2b-saas", "us")]: bar(
    "clay",
    "contentsquare",
    "persona",
    "spendesk",
    "watershed"
  ),
  [trustedByBarSlug("b2b-saas", "eu")]: bar(
    "clay",
    "contentsquare",
    "cursor",
    "gitGuardian",
    "payFit",
    "spendesk"
  ),
  [trustedByBarSlug("marketplace", "us")]: bar(
    "blueground",
    "doctolib",
    "malt",
    "mirakl",
    "welcomeToTheJungle"
  ),
  [trustedByBarSlug("marketplace", "eu")]: bar(
    "blueground",
    "doctolib",
    "malt",
    "mirakl",
    "welcomeToTheJungle"
  ),
  [trustedByBarSlug("finance", "us")]: bar(
    "kyriba",
    "pennylane",
    "spendesk",
    "qonto"
  ),
  [trustedByBarSlug("finance", "eu")]: bar(
    "kyriba",
    "pennylane",
    "spendesk",
    "qonto"
  ),
  [trustedByBarSlug("insurance", "us")]: bar("alan", "wakam"),
  [trustedByBarSlug("insurance", "eu")]: bar("alan", "wakam"),
  [trustedByBarSlug("retail", "us")]: bar(
    "backMarket",
    "fleet",
    "jumia",
    "mirakl",
    "photoroom",
    "whatnot",
    "profound"
  ),
  [trustedByBarSlug("retail", "eu")]: bar(
    "backMarket",
    "fleet",
    "jumia",
    "mirakl",
    "photoroom",
    "whatnot"
  ),
  [homeTrustedBarSlug("default")]: bar(
    "datadog",
    "clay",
    "cursor",
    "assembled",
    "decagon",
    "evenUp",
    "persona",
    "onePassword",
    "vanta",
    "watershed",
    "whatnot",
    "profound"
  ),
  // UK — UK HQ/office + high ARR + brand recognition.
  [homeTrustedBarSlug("gb")]: bar(
    "paddle",
    "vanta",
    "cursor",
    "kyriba",
    "trueLayer",
    "contentsquare",
    "datadog",
    "spendesk",
    "backMarket",
    "causaly",
    "clay",
    "onePassword",
    "watershed"
  ),
  // FR — French-native companies, most with customer stories.
  [homeTrustedBarSlug("fr")]: bar(
    "doctolib",
    "alan",
    "qonto",
    "pennylane",
    "payFit",
    "malt",
    "mirakl",
    "contentsquare",
    "spendesk",
    "welcomeToTheJungle",
    "cursor",
    "kyriba",
    "didomi"
  ),
};
