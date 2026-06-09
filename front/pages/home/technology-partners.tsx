// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import {
  FullWidthSection,
  Grid,
  H1,
  H2,
  P,
} from "@app/components/home/ContentComponents";
import { FinalCTASection } from "@app/components/home/content/Competitor/FinalCTASection";
import { DustDecoration } from "@app/components/home/DustDecoration";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { classNames } from "@app/lib/utils";
import {
  ActionSparklesIcon,
  BookOpen01,
  Button,
  Check,
  Code02,
  GcalLogo,
  GithubLogo,
  Globe01,
  GmailLogo,
  HubspotLogo,
  Icon,
  LinearLogo,
  MessageChatSquare,
  NotionLogo,
  Plus,
  Rocket02,
  SalesforceLogo,
  SlackLogo,
  ThumbsUp,
  VantaLogo,
} from "@dust-tt/sparkle";
import type { GetStaticProps } from "next";
import { useRouter } from "next/router";
import type { ComponentType, ReactElement } from "react";

// All partner CTAs centralize on either the partner registration form or the
// developer docs — we intentionally avoid a partners@dust.tt mailto here.
const PARTNER_FORM_URL =
  "https://share-eu1.hsforms.com/2FctvfmFxRQqllduT_JmlTA2dzwm3";
const MCP_DOCS_URL = "https://docs.dust.tt/docs/remote-mcp-server";
const GITHUB_URL = "https://github.com/dust-tt/dust";

// Shared centered content column, matching /home/partner.
const COL_CLASSES = classNames(
  "col-span-12",
  "lg:col-span-8 lg:col-start-2",
  "xl:col-span-8 xl:col-start-2",
  "2xl:col-start-3"
);

type ColorVariant = "blue" | "green" | "rose";

// Compact pastel card palette, mirroring dust.tt's marketing cards.
const CARD_COLORS: Record<ColorVariant, { card: string; icon: string }> = {
  blue: { card: "bg-blue-50", icon: "text-blue-400" },
  green: { card: "bg-green-50", icon: "text-green-400" },
  rose: { card: "bg-rose-50", icon: "text-rose-400" },
};

interface ValueCard {
  title: string;
  desc: string;
  color: ColorVariant;
  icon: ComponentType<{ className?: string }>;
}

const WHY_PARTNER: ValueCard[] = [
  {
    title: "Be discoverable",
    desc: "Your logo lives inside the Dust app where users browse apps, and on the public marketplace.",
    color: "blue",
    icon: Globe01,
  },
  {
    title: "Plug & play",
    desc: "One MCP URL is all it takes to get started and let Dust call tools in your app.",
    color: "green",
    icon: ActionSparklesIcon,
  },
  {
    title: "Grow together",
    desc: "From listed to Alliance, a clear graduation path with shared upside as traction proves out.",
    color: "rose",
    icon: ThumbsUp,
  },
];

interface BuildCard extends ValueCard {
  href: string;
  cta: string;
}

const BUILD_CARDS: BuildCard[] = [
  {
    title: "MCP documentation",
    desc: "Protocol fundamentals, OAuth and whitelisting flows, Dust-specific extensions.",
    color: "blue",
    icon: BookOpen01,
    href: MCP_DOCS_URL,
    cta: "View docs",
  },
  {
    title: "Build & test",
    desc: "Quickstart templates, example integrations on GitHub, connect and test inside Dust.",
    color: "green",
    icon: Code02,
    href: GITHUB_URL,
    cta: "See examples",
  },
  {
    title: "Get help",
    desc: "A direct line to our partner team, quickstart guides, and co-build sessions to get you live.",
    color: "rose",
    icon: MessageChatSquare,
    href: PARTNER_FORM_URL,
    cta: "Get in touch",
  },
];

type TierColor = "blue" | "green" | "golden";

// Tier accent colors mapped to the Sparkle palette.
const TIER_COLORS: Record<TierColor, { card: string; accent: string }> = {
  blue: { card: "bg-blue-100", accent: "text-blue-500" },
  green: { card: "bg-green-100", accent: "text-green-500" },
  golden: { card: "bg-golden-100", accent: "text-golden-500" },
};

interface Tier {
  name: string;
  /** Public tier number (1 = highest / Alliance, 3 = entry / Community). */
  tierNumber: number;
  /** Invitation-only tiers get a softer CTA label (still routes to the form). */
  isInvitationOnly?: boolean;
  tagline: string;
  color: TierColor;
  who: string;
  entry: string;
  partnerGets: string[];
  cadence: string;
}

