// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { HomeAIOperatorsCTASection } from "@marketing/components/home/content/Product/HomeAIOperatorsCTASection";
import { FAQ, type FAQItem } from "@marketing/components/home/FAQ";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import {
  formatPriceWithCurrency,
  useUserBillingCurrency,
} from "@marketing/lib/client/subscription";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
  withTracking,
} from "@marketing/lib/tracking";
import { classNames } from "@marketing/lib/utils";
import { appendUTMParams } from "@marketing/lib/utils/utm";
import { useSignUpModal } from "@marketing/hooks/useSignUpModal";
import { assertNeverAndIgnore } from "@marketing/types/shared/utils/assert_never";
import {
  Button,
  Check,
  ChevronDown,
  Chip,
  cn,
  LayerSingle,
  LayersThree01,
  LayersTwo01,
  Minus,
  SearchInput,
  Separator,
} from "@dust-tt/sparkle";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/router";
import type React from "react";
import type { ReactElement, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

// ---------- Types ----------

type CtaStyle = "primary" | "outline" | "dark";

interface SeatTier {
  id: "free" | "pro" | "max";
  name: string;
  priceYearDollars: number;
  priceMonthDollars: number;
  credits: string;
}

interface Plan {
  id: "business" | "enterprise";
  name: string;
  tagline: string;
  seatTiers?: SeatTier[];
  cta: string;
  ctaStyle: CtaStyle;
  featured: boolean;
  highlightsHeader?: string;
  highlights: string[];
}

type CellValue = boolean | string;

interface ComparisonRow {
  feature: string;
  featureShort?: string;
  note?: string;
  business: CellValue;
  enterprise: CellValue;
}

interface ComparisonSectionData {
  section: string;
  rows: ComparisonRow[];
}

interface FAQItemData {
  q: string;
  a: ReactNode;
}

type Billing = "yearly" | "monthly";

// ---------- Data (mirrors pricing bundle / feature.csv) ----------

const SEAT_TIERS: SeatTier[] = [
  {
    id: "free",
    name: "Free seat",
    priceYearDollars: 0,
    priceMonthDollars: 0,
    credits: "500 credits · Lifetime",
  },
  {
    id: "pro",
    name: "Pro seat",
    priceYearDollars: 24,
    priceMonthDollars: 30,
    credits: "8,000 credits /seat/mo",
  },
  {
    id: "max",
    name: "Max seat",
    priceYearDollars: 120,
    priceMonthDollars: 150,
    credits: "40,000 credits /seat/mo",
  },
];

const SEAT_TIER_BADGE: Record<
  SeatTier["id"],
  {
    bg: string;
    iconColor: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  free: { bg: "bg-gray-100", iconColor: "text-gray-700", Icon: LayerSingle },
  pro: { bg: "bg-blue-100", iconColor: "text-blue-500", Icon: LayersTwo01 },
  max: {
    bg: "bg-golden-100",
    iconColor: "text-golden-600",
    Icon: LayersThree01,
  },
};

const PLANS: Plan[] = [
  {
    id: "business",
    name: "Business",
    tagline: "For teams up to 100 people",
    seatTiers: SEAT_TIERS,
    cta: "Start for free",
    ctaStyle: "primary",
    featured: true,
    highlights: [
      "20+ frontier models — GPT-5, Claude, Gemini, Mistral, DeepSeek",
      "Custom agents with your skills, knowledge & tools",
      "Multi-agent workflows on schedules & triggers",
      "Connect Slack, Notion, GitHub, Drive + 20 more — or any tool via MCP",
      "Team collaboration workspaces",
      "SSO with Okta, Entra ID & Jumpcloud",
      "US & EU data residency",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For AI at scale",
    cta: "Talk to sales",
    ctaStyle: "dark",
    featured: false,
    highlightsHeader: "Everything in Business plus:",
    highlights: [
      "Unlimited connectors & MCP servers",
      "Workspace-pooled credits & volume pricing",
      "SCIM, audit logs & custom data retention",
      "US data residency & single-tenant deployment",
      "Dedicated CSM, priority support & SLA",
      "Custom legal terms (MSA, DPA)",
    ],
  },
];

const COMPARISON: ComparisonSectionData[] = [
  {
    section: "Features",
    rows: [
      {
        feature:
          "20+ frontier models (GPT-5, Claude, Gemini, Mistral, DeepSeek) + multi-modal input",
        featureShort: "20+ frontier models + multi-modal input",
        business: true,
        enterprise: true,
      },
      {
        feature: "Custom agents with skills + knowledge & tools",
        business: true,
        enterprise: true,
      },
      {
        feature:
          "Multi-agent orchestration & triggers (scheduled + event-driven)",
        featureShort: "Multi-agent orchestration & triggers",
        business: true,
        enterprise: true,
      },
      {
        feature: "MCP servers (native + remote)",
        business: "5 remote",
        enterprise: true,
      },
      {
        feature: "Frames (interactive dashboards & apps)",
        featureShort: "Frames",
        business: "Standard",
        enterprise: "White-labelled",
      },
      {
        feature: "Pods (collaborative workspaces with shared context)",
        featureShort: "Pods",
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    section: "Company data",
    rows: [
      {
        feature: "Connectors to 20+ data sources",
        business: "Up to 3",
        enterprise: true,
      },
      {
        feature: "Search + query & extract across all company data",
        featureShort: "Search, query & extract",
        business: true,
        enterprise: true,
      },
      {
        feature: "Spaces for data segmentation & permissions",
        featureShort: "Spaces",
        business: "5",
        enterprise: true,
      },
    ],
  },
  {
    section: "Security & admin",
    rows: [
      {
        feature: "SOC 2 Type II",
        business: true,
        enterprise: true,
      },
      {
        feature: "SSO (Okta, Entra ID, Jumpcloud)",
        business: "5+ seats on demand",
        enterprise: true,
      },
      {
        feature: "SCIM provisioning",
        business: false,
        enterprise: true,
      },
      {
        feature: "Audit logs & advanced security controls",
        business: false,
        enterprise: true,
      },
      {
        feature: "Data residency",
        business: "US / EU",
        enterprise: "US / EU",
      },
      {
        feature: "Single-tenant deployment",
        business: false,
        enterprise: true,
      },
      {
        feature: "Custom legal terms (MSA, DPA)",
        business: false,
        enterprise: true,
      },
      {
        feature: "Usage analytics & adoption reporting",
        business: false,
        enterprise: true,
      },
    ],
  },
  {
    section: "Support",
    rows: [
      {
        feature: "Support tier",
        business: "Email",
        enterprise: "Priority + SLA",
      },
      {
        feature: "Dedicated CSM & onboarding",
        business: false,
        enterprise: true,
      },
    ],
  },
  {
    section: "Developer tools",
    rows: [
      {
        feature: "Developer API",
        business: "Conversation API",
        enterprise: "+ Data Source API",
      },
      {
        feature: "Automation platforms (Zapier, Make, n8n, Power Automate)",
        featureShort: "Automation platforms",
        business: true,
        enterprise: true,
      },
      {
        feature: "Programmatic usage rate",
        business: "$0.01 / credit",
        enterprise: "Custom",
      },
    ],
  },
];

function SeatTiersFAQAnswer() {
  const currency = useUserBillingCurrency();
  const formatSeatPrice = (priceDollars: number) =>
    formatPriceWithCurrency(priceDollars, currency);

  const pro = SEAT_TIERS.find((tier) => tier.id === "pro");
  const max = SEAT_TIERS.find((tier) => tier.id === "max");

  return (
    <>
      <p className="mb-3">
        These are seat types within the Business plan. Admins assign one to each
        user based on that individual's expected usage:
      </p>
      <ul>
        <li>
          <strong>Free:</strong> {formatSeatPrice(0)}, 500 credits lifetime.
          Best for occasional users or people trying Dust.
        </li>
        <li>
          <strong>Pro:</strong> {formatSeatPrice(pro?.priceMonthDollars ?? 30)}
          /month, or {formatSeatPrice(pro?.priceYearDollars ?? 24)}/month billed
          yearly, with 8,000 credits/month. Best for most team members.
        </li>
        <li>
          <strong>Max:</strong> {formatSeatPrice(max?.priceMonthDollars ?? 150)}
          /month, or {formatSeatPrice(max?.priceYearDollars ?? 120)}/month
          billed yearly, with 40,000 credits/month. Best for power users running
          complex automations, Deep research, or tool-heavy workflows regularly.
        </li>
      </ul>
      <p className="mt-3">
        You can mix and match seat types across your workspace and reassign them
        anytime as usage changes.{" "}
        <a
          href="https://docs.dust.tt/docs/seat-management"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-highlight hover:underline"
        >
          Learn more about seats
        </a>
        .
      </p>
    </>
  );
}

const FAQS: FAQItemData[] = [
  {
    q: "What is a credit?",
    a: (
      <>
        A credit is Dust's unit for measuring AI usage. Credit consumption
        depends on the model used, the complexity of the task, and any tools the
        agent uses, such as search, data retrieval, code execution, or actions
        in connected apps.{" "}
        <a
          href="https://docs.dust.tt/docs/credits"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-highlight hover:underline"
        >
          Learn more about credits
        </a>
        .
      </>
    ),
  },
  {
    q: "How are credits consumed?",
    a: (
      <>
        Credits are charged per message, based on the model used and the actions
        performed. Basic chat with a token-efficient model like Claude Sonnet
        will consume few credits, while a deep research task that requires
        complex, multi-step orchestration and tool use will consume more. You'll
        be able to track your credit usage in Dust so that you can understand
        how different workflows consume credits.{" "}
        <a
          href="https://docs.dust.tt/docs/credit-management"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-highlight hover:underline"
        >
          Learn more about managing credits
        </a>
        .
      </>
    ),
  },
  {
    q: "Do unused credits roll over?",
    a: "No. Each seat's monthly credit allocation resets at the start of every billing period. This keeps pricing predictable and makes it easier for teams to plan.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "If an agent is already generating a response, it will finish; you won't be cut off mid-response. After that, additional usage depends on your seat type and workspace settings. Pro and Max users will be able to continue through workspace overage if enabled by an admin up to a capped amount. Free users are prompted to request an upgrade.",
  },
  {
    q: "What's the difference between Free, Pro, and Max seats?",
    a: <SeatTiersFAQAnswer />,
  },
  {
    q: "How does billing work when I add or remove members?",
    a: "Adding a member mid-cycle is prorated: they get their full credit allocation immediately, and you're charged only for the remaining days in the period on your next invoice. Removing a member frees the seat for reassignment. Monthly seats can be cancelled anytime; annual seats stay available for reassignment until their commitment ends.",
  },
  {
    q: "Which AI models are included?",
    a: "All plans include access to 20+ models from OpenAI, Anthropic, Google, Mistral, and DeepSeek. You choose the model per agent. No model is locked behind a higher plan, though higher-capability models may consume more credits per message.",
  },
  {
    q: "When should I consider Enterprise?",
    a: "Enterprise is best for organizations that need advanced security and admin controls, dedicated support, custom terms, or more flexible usage arrangements at scale. This includes needs like SCIM, audit logs, SLAs, hands-on onboarding, and Customer Success support.",
  },
];

// ---------- Subcomponents ----------

interface BillingToggleProps {
  billing: Billing;
  setBilling: (b: Billing) => void;
}

function BillingToggle({ billing, setBilling }: BillingToggleProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sliderStyle, setSliderStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  // Measured before paint so the slider never flashes at width 0, and
  // re-measured on container resize (window resize, late font load).
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const update = () => {
      const el = wrap.querySelector<HTMLButtonElement>(
        `[data-val="${billing}"]`
      );
      if (el) {
        setSliderStyle({ left: el.offsetLeft, width: el.offsetWidth });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [billing]);

  const pillBase =
    "relative z-[1] inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 heading-sm motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted";

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label="Billing period"
      className="relative inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 rounded-full border border-border bg-background shadow-sm motion-safe:transition-[left,width] motion-safe:duration-[220ms] motion-safe:ease-out"
        style={{ left: sliderStyle.left, width: sliderStyle.width }}
      />
      <button
        type="button"
        data-val="yearly"
        aria-pressed={billing === "yearly"}
        onClick={() => setBilling("yearly")}
        className={cn(
          pillBase,
          billing === "yearly" ? "text-foreground" : "text-muted-foreground"
        )}
      >
        Yearly
        <Chip size="mini" color="success" label="Save 20%" />
      </button>
      <button
        type="button"
        data-val="monthly"
        aria-pressed={billing === "monthly"}
        onClick={() => setBilling("monthly")}
        className={cn(
          pillBase,
          billing === "monthly" ? "text-foreground" : "text-muted-foreground"
        )}
      >
        Monthly
      </button>
    </div>
  );
}

interface PlanCardProps {
  plan: Plan;
  billing: Billing;
  onBusinessStart: () => void;
  onEnterpriseContact: () => void;
}

function PlanCard({
  plan,
  billing,
  onBusinessStart,
  onEnterpriseContact,
}: PlanCardProps) {
  const currency = useUserBillingCurrency();

  const handleClick = () => {
    if (plan.id === "business") {
      onBusinessStart();
    } else {
      onEnterpriseContact();
    }
  };

  let buttonVariant: "highlight" | "primary" | "outline";
  switch (plan.ctaStyle) {
    case "primary":
      buttonVariant = "highlight";
      break;
    case "dark":
      buttonVariant = "primary";
      break;
    case "outline":
      buttonVariant = "outline";
      break;
    default:
      assertNeverAndIgnore(plan.ctaStyle);
      buttonVariant = "outline";
  }

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border border-border bg-background p-8 text-left",
        "motion-safe:transition-[box-shadow,border-color] motion-safe:duration-200 motion-safe:ease",
        "hover:border-border-darker hover:shadow-md"
      )}
    >
      <h3 className="heading-2xl mb-1.5 text-foreground">{plan.name}</h3>
      <p className="copy-base mb-7 text-muted-foreground">{plan.tagline}</p>

      <Button
        variant={buttonVariant}
        size="md"
        label={plan.cta}
        onClick={handleClick}
        className="mb-6 w-full"
      />

      {plan.seatTiers && (
        <>
          <Separator className="mb-4" />
          <div className="mb-5">
            <div className="flex flex-col gap-4">
              {plan.seatTiers.map((tier) => {
                const tierPriceDollars =
                  billing === "yearly"
                    ? tier.priceYearDollars
                    : tier.priceMonthDollars;
                const shortName = tier.name.replace(" seat", "");
                const shortCredits = tier.credits;
                const badge = SEAT_TIER_BADGE[tier.id];
                const Icon = badge.Icon;
                return (
                  <div key={tier.id} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border/70",
                        badge.bg
                      )}
                      aria-hidden="true"
                    >
                      <Icon className={cn("h-5 w-5", badge.iconColor)} />
                    </span>
                    <div className="flex flex-1 flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="heading-sm text-foreground">
                          {shortName}
                        </span>
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={tierPriceDollars}
                            initial={{ y: -4, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 4, opacity: 0 }}
                            transition={{
                              duration: 0.15,
                              ease: [0.215, 0.61, 0.355, 1],
                            }}
                            className="heading-sm tabular-nums text-foreground"
                          >
                            {formatPriceWithCurrency(
                              tierPriceDollars,
                              currency
                            )}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                      <span className="copy-xs text-muted-foreground">
                        {shortCredits}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <Separator className="mb-5" />

      {plan.highlightsHeader && (
        <p className="copy-base mb-3 font-semibold text-foreground">
          {plan.highlightsHeader}
        </p>
      )}
      <ul className="copy-sm flex flex-col gap-3">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-foreground">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Eyebrow pill is hidden for now. Flip to `true` to show the blog link above
// the page title.
const SHOW_EYEBROW = false;

interface HeroProps {
  billing: Billing;
  setBilling: (b: Billing) => void;
  onBusinessStart: () => void;
  onEnterpriseContact: () => void;
}

function Hero({
  billing,
  setBilling,
  onBusinessStart,
  onEnterpriseContact,
}: HeroProps) {
  return (
    <section className="-mx-6 flex flex-col items-center px-4 pt-6 text-center md:mx-0 md:px-0 md:pt-10 lg:pt-14">
      {SHOW_EYEBROW && (
        <Link
          href="https://dust.tt/blog/economics-of-multiplayer-ai"
          target="_blank"
          rel="noopener noreferrer"
          onClick={withTracking(TRACKING_AREAS.PRICING, "hero_blog_pill")}
          className="group mb-5 inline-flex items-center gap-2 rounded-full border border-gray-100 bg-white py-1.5 pl-3 pr-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
          <span className="whitespace-nowrap">
            The economics of multiplayer AI
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
            aria-hidden="true"
          >
            <line x1="3" y1="8" x2="13" y2="8" />
            <polyline points="9 4 13 8 9 12" />
          </svg>
        </Link>
      )}
      <h1
        className={classNames(
          "heading-5xl md:heading-6xl lg:heading-7xl",
          "mb-5 max-w-3xl text-balance text-foreground"
        )}
      >
        Pricing that scales
        <br />
        with the work you get done
      </h1>
      <p className="copy-lg mb-9 max-w-2xl text-balance text-muted-foreground">
        Choose self-serve plan for your team, or talk to us about
        enterprise-ready deployment, governance, and support
      </p>

      <BillingToggle billing={billing} setBilling={setBilling} />

      <div className="mt-12 grid w-full grid-cols-1 items-stretch gap-5 md:grid-cols-2 md:max-w-3xl">
        {PLANS.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            billing={billing}
            onBusinessStart={onBusinessStart}
            onEnterpriseContact={onEnterpriseContact}
          />
        ))}
      </div>
    </section>
  );
}

interface FeatureCellProps {
  value: CellValue;
}

function FeatureCell({ value }: FeatureCellProps) {
  if (value === true) {
    return (
      <span
        aria-label="Included"
        className="inline-flex h-6 w-6 items-center justify-center text-foreground"
      >
        <Check className="h-5 w-5" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        aria-label="Not included"
        className="inline-flex h-6 w-6 items-center justify-center text-primary-300"
      >
        <Minus className="h-5 w-5" />
      </span>
    );
  }
  return <span className="copy-sm text-foreground">{value}</span>;
}

interface ComparisonTableProps {
  onBusinessStart: () => void;
  onEnterpriseContact: () => void;
}

function ComparisonTable({
  onBusinessStart,
  onEnterpriseContact,
}: ComparisonTableProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(COMPARISON.map((s) => [s.section, true]))
  );
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const toggleSection = (sectionName: string) => {
    // Sections are forced open while searching; ignore toggles so the
    // stored open state doesn't silently flip underneath.
    if (isSearching) {
      return;
    }
    setOpenSections((prev) => ({
      ...prev,
      [sectionName]: !(prev[sectionName] ?? true),
    }));
  };

  const filteredSections = COMPARISON.map((section) => {
    if (!isSearching) {
      return section;
    }
    const rows = section.rows.filter((row) => {
      const haystack = `${row.feature} ${row.note ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
    return { ...section, rows };
  }).filter((section) => !isSearching || section.rows.length > 0);

  const matchCount = filteredSections.reduce(
    (acc, section) => acc + section.rows.length,
    0
  );

  const ctaFor = (planId: Plan["id"]) => {
    if (planId === "business") {
      return (
        <Button
          variant="highlight"
          size="sm"
          label="Start for free"
          onClick={onBusinessStart}
        />
      );
    }
    return (
      <Button
        variant="primary"
        size="sm"
        label="Talk to sales"
        onClick={onEnterpriseContact}
      />
    );
  };

  return (
    <section className="-mx-6 px-3 py-8 md:mx-0 md:px-12 md:py-12 lg:px-32">
      <div>
        <div className="mb-10 text-center md:mb-14">
          <h2 className="heading-5xl">Compare plans feature by feature</h2>
        </div>

        {/* Table */}
        <div>
          <table className="w-full border-separate border-spacing-0">
            {/* top-16 matches the ScrollingHeader scrolled height (h-16). */}
            <thead className="sticky top-16 z-10">
              <tr className="grid grid-cols-2 bg-background md:table-row">
                <th className="hidden border-b border-border bg-background px-2 text-left align-bottom md:table-cell md:py-5">
                  <SearchInput
                    name="features-search"
                    placeholder="Search features…"
                    value={query}
                    onChange={setQuery}
                    className="max-w-xs [&_input]:font-medium [&_input::placeholder]:font-medium"
                  />
                  <span role="status" className="sr-only">
                    {isSearching
                      ? `${matchCount} feature${matchCount === 1 ? "" : "s"} matching`
                      : ""}
                  </span>
                </th>
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    className="block border-b border-border bg-background px-3 py-4 text-center align-bottom md:table-cell md:w-[240px] md:px-5 md:py-5"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <span className="heading-lg text-foreground">
                        {p.name}
                      </span>
                      {ctaFor(p.id)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            {filteredSections.map((section) => {
              const isOpen = isSearching
                ? true
                : (openSections[section.section] ?? true);
              return (
                <tbody
                  key={section.section}
                  // Row-dim on hover, gated to hover-capable devices to avoid
                  // sticky hover on touch.
                  className="motion-safe:[&_tr[data-row=feature]]:transition-opacity motion-safe:[&_tr[data-row=feature]]:duration-200 [@media(hover:hover)]:[&:has(tr[data-row=feature]:hover)_tr[data-row=feature]:not(:hover)]:opacity-40"
                >
                  <tr className="grid grid-cols-1 md:table-row">
                    <th
                      colSpan={3}
                      scope="colgroup"
                      className="block border-t border-border p-0 text-left md:table-cell"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(section.section)}
                        aria-expanded={isOpen}
                        className="group flex w-full items-center justify-between gap-2 px-2 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        <span className="heading-2xl font-semibold text-foreground">
                          {section.section}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-5 w-5 text-muted-foreground transition-transform duration-200",
                            !isOpen && "-rotate-90"
                          )}
                        />
                      </button>
                    </th>
                  </tr>
                  <AnimatePresence initial={false}>
                    {isOpen &&
                      section.rows.map((row, idx) => (
                        <motion.tr
                          key={`${section.section}:${row.feature}`}
                          data-row="feature"
                          className={cn(
                            "grid grid-cols-2 md:table-row",
                            idx % 2 === 1 && "bg-muted/40"
                          )}
                          initial={{ y: -4 }}
                          animate={{ y: 0 }}
                          transition={{
                            duration: 0.18,
                            ease: [0.215, 0.61, 0.355, 1],
                          }}
                        >
                          <td className="col-span-2 block px-2 pb-1.5 pt-3.5 align-middle md:table-cell md:py-3.5 md:pb-3.5">
                            <span className="copy-sm block max-w-[560px] font-medium text-foreground">
                              <span className="md:hidden">
                                {row.featureShort ?? row.feature}
                              </span>
                              <span className="hidden md:inline">
                                {row.feature}
                              </span>
                            </span>
                            {row.note && (
                              <span className="copy-xs mt-0.5 block font-medium text-faint">
                                {row.note}
                              </span>
                            )}
                          </td>
                          <td className="block px-2 pb-3.5 pt-1.5 text-center align-middle md:table-cell md:w-[240px] md:px-5 md:py-3.5 md:pt-3.5">
                            <FeatureCell value={row.business} />
                          </td>
                          <td className="block px-2 pb-3.5 pt-1.5 text-center align-middle md:table-cell md:w-[240px] md:px-5 md:py-3.5 md:pt-3.5">
                            <FeatureCell value={row.enterprise} />
                          </td>
                        </motion.tr>
                      ))}
                  </AnimatePresence>
                </tbody>
              );
            })}
            {isSearching && filteredSections.length === 0 && (
              <tbody>
                <tr>
                  <td
                    colSpan={3}
                    className="border-t border-border px-2 py-12 text-center copy-sm text-muted-foreground"
                  >
                    No features match “{query}”.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const items: FAQItem[] = FAQS.map((f) => ({
    question: f.q,
    answer: f.a,
  }));

  return (
    <section className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen border-y border-border bg-muted">
      <div className="container mx-auto px-6 py-20">
        <div className="px-4 md:px-12 lg:px-32">
          <FAQ title="Frequently asked questions" items={items} />
        </div>
      </div>
    </section>
  );
}

// ---------- Page ----------

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Pricing() {
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>("yearly");
  const { openSignUpModal } = useSignUpModal();

  const onBusinessStart = () => {
    trackEvent({
      area: TRACKING_AREAS.PRICING,
      object: "plan_card_start_trial",
      action: TRACKING_ACTIONS.CLICK,
      extra: { plan: "business", billing },
    });
    openSignUpModal();
  };

  const onEnterpriseContact = () => {
    trackEvent({
      area: TRACKING_AREAS.PRICING,
      object: "plan_card_contact_sales",
      action: TRACKING_ACTIONS.CLICK,
      extra: { plan: "enterprise", billing },
    });
    // eslint-disable-next-line react-hooks/immutability
    window.location.href = appendUTMParams("/home/contact");
  };

  return (
    <MotionConfig reducedMotion="user">
      <PageMetadata
        title="Dust Pricing: Business and Enterprise Plans for AI Agents"
        description="Dust scales from a single builder to thousands of seats. Business self-serve with Pro ($24/seat/mo yearly) and Max ($120/seat/mo yearly) seats, Enterprise for organizations at scale."
        pathname={router.asPath}
      />
      <Hero
        billing={billing}
        setBilling={setBilling}
        onBusinessStart={onBusinessStart}
        onEnterpriseContact={onEnterpriseContact}
      />
      <ComparisonTable
        onBusinessStart={onBusinessStart}
        onEnterpriseContact={onEnterpriseContact}
      />
      <FAQSection />
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] -mt-6 w-screen md:-mt-24 xl:-mt-16 2xl:-mt-24">
        <HomeAIOperatorsCTASection />
      </div>
    </MotionConfig>
  );
}

Pricing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
