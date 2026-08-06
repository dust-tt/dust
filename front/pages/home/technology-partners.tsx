// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import {
  FullWidthSection,
  Grid,
  H2,
  P,
} from "@app/components/home/ContentComponents";
import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
import {
  HomeReveal,
  HomeRevealStyles,
} from "@app/components/home/content/Product/HomeReveal";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { classNames } from "@app/lib/utils";
import {
  BookOpen01,
  Button,
  Check,
  Code02,
  GcalLogo,
  GithubLogo,
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

// Shared blue → golden → green accent language, applied by index, matching the
// homepage CTA stats and the redesigned partner page.
type Accent = "blue" | "golden" | "green";

const ACCENTS: Accent[] = ["blue", "golden", "green"];

const ACCENT_CHIP: Record<Accent, string> = {
  blue: "bg-blue-100 text-blue-500",
  golden: "bg-golden-100 text-golden-500",
  green: "bg-green-100 text-green-500",
};

const ACCENT_TEXT: Record<Accent, string> = {
  blue: "text-blue-500",
  golden: "text-golden-500",
  green: "text-green-500",
};

const WHY_PARTNER: { title: string; description: string }[] = [
  {
    title: "Be discoverable",
    description:
      "Your logo lives inside the Dust app where users browse apps, and on the public marketplace.",
  },
  {
    title: "Plug & play",
    description:
      "One MCP URL is all it takes to get started and let Dust call tools in your app.",
  },
  {
    title: "Grow together",
    description:
      "From listed to Alliance, a clear graduation path with shared upside as traction proves out.",
  },
];

interface BuildCard {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  cta: string;
}

const BUILD_CARDS: BuildCard[] = [
  {
    icon: BookOpen01,
    title: "MCP documentation",
    description:
      "Protocol fundamentals, OAuth and whitelisting flows, Dust-specific extensions.",
    href: MCP_DOCS_URL,
    cta: "View docs",
  },
  {
    icon: Code02,
    title: "Build & test",
    description:
      "Quickstart templates, example integrations on GitHub, connect and test inside Dust.",
    href: GITHUB_URL,
    cta: "See examples",
  },
  {
    icon: MessageChatSquare,
    title: "Get help",
    description:
      "A direct line to our partner team, quickstart guides, and co-build sessions to get you live.",
    href: PARTNER_FORM_URL,
    cta: "Get in touch",
  },
];

interface Tier {
  name: string;
  /** Public tier number (1 = highest / Alliance, 3 = entry / Community). */
  tierNumber: number;
  /** Invitation-only tiers get a softer CTA label (still routes to the form). */
  isInvitationOnly?: boolean;
  tagline: string;
  color: Accent;
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
    description:
      "Share your app's MCP server URL and a few details about your product.",
  },
  {
    step: "02",
    title: "QA",
    description: "We test the integration end-to-end against real Dust agents.",
  },
  {
    step: "03",
    title: "List",
    description:
      "Your logo goes live inside the Dust app and on the public marketplace.",
  },
  {
    step: "04",
    title: "Grow",
    description:
      "Based on traction and customer overlap, we can mutually agree to invest in more co-selling!",
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
      <HomeRevealStyles />

      <div className="flex w-full flex-col gap-24 md:gap-32">
        {/* ─────────── Hero (centered, homepage-style) ─────────── */}
        <Grid>
          <div className="col-span-12 flex flex-col items-center gap-5 pt-12 text-center md:pt-20">
            <HomeReveal>
              <h1 className="heading-5xl md:heading-6xl lg:heading-7xl">
                Become a Dust technology partner
              </h1>
            </HomeReveal>
            <HomeReveal delay={80} className="max-w-2xl">
              <P size="lg" className="text-balance text-muted-foreground">
                List your app on Dust and get discovered by thousands of users
                of our AI agents, or enable new agentic capabilities into your
                platform.
              </P>
            </HomeReveal>
            <HomeReveal delay={160}>
              <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row">
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
            </HomeReveal>
          </div>
        </Grid>

        {/* ─────────── Why partner — heading left, numbered list right ─────────── */}
        <Grid gap="gap-x-8 gap-y-10 md:gap-y-12">
          <HomeReveal className="col-span-12 flex flex-col items-start gap-4 text-left lg:col-span-4">
            <HomeEyebrow label="Why Dust" />
            <H2 className="text-left">Why partner with Dust</H2>
            <P size="md" className="text-muted-foreground">
              List once, then grow into a deeper partnership as your traction
              proves out.
            </P>
          </HomeReveal>
          <div className="col-span-12 flex flex-col lg:col-span-7 lg:col-start-6">
            {WHY_PARTNER.map((item, index) => (
              <HomeReveal
                key={item.title}
                delay={index * 80}
                className="flex flex-col gap-2 border-t border-border py-6 text-left first:border-t-0 first:pt-0"
              >
                <span
                  className={classNames(
                    "text-sm font-semibold tabular-nums",
                    ACCENT_TEXT[ACCENTS[index % ACCENTS.length]]
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h4 className="text-lg font-semibold text-foreground">
                  {item.title}
                </h4>
                <P size="sm" className="text-muted-foreground">
                  {item.description}
                </P>
              </HomeReveal>
            ))}
          </div>
        </Grid>

        {/* ─────────── Build your app — heading right, icon cards left ─────────── */}
        <Grid gap="gap-x-8 gap-y-10 md:gap-y-12">
          <HomeReveal className="col-span-12 flex flex-col items-start gap-4 text-left lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:items-end lg:text-right">
            <HomeEyebrow label="Build" />
            <H2 className="lg:text-right">Build your app on Dust</H2>
            <P size="md" className="text-muted-foreground lg:text-right">
              Everything you need to launch, from MCP basics to real examples
              and direct help.
            </P>
          </HomeReveal>
          <div className="col-span-12 flex flex-col gap-4 lg:col-span-7 lg:col-start-1 lg:row-start-1">
            {BUILD_CARDS.map((card, index) => (
              <HomeReveal key={card.title} delay={index * 80}>
                <a
                  href={card.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-4 rounded-2xl bg-muted p-6 text-left transition-all hover:shadow-sm"
                >
                  <div
                    className={classNames(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      ACCENT_CHIP[ACCENTS[index % ACCENTS.length]]
                    )}
                  >
                    <Icon visual={card.icon} className="h-5 w-5" size="sm" />
                  </div>
                  <div className="flex flex-col">
                    <h4 className="text-lg font-semibold text-foreground">
                      {card.title}
                    </h4>
                    <P size="sm" className="mt-1 text-muted-foreground">
                      {card.description}
                    </P>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                      {card.cta}
                      <span
                        aria-hidden="true"
                        className="transition-transform group-hover:translate-x-0.5"
                      >
                        →
                      </span>
                    </span>
                  </div>
                </a>
              </HomeReveal>
            ))}
          </div>
        </Grid>

        {/* ─────────── The partner program — centered header + tier cards ─────────── */}
        <div className="flex flex-col gap-10">
          <HomeReveal className="flex flex-col items-center gap-4 text-center">
            <HomeEyebrow label="Partner program" />
            <H2 className="text-center">Our app partner program</H2>
            <P size="md" className="max-w-2xl text-muted-foreground">
              From helping you launch your app, all the way to a co-sell motion.
            </P>
          </HomeReveal>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PUBLIC_TIERS.map((tier, index) => (
              <HomeReveal
                key={tier.name}
                delay={index * 80}
                className="flex flex-col rounded-2xl border border-border bg-muted p-6"
              >
                <span
                  className={classNames(
                    "mb-3 inline-flex w-fit rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    ACCENT_TEXT[tier.color]
                  )}
                >
                  Tier {tier.tierNumber}
                </span>
                <h3 className="text-lg font-semibold text-foreground">
                  {tier.name}
                </h3>
                <P size="sm" className="mt-1 text-muted-foreground">
                  {tier.tagline}
                </P>
                <ul className="mt-4 flex-grow space-y-2">
                  {tier.partnerGets.slice(0, 3).map((benefit) => (
                    <li
                      key={benefit}
                      className="flex gap-2 text-sm leading-snug text-foreground"
                    >
                      <Icon
                        visual={Check}
                        size="sm"
                        className={classNames(
                          "mt-0.5 h-4 w-4 shrink-0",
                          ACCENT_TEXT[tier.color]
                        )}
                      />
                      <span>{benefit}</span>
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
                      tier.isInvitationOnly
                        ? "Talk to the partner team"
                        : "Get in touch"
                    }
                  />
                </div>
              </HomeReveal>
            ))}
          </div>

          {/* Expand for the full program comparison. */}
          <details className="group rounded-2xl border border-border bg-background">
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
                    {PUBLIC_TIERS.map((tier) => (
                      <tr
                        key={tier.name}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-3 pr-4 align-top">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Tier {tier.tierNumber}
                          </div>
                          <div
                            className={classNames(
                              "mt-0.5 font-semibold",
                              ACCENT_TEXT[tier.color]
                            )}
                          >
                            {tier.name}
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-top text-muted-foreground">
                          {tier.who}
                        </td>
                        <td className="py-3 pr-4 align-top text-muted-foreground">
                          {tier.entry}
                        </td>
                        <td className="py-3 align-top text-muted-foreground">
                          {tier.cadence}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>

        {/* ─────────── How it works — centered header + steps ─────────── */}
        <div id="how-it-works" className="flex flex-col gap-10">
          <HomeReveal className="flex flex-col items-center gap-4 text-center">
            <HomeEyebrow label="Getting started" />
            <H2 className="text-center">How it works</H2>
            <P size="md" className="max-w-2xl text-muted-foreground">
              From a first conversation to a featured launch. Together, step by
              step.
            </P>
          </HomeReveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, index) => (
              <HomeReveal
                key={step.step}
                delay={index * 80}
                className="rounded-2xl border border-border bg-muted p-6"
              >
                <span
                  className={classNames(
                    "text-sm font-semibold tabular-nums",
                    ACCENT_TEXT[ACCENTS[index % ACCENTS.length]]
                  )}
                >
                  {step.step}
                </span>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <P size="sm" className="mt-2 text-muted-foreground">
                  {step.description}
                </P>
              </HomeReveal>
            ))}
          </div>
        </div>

        {/* ─────────── What app partners say + marketplace logos ─────────── */}
        <div className="flex flex-col gap-10">
          <HomeReveal className="flex flex-col items-center gap-4 text-center">
            <HomeEyebrow label="Customers" />
            <H2 className="text-center">What app partners say</H2>
            <P size="md" className="max-w-2xl text-muted-foreground">
              Join more than 50 apps already on the Dust marketplace.
            </P>
          </HomeReveal>
          <div className="grid gap-5 sm:grid-cols-3">
            {TESTIMONIALS.map((testimonial, index) => (
              <HomeReveal
                key={testimonial.name}
                delay={index * 80}
                as="figure"
                className="m-0 flex flex-col rounded-2xl border border-border bg-background p-6"
              >
                <blockquote className="copy-sm flex-grow text-foreground">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 border-t border-border pt-4 not-italic">
                  <div className="text-sm font-semibold text-foreground">
                    {testimonial.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {testimonial.role}
                  </div>
                </figcaption>
              </HomeReveal>
            ))}
          </div>
          <HomeReveal className="flex flex-wrap items-center justify-center gap-3">
            {MARKETPLACE_LOGOS.map((item) => (
              <div
                key={item.name}
                title={item.name}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background"
              >
                <Icon visual={item.logo} size="lg" />
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
          </HomeReveal>
        </div>
      </div>

      {/* ─────────── Final CTA — full-bleed dark band ─────────── */}
      <FullWidthSection>
        <section className="relative w-full overflow-hidden bg-slate-950 py-28 text-white md:py-32">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <div className="mx-auto flex w-full max-w-[820px] flex-col items-center gap-8 px-6 text-center">
            <HomeReveal>
              <span className="inline-flex h-7 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white/70 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                Become a partner
              </span>
            </HomeReveal>
            <HomeReveal delay={80}>
              <h2 className="m-0 max-w-[760px] text-balance text-center text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-white md:text-5xl">
                Let&apos;s unlock multiplayer AI,{" "}
                <span
                  className="font-normal italic"
                  style={{
                    fontFamily:
                      'ui-serif, Georgia, Cambria, "Times New Roman", serif',
                  }}
                >
                  together
                </span>
                .
              </h2>
            </HomeReveal>
            <HomeReveal delay={160} className="max-w-[620px]">
              <p className="m-0 text-base leading-[1.6] text-white/70">
                Our shared customers do their best work when their agents can
                reach the apps they rely on, like yours. List your app and
                let&apos;s unlock that, together.
              </p>
            </HomeReveal>
            <HomeReveal delay={240} className="mt-2 flex flex-col items-center">
              <a
                href={PARTNER_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="active:scale-[0.97] inline-block transition-transform duration-100"
              >
                <Button variant="highlight" size="md" label="List your app" />
              </a>
            </HomeReveal>
          </div>
        </section>
      </FullWidthSection>
    </>
  );
}

TechnologyPartnersNextJS.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