// Display order left-to-right reads as the partner journey: Community → Growth
// → Alliance. `tierNumber` (1 = Alliance/highest, 3 = Community/entry) is the
// source of truth for the badge label and table, never the array index.
const PUBLIC_TIERS: Tier[] = [
  {
    name: "Community",
    tierNumber: 3,
    tagline: "Be discoverable. Reach Dust customers from day one.",
    color: "blue",
    who: "Any partner with a working MCP server that passes Dust quality checks.",
    entry: "Self-serve registration · ~1 week QA",
    partnerGets: [
      "Logo + integration card inside the Dust app — surfaced to every Dust user when they browse integrations",
      "Public listing on dust.tt/integrations with logo and category",
      "Periodic visibility in Dust's product communications (e.g. batched release notes, marketplace newsletter)",
      "Opportunistic discovery surfaces (e.g. UGC demos, themed launches, comparison content)",
    ],
    cadence: "Async / batched",
  },
  {
    name: "Growth",
    tierNumber: 2,
    tagline: "Warm rep-to-rep motion. Lightweight co-marketing.",
    color: "green",
    who: "Community partners showing GTM traction with Dust customers.",
    entry:
      "Provide dev support assets + adoption signal (e.g. customer installs, customer story)",
    partnerGets: [
      "A direct line to the Dust team (e.g. dedicated Slack channel)",
      "Account mapping with the Dust GTM team (e.g. via Crossbeam)",
      "Targeted co-marketing (e.g. customer story on Dust's blog, joint social, vertical playbooks)",
      "Warm rep-to-rep intros on shared deals when relevant",
    ],
    cadence: "Async recap & feedback to evolve the partnership",
  },
  {
    name: "Alliance",
    tierNumber: 1,
    isInvitationOnly: true,
    tagline: "Co-sell motion. Shared plans. Deep product collab.",
    color: "golden",
    who: "Partners aligned with Dust's GTM priorities, or invited by a Partner Account Manager.",
    entry: "Prove deal frequency + growing adoption — or be assigned by Dust",
    partnerGets: [
      "Joint co-sell motion with a shared business plan",
      "Joint marketing surface (e.g. themed launches, co-hosted webinars, in-person events)",
      "Recurring business reviews (e.g. QBRs, champion mapping)",
      "Deeper product collaboration (e.g. shared roadmap input, design partner opportunities)",
    ],
    cadence: "Monthly+ planning, quarterly QBR",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Get in touch",
    desc: "Share your app's MCP server URL and a few details about your product.",
  },
  {
    step: "02",
    title: "QA",
    desc: "We test the integration end-to-end against real Dust agents.",
  },
  {
    step: "03",
    title: "List",
    desc: "Your logo goes live inside the Dust app and on the public marketplace.",
  },
  {
    step: "04",
    title: "Grow",
    desc: "Based on traction and customer overlap, we can mutually agree to invest in more co-selling!",
  },
];

// Quotes sourced from dust.tt's public homepage. Replace with partner-specific
// quotes (e.g. from Customer.io, Attio, Granola) once collected.
const TESTIMONIALS = [
  {
    quote:
      "We made a bet on Dust because we knew the team was exceptional. What we didn't expect was how quickly it would transform how we work. Dust became the connective tissue that amplifies what each team does best.",
    name: "Ryan Wang",
    role: "CEO, Assembled",
  },
  {
    quote:
      "Dust is the most impactful software we've adopted since building Clay.",
    name: "Everett Berry",
    role: "Head of GTM Engineering at Clay",
  },
  {
    quote: "We used to do the work. Now we build the agents that do it.",
    name: "Shashank Khanna",
    role: "GTM Innovation at Vanta",
  },
];

// A sample of the 50+ apps already listed on the Dust marketplace. Logos come
// from the Sparkle platform logo set (the same ones used on /integrations).
const MARKETPLACE_LOGOS: {
  name: string;
  logo: ComponentType<{ className?: string }>;
}[] = [
  { name: "Salesforce", logo: SalesforceLogo },
  { name: "HubSpot", logo: HubspotLogo },
  { name: "Notion", logo: NotionLogo },
  { name: "GitHub", logo: GithubLogo },
  { name: "Linear", logo: LinearLogo },
  { name: "Slack", logo: SlackLogo },
  { name: "Gmail", logo: GmailLogo },
  { name: "Google Calendar", logo: GcalLogo },
  { name: "Vanta", logo: VantaLogo },
];

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      shape: 0,
    },
  };
};

