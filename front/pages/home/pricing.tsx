// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { HomeAIOperatorsCTASection } from "@app/components/home/content/Product/HomeAIOperatorsCTASection";
import { FAQ, type FAQItem } from "@app/components/home/FAQ";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";
import { appendUTMParams } from "@app/lib/utils/utm";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Button,
  CheckIcon,
  ChevronDownIcon,
  Chip,
  cn,
  DashIcon,
  SearchInput,
  Separator,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useRouter } from "next/router";
import type React from "react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

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
  priceLabel: { yearly: string; monthly: string };
  priceSubtext: { yearly: string; monthly: string };
  priceNote?: string;
  seats: string;
  seatTiers?: SeatTier[];
  cta: string;
  ctaStyle: CtaStyle;
  featured: boolean;
  aboveHighlightsNote?: { title: string; subtitle: string };
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
    credits: "300 credits · Lifetime",
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

interface FreeSeatIconProps {
  className?: string;
}

function FreeSeatIcon({ className }: FreeSeatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 11.8339 12.916"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4.60444 11.5202L5.46367 11.9975C5.62911 12.0895 5.71182 12.1354 5.79942 12.1534C5.87696 12.1694 5.95692 12.1694 6.03445 12.1534C6.12205 12.1354 6.20477 12.0895 6.3702 11.9975L7.22944 11.5202M1.97944 10.0619L1.147 9.59939C0.972287 9.50233 0.884919 9.45379 0.821306 9.38476C0.765029 9.32369 0.722439 9.25131 0.696386 9.17246C0.666937 9.08333 0.666937 8.98339 0.666937 8.78351V7.87436M0.666937 4.95769V4.04853C0.666937 3.84866 0.666937 3.74872 0.696386 3.65959C0.722439 3.58074 0.765029 3.50836 0.821306 3.44729C0.88492 3.37826 0.972282 3.32972 1.147 3.23265L1.97944 2.77019M4.60444 1.31186L5.46367 0.834506C5.62911 0.742597 5.71182 0.696642 5.79942 0.678626C5.87696 0.66268 5.95692 0.66268 6.03445 0.678626C6.12205 0.696642 6.20477 0.742597 6.3702 0.834506L7.22944 1.31186M9.85444 2.77019L10.6869 3.23265C10.8616 3.32972 10.949 3.37826 11.0126 3.44729C11.0688 3.50835 11.1114 3.58074 11.1375 3.65959C11.1669 3.74872 11.1669 3.84866 11.1669 4.04853V4.95769M11.1669 7.87436V8.78351C11.1669 8.98339 11.1669 9.08333 11.1375 9.17246C11.1114 9.25131 11.0688 9.32369 11.0126 9.38476C10.949 9.45379 10.8616 9.50233 10.6869 9.59939L9.85444 10.0619M4.60444 5.68686L5.91694 6.41602M5.91694 6.41602L7.22944 5.68686M5.91694 6.41602V7.87436M0.666937 3.49936L1.97944 4.22852M9.85444 4.22852L11.1669 3.49936M5.91694 10.791V12.2494"
        stroke="#364153"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ProSeatIconProps {
  className?: string;
}

function ProSeatIcon({ className }: ProSeatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 11.6671 12.6654"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M10.7919 3.57804L5.83353 6.33267M5.83353 6.33267L0.875196 3.57804M5.83353 6.33267L5.83355 11.8744M11.0836 8.70018V3.9652C11.0836 3.76533 11.0835 3.66539 11.0541 3.57626C11.028 3.4974 10.9855 3.42502 10.9292 3.36395C10.8656 3.29492 10.7782 3.24639 10.6035 3.14932L6.28682 0.751172C6.12138 0.659263 6.03866 0.613309 5.95106 0.595293C5.87353 0.579347 5.79357 0.579347 5.71604 0.595293C5.62844 0.613309 5.54572 0.659264 5.38028 0.751173L1.06361 3.14932C0.888893 3.24639 0.801532 3.29492 0.737918 3.36395C0.68164 3.42502 0.639051 3.4974 0.612998 3.57626C0.583548 3.66539 0.583548 3.76533 0.583548 3.9652V8.70018C0.583548 8.90006 0.583548 8.99999 0.612998 9.08913C0.639051 9.16798 0.68164 9.24036 0.737918 9.30143C0.801532 9.37046 0.888893 9.41899 1.06362 9.51606L5.38028 11.9142C5.54572 12.0061 5.62844 12.0521 5.71604 12.0701C5.79357 12.086 5.87353 12.086 5.95106 12.0701C6.03866 12.0521 6.12138 12.0061 6.28682 11.9142L10.6035 9.51606C10.7782 9.41899 10.8656 9.37046 10.9292 9.30143C10.9855 9.24036 11.028 9.16798 11.0541 9.08913C11.0835 8.99999 11.0836 8.90006 11.0836 8.70018Z"
        stroke="#1C91FF"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface MaxSeatIconProps {
  className?: string;
}

function MaxSeatIcon({ className }: MaxSeatIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 11.6671 12.6654"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5.83355 0.791024V6.33269M5.83355 6.33269L10.7919 3.57802M5.83355 6.33269L0.875215 3.57802M5.83355 6.33269V11.8744M10.7919 9.08732L6.28682 6.58451C6.12138 6.4926 6.03866 6.44664 5.95106 6.42863C5.87353 6.41268 5.79357 6.41268 5.71604 6.42863C5.62844 6.44664 5.54572 6.4926 5.38028 6.58451L0.875215 9.08732M11.0836 8.70018V3.9652C11.0836 3.76533 11.0835 3.66539 11.0541 3.57626C11.028 3.4974 10.9855 3.42502 10.9292 3.36395C10.8656 3.29492 10.7782 3.24639 10.6035 3.14932L6.28682 0.751172C6.12138 0.659263 6.03866 0.613309 5.95106 0.595293C5.87353 0.579347 5.79357 0.579347 5.71604 0.595293C5.62844 0.613309 5.54572 0.659264 5.38028 0.751173L1.06361 3.14932C0.888893 3.24639 0.801532 3.29492 0.737918 3.36395C0.68164 3.42502 0.639051 3.4974 0.612998 3.57626C0.583548 3.66539 0.583548 3.76533 0.583548 3.9652V8.70018C0.583548 8.90006 0.583548 8.99999 0.612998 9.08913C0.639051 9.16798 0.68164 9.24036 0.737918 9.30143C0.801532 9.37046 0.888893 9.41899 1.06362 9.51606L5.38028 11.9142C5.54572 12.0061 5.62844 12.0521 5.71604 12.0701C5.79357 12.086 5.87353 12.086 5.95106 12.0701C6.03866 12.0521 6.12138 12.0061 6.28682 11.9142L10.6035 9.51606C10.7782 9.41899 10.8656 9.37046 10.9292 9.30143C10.9855 9.24036 11.028 9.16798 11.0541 9.08913C11.0835 8.99999 11.0836 8.90006 11.0836 8.70018Z"
        stroke="#FE9C1A"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SEAT_TIER_BADGE: Record<
  SeatTier["id"],
  { bg: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  free: { bg: "bg-gray-100", Icon: FreeSeatIcon },
  pro: { bg: "bg-blue-100", Icon: ProSeatIcon },
  max: { bg: "bg-golden-100", Icon: MaxSeatIcon },
};

const PLANS: Plan[] = [
  {
    id: "business",
    name: "Business",
    tagline: "For teams up to 100 people.",
    priceLabel: { yearly: "From $24", monthly: "From $30" },
    priceSubtext: {
      yearly: "/ seat / mo · billed yearly",
      monthly: "/ seat / mo · billed monthly",
    },
    seats: "Up to 100 seats",
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
      "EU data residency",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For AI at scale.",
    priceLabel: { yearly: "Custom", monthly: "Custom" },
    priceSubtext: {
      yearly: "",
      monthly: "",
    },
    seats: "Unlimited users",
    cta: "Talk to sales",
    ctaStyle: "dark",
    featured: false,
    aboveHighlightsNote: {
      title: "Company-wide credit pool",
      subtitle: "Managed by admins",
    },
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
        business: "5+ seats",
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
        business: "EU / US",
        enterprise: "EU / US",
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

const FAQS: FAQItemData[] = [
  {
    q: "What is a credit?",
    a: "A credit is Dust's unit of AI usage. Every interaction with an AI model consumes credits based on two things: the intelligence cost (which model you use and how complex the task is) and the tools involved (search, data retrieval, writing back to connected apps). Simple messages with standard models are free. Advanced models like Claude Opus or GPT-5 and tool-heavy workflows cost more. Think of credits as a transparent way to pay for exactly the AI work being done on your behalf.",
  },
  {
    q: "How are credits consumed?",
    a: "Credits are charged per message, based on the model used and the actions performed. A straightforward question to Claude Sonnet costs very little. A Deep Research task that spawns multiple agents, searches your connected data, and synthesizes a report costs more because it's doing more work. Every message shows its credit cost, so there are no surprises. Most standard conversations consume between 5 and 50 credits per exchange.",
  },
  {
    q: "Do unused credits roll over?",
    a: "No. Each seat's monthly credit allocation resets at the start of every billing period. This keeps pricing simple and predictable: you always know exactly what your team's monthly budget is.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "You won't be cut off mid-sentence. If an agent is already generating a response, it will finish. After that, Pro seats can go into overage up to a capped amount (2× the monthly seat price), so you'll never face a runaway bill. Once the cap is hit, the admin is prompted to upgrade the seat to Max. Free seats are blocked and prompted to request an upgrade from their admin.",
  },
  {
    q: "What's the difference between Free, Pro, and Max seats?",
    a: (
      <>
        <p className="mb-3">
          These are seat types within the Business plan. Admins assign one to
          each user based on their expected usage:
        </p>
        <ul>
          <li>
            <strong>Free:</strong> $0, 300 credits (lifetime). Great for people
            who want to try Dust or use it occasionally.
          </li>
          <li>
            <strong>Pro:</strong> $29/mo (or less annually), 8,000
            credits/month. The right fit for most team members.
          </li>
          <li>
            <strong>Max:</strong> for power users and heavy builders, 40,000
            credits/month. Ideal for people running complex automations or Deep
            Research daily.
          </li>
        </ul>
        <p className="mt-3">
          You can mix and match seat types across your workspace and reassign
          them anytime as workloads change.
        </p>
      </>
    ),
  },
  {
    q: "How does billing work when I add or remove members?",
    a: "Adding a member mid-cycle is prorated: they get their full credit allocation immediately, and you're charged only for the remaining days in the period on your next invoice. Removing a member frees the seat for reassignment. Monthly seats can be cancelled anytime; annual seats stay available for reassignment until their commitment ends. You can switch between monthly and annual billing per seat.",
  },
  {
    q: "Which AI models are included?",
    a: "All plans include access to 20+ models from OpenAI (GPT-5), Anthropic (Claude), Google (Gemini), Mistral, and DeepSeek. You choose the model per agent. More powerful models consume more credits per message, but there's no model locked behind a higher plan.",
  },
  {
    q: "When should I consider Enterprise?",
    a: "Enterprise is for organizations ready to make AI a core part of how they work. You get a dedicated Customer Success Manager, a hands-on onboarding program, and Solution Engineering resources to help you design and scale your AI workflows across teams. Enterprise also includes the security and compliance infrastructure (SSO, SCIM, audit logs, SLA) that larger organizations require. Contact sales when you're ready to talk.",
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

  useEffect(() => {
    const el = wrapRef.current?.querySelector<HTMLButtonElement>(
      `[data-val="${billing}"]`
    );
    if (el) {
      setSliderStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [billing]);

  const pillBase =
    "relative z-[1] inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 heading-sm motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted";

  return (
    <div
      ref={wrapRef}
      role="tablist"
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
        role="tab"
        data-val="yearly"
        aria-selected={billing === "yearly"}
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
        role="tab"
        data-val="monthly"
        aria-selected={billing === "monthly"}
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
                      <Icon className="h-5 w-5" />
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
                            ${tierPriceDollars}
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

      {plan.aboveHighlightsNote && (
        <>
          <div className="mb-5 flex items-center gap-3">
            <span
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-800"
              aria-hidden="true"
            >
              <UserGroupIcon className="h-5 w-5 text-primary-50" />
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="heading-sm text-foreground">
                {plan.aboveHighlightsNote.title}
              </span>
              <span className="copy-xs text-muted-foreground">
                {plan.aboveHighlightsNote.subtitle}
              </span>
            </div>
          </div>
          <Separator className="mb-5" />
        </>
      )}
      {plan.highlightsHeader && (
        <p className="copy-base mb-3 font-semibold text-foreground">
          {plan.highlightsHeader}
        </p>
      )}
      <ul className="copy-sm flex flex-col gap-3">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-foreground">
            <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
    <section className="flex flex-col items-center pt-6 text-center md:pt-10 lg:pt-14">
      <h1
        className={classNames(
          "heading-5xl md:heading-6xl lg:heading-7xl",
          "mb-5 max-w-3xl text-balance text-foreground"
        )}
      >
        Pricing that scales
        <br />
        with the work you get done.
      </h1>
      <p className="copy-lg mb-9 max-w-2xl text-balance text-muted-foreground">
        Choose self-serve plans for your team, or talk to us about
        enterprise-ready deployment, governance, and support.
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
        <CheckIcon className="h-5 w-5" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        aria-label="Not included"
        className="inline-flex h-6 w-6 items-center justify-center text-primary-300"
      >
        <DashIcon className="h-5 w-5" />
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

  const toggleSection = (sectionName: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionName]: !(prev[sectionName] ?? true),
    }));
  };

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
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
            <thead className="sticky top-16 z-10">
              <tr className="grid grid-cols-2 bg-background md:table-row">
                <th className="hidden border-b border-border bg-background px-2 text-left md:table-cell md:py-5">
                  <SearchInput
                    name="features-search"
                    placeholder="Search features…"
                    value={query}
                    onChange={setQuery}
                    className="max-w-xs [&_input]:font-medium [&_input::placeholder]:font-medium"
                  />
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
              const sectionPanelId = `comparison-section-${section.section.replace(/\s+/g, "-").toLowerCase()}`;
              return (
                <tbody
                  key={section.section}
                  className="[&_tr[data-row=feature]]:transition-opacity [&_tr[data-row=feature]]:duration-200 [&:has(tr[data-row=feature]:hover)_tr[data-row=feature]:not(:hover)]:opacity-40"
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
                        aria-controls={sectionPanelId}
                        className="group flex w-full items-center justify-between gap-2 px-2 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        <span className="heading-2xl font-semibold text-foreground">
                          {section.section}
                        </span>
                        <ChevronDownIcon
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
                          exit={{ y: -4 }}
                          transition={{
                            duration: 0.18,
                            ease: [0.215, 0.61, 0.355, 1],
                          }}
                        >
                          <td
                            id={sectionPanelId}
                            className="col-span-2 block px-2 pb-1.5 pt-3.5 align-middle md:table-cell md:py-3.5 md:pb-3.5"
                          >
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

  const goToSignup = () => {
    // eslint-disable-next-line react-hooks/immutability
    window.location.href = appendUTMParams(
      "/api/workos/login?screenHint=sign-up"
    );
  };

  const onBusinessStart = () => {
    trackEvent({
      area: TRACKING_AREAS.PRICING,
      object: "plan_card_start_trial",
      action: TRACKING_ACTIONS.CLICK,
      extra: { plan: "business", billing },
    });
    goToSignup();
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