export default function TechnologyPartnersNextJS() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Become a Dust Technology Partner"
        description="List your app on Dust and get discovered by thousands of AI agent users. Build on MCP, then grow into a deeper partnership as your traction proves out."
        pathname={router.asPath}
      />

      <div className="flex w-full flex-col gap-12 pb-16">
        {/* ─────────── Hero (left-aligned, dust.tt-style) ─────────── */}
        <Grid>
          <div
            className={classNames(
              COL_CLASSES,
              "flex flex-col gap-6 pt-8 md:pt-12"
            )}
          >
            <H1 mono className="text-foreground">
              Become a Dust technology partner
            </H1>
            <P size="lg" className="max-w-2xl text-muted-foreground">
              List your app on Dust and get discovered by thousands of users of
              our AI agents, or enable new agentic capabilities into your
              platform.
            </P>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button
                href={PARTNER_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                variant="highlight"
                size="md"
                icon={Rocket02}
                label="List your app"
              />
              <Button
                href="#how-it-works"
                variant="outline"
                size="md"
                label="How it works"
              />
            </div>
          </div>
        </Grid>

        {/* ─────────── Why partner with Dust ─────────── */}
        <Grid>
          <div className={COL_CLASSES}>
            <H2 className="mb-8 text-foreground">Why partner with Dust</H2>
            <div className="grid gap-4 sm:grid-cols-3 lg:gap-6">
              {WHY_PARTNER.map((v) => {
                const colors = CARD_COLORS[v.color];
                return (
                  <div
                    key={v.title}
                    className={classNames(
                      "flex flex-col rounded-2xl p-6",
                      colors.card
                    )}
                  >
                    <Icon
                      visual={v.icon}
                      size="md"
                      className={classNames("mb-4 h-8 w-8", colors.icon)}
                    />
                    <h4 className="text-lg font-semibold text-foreground">
                      {v.title}
                    </h4>
                    <P size="sm" className="mt-1 text-muted-foreground">
                      {v.desc}
                    </P>
                  </div>
                );
              })}
            </div>
          </div>
        </Grid>

        {/* ─────────── Build your app on Dust ─────────── */}
        <Grid>
          <div className={COL_CLASSES}>
            <H2 className="mb-2 text-foreground">Build your app on Dust</H2>
            <P size="md" className="mb-8 max-w-2xl text-muted-foreground">
              Everything you need to launch, from MCP basics to real examples
              and direct help.
            </P>
            <div className="grid gap-4 sm:grid-cols-3 lg:gap-6">
              {BUILD_CARDS.map((d) => {
                const colors = CARD_COLORS[d.color];
                return (
                  <a
                    key={d.title}
                    href={d.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={classNames(
                      "group flex flex-col rounded-2xl p-6 transition-all hover:-translate-y-0.5 hover:shadow-sm",
                      colors.card
                    )}
                  >
                    <Icon
                      visual={d.icon}
                      size="md"
                      className={classNames("mb-4 h-8 w-8", colors.icon)}
                    />
                    <h4 className="text-lg font-semibold text-foreground">
                      {d.title}
                    </h4>
                    <P
                      size="sm"
                      className="mt-1 flex-grow text-muted-foreground"
                    >
                      {d.desc}
                    </P>
                    <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                      {d.cta}
                      <span
                        aria-hidden="true"
                        className="transition-transform group-hover:translate-x-0.5"
                      >
                        →
                      </span>
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </Grid>

        {/* ─────────── The partner program (tiers + details table) ─────────── */}
        <Grid>
          <div className={COL_CLASSES}>
            <div className="mb-8">
              <H2 className="text-foreground">Our app partner program</H2>
              <P size="md" className="mt-2 max-w-2xl text-muted-foreground">
                From assistance to launch your app, all the way to a co-sell
                motion.
              </P>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {PUBLIC_TIERS.map((t) => {
                const colors = TIER_COLORS[t.color];
                return (
                  <div
                    key={t.name}
                    className={classNames(
                      "relative flex flex-col overflow-hidden rounded-2xl p-6 transition-shadow hover:shadow-md",
                      colors.card
                    )}
                  >
                    <DustDecoration position="top-right" size="sm" />

                    <span
                      className={classNames(
                        "mb-3 inline-flex w-fit rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        colors.accent
                      )}
                    >
                      Tier {t.tierNumber}
                    </span>

                    <h4 className="text-lg font-semibold text-foreground">
                      {t.name}
                    </h4>
                    <P size="sm" className="mt-1 text-muted-foreground">
                      {t.tagline}
                    </P>

                    {/* Top 3 benefits only — full detail lives in the table below. */}
                    <ul className="mt-4 flex-grow space-y-2">
                      {t.partnerGets.slice(0, 3).map((g) => (
                        <li
                          key={g}
                          className="flex gap-2 text-sm leading-snug text-foreground"
                        >
                          <Icon
                            visual={Check}
                            size="sm"
                            className={classNames(
                              "mt-0.5 h-4 w-4 shrink-0",
                              colors.accent
                            )}
                          />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5">
                      <Button
                        href={PARTNER_FORM_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        label={
                          t.isInvitationOnly
                            ? "Talk to the partner team"
                            : "Get in touch"
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Expand for the full program comparison. */}
            <details className="group mt-6 rounded-2xl border border-border bg-background">
              <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <span>See the full program details</span>
                <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="border-t border-border p-6">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Tier
                        </th>
                        <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Who it&apos;s for
                        </th>
                        <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          How to qualify
                        </th>
                        <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Cadence
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {PUBLIC_TIERS.map((t) => {
                        const colors = TIER_COLORS[t.color];
                        return (
                          <tr
                            key={t.name}
                            className="border-b border-border last:border-0"
                          >
                            <td className="py-3 pr-4 align-top">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Tier {t.tierNumber}
                              </div>
                              <div
                                className={classNames(
                                  "mt-0.5 font-semibold",
                                  colors.accent
                                )}
                              >
                                {t.name}
                              </div>
                            </td>
                            <td className="py-3 pr-4 align-top text-muted-foreground">
                              {t.who}
                            </td>
                            <td className="py-3 pr-4 align-top text-muted-foreground">
                              {t.entry}
                            </td>
                            <td className="py-3 align-top text-muted-foreground">
                              {t.cadence}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </div>
        </Grid>

        {/* ─────────── What app partners say (+ marketplace logos) ─────────── */}
        <Grid>
          <div className={COL_CLASSES}>
            <H2 className="text-foreground">What app partners say</H2>
            <P size="md" className="mb-8 mt-2 max-w-2xl text-muted-foreground">
              Join more than 50 apps already on the Dust marketplace.
            </P>
            <div className="grid gap-5 sm:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <figure
                  key={t.name}
                  className="flex flex-col rounded-2xl border border-border bg-background p-6"
                >
                  <blockquote className="copy-sm flex-grow text-foreground">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-5 border-t border-border pt-4">
                    <div className="text-sm font-semibold text-foreground">
                      {t.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.role}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>

            {/* A few of the apps already listed, plus a nudge to add your own. */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {MARKETPLACE_LOGOS.map((l) => (
                <div
                  key={l.name}
                  title={l.name}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background"
                >
                  <Icon visual={l.logo} size="lg" />
                </div>
              ))}
              <a
                href={PARTNER_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="List your app"
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                <Icon visual={Plus} size="md" />
              </a>
            </div>
          </div>
        </Grid>

        {/* ─────────── How it works (full-bleed band) ─────────── */}
        <FullWidthSection className="bg-muted">
          <div
            id="how-it-works"
            className="mx-auto max-w-5xl px-6 py-12 md:py-16"
          >
            <H2 className="mb-2 text-foreground">How it works</H2>
            <P size="md" className="mb-8 max-w-2xl text-muted-foreground">
              From a first conversation to a featured launch. Together, step by
              step.
            </P>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS.map((s) => (
                <div key={s.step} className="rounded-2xl bg-background p-6">
                  <div className="font-mono text-xs text-muted-foreground">
                    {s.step}
                  </div>
                  <h3 className="heading-base mt-2 text-foreground">
                    {s.title}
                  </h3>
                  <P size="sm" className="mt-2 text-muted-foreground">
                    {s.desc}
                  </P>
                </div>
              ))}
            </div>
          </div>
        </FullWidthSection>

        {/* ─────────── Final CTA (shared component) ─────────── */}
        <FinalCTASection
          config={{
            title: "Let's unlock multiplayer AI, together",
            subtitle:
              "Our shared customers do their best work when their agents can reach the apps they rely on, like yours.",
            primaryCTA: { label: "List your app", href: PARTNER_FORM_URL },
            secondaryCTA: { label: "Read the docs", href: MCP_DOCS_URL },
          }}
          trackingPrefix="technology_partner"
        />
      </div>
    </>
  );
}

TechnologyPartnersNextJS.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
