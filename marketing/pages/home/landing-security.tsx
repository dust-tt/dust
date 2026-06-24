// biome-ignore-all lint/plugin/noNextImports: Next.js page file
import { H2, P } from "@marketing/components/home/ContentComponents";
import { HomeEyebrow } from "@marketing/components/home/content/Product/HomeEyebrow";
import {
  HomeReveal,
  HomeRevealStyles,
} from "@marketing/components/home/content/Product/HomeReveal";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import { HomeTrustedMarqueeCompact } from "@marketing/components/home/content/Product/HomeTrustedSection";
import { TRACKING_AREAS, withTracking } from "@marketing/lib/tracking";
import { cn } from "@marketing/components/poke/shadcn/lib/utils";
import { ArrowRight, Button, Icon } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement, ReactNode } from "react";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      // Standalone "blank" landing: only the centered Dust logo at the top,
      // no site navigation or footer (same as the ebook landing pages).
      hideNavigation: true,
    },
  };
}

const TALK_TO_SECURITY_HREF = "/home/contact";
const TRUST_PAGE_HREF = "https://dust.tt/security";
const WEBINAR_HREF =
  "https://watch.getcontrast.io/register/dust-dust-security-webinar-the-ai-security-gap?utm_source=landing-security";

const CONTAINER = "mx-auto w-full max-w-[1180px] px-6";
const H2_CLASSES =
  "text-balance font-semibold leading-[1.08] tracking-[-0.03em] text-foreground";

// Accent palette mirrors HomeSecuritySection so this page reads in the same
// brand register as the homepage.
type Accent = "red" | "green" | "blue" | "golden";

interface AccentTheme {
  bg: string;
  number: string;
  dot: string;
  chip: string;
  chipDot: string;
}

const ACCENT: Record<Accent, AccentTheme> = {
  red: {
    bg: "bg-rose-50",
    number: "text-rose-500",
    dot: "bg-rose-500",
    chip: "bg-rose-100 text-rose-700",
    chipDot: "bg-rose-500",
  },
  green: {
    bg: "bg-green-50",
    number: "text-green-700",
    dot: "bg-green-700",
    chip: "bg-green-100 text-green-700",
    chipDot: "bg-green-600",
  },
  blue: {
    bg: "bg-blue-50",
    number: "text-blue-500",
    dot: "bg-blue-500",
    chip: "bg-blue-100 text-blue-700",
    chipDot: "bg-blue-500",
  },
  golden: {
    bg: "bg-golden-50",
    number: "text-golden-600",
    dot: "bg-golden-500",
    chip: "bg-golden-100 text-golden-700",
    chipDot: "bg-golden-500",
  },
};

// Headline emphasis stays in the same font and color as the rest of the
// headline — no second typeface, no accent color.
function Emphasis({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Monospace "activity log" card — a recurring visual that makes the
// attribution story concrete. Pure CSS/text so it needs no image assets.
interface LogRow {
  actor: "agent" | "human";
  text: ReactNode;
  time: string;
}

function EventLogCard({ rows }: { rows: LogRow[] }) {
  return (
    <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted-background px-6 py-4">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-golden-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-2.5 text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Activity log
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <div key={row.time} className="flex items-start gap-4 px-6 py-5">
            <span
              className={cn(
                "inline-flex flex-shrink-0 items-center rounded-md px-2 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.06em]",
                row.actor === "agent"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-green-100 text-green-700"
              )}
            >
              {row.actor}
            </span>
            <span className="flex-1 text-[13px] leading-[1.6] text-foreground">
              {row.text}
            </span>
            <span className="hidden pt-0.5 text-[11px] leading-none text-muted-foreground sm:block">
              {row.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// One tinted column for the flush "what it can / cannot do" tables.
interface RoleColumn {
  code: string;
  role: string;
  accent: Accent;
  touches: string;
  cannot: string;
}

function RoleColumns({ columns }: { columns: RoleColumn[] }) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-3xl md:grid-cols-3">
      {columns.map((column, colIdx) => {
        const theme = ACCENT[column.accent];
        return (
          <HomeReveal
            key={column.code}
            delay={120 + colIdx * 80}
            className={cn("flex flex-col gap-7 p-8", theme.bg)}
          >
            <header className="flex items-center gap-3">
              <span className={cn("text-lg font-semibold", theme.number)}>
                {column.code}
              </span>
              <span className="text-base font-semibold leading-tight text-foreground">
                {column.role}
              </span>
            </header>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  What it touches
                </span>
                <span className="text-sm leading-[1.5] text-foreground">
                  {column.touches}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  What it cannot do
                </span>
                <span className="text-sm leading-[1.5] text-foreground">
                  {column.cannot}
                </span>
              </div>
            </div>
          </HomeReveal>
        );
      })}
    </div>
  );
}

interface DotItem {
  accent: Accent;
  title?: string;
  text: ReactNode;
}

function DotList({ items }: { items: DotItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item, index) => {
        const theme = ACCENT[item.accent];
        return (
          <HomeReveal
            key={item.accent}
            variant="right"
            delay={80 + index * 60}
            className="flex items-start gap-3"
          >
            <span
              className={cn(
                "mt-2 block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                theme.dot
              )}
            />
            <P size="sm" className="leading-[1.6] text-foreground">
              {item.title && (
                <span className="font-semibold">{item.title} </span>
              )}
              {item.text}
            </P>
          </HomeReveal>
        );
      })}
    </div>
  );
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: matches sibling landing pages
export default function LandingSecurity() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Dust for Security: Stay in control of the agentic enterprise"
        description="AI agents are already inside your organization. Dust gives security teams real attribution, hard knowledge boundaries, admin-owned controls, and an architecture that breaks the Lethal Trifecta apart by design."
        pathname={router.asPath}
      />
      <HomeRevealStyles />
      {/* Break out of the layout container so sections run full-bleed.
          overflow-x-hidden guards against any horizontal scroll on mobile
          from the full-viewport width or the logo marquee animation. */}
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] flex w-screen flex-col overflow-x-hidden">
        {/* Hero */}
        <section className="w-full overflow-hidden bg-background pt-16 lg:pt-24">
          <div
            className={cn(
              CONTAINER,
              "flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16"
            )}
          >
            <div className="flex w-full flex-col gap-7 lg:w-[55%]">
              <HomeReveal>
                <HomeEyebrow label="Dust for Security" />
              </HomeReveal>
              <HomeReveal delay={80}>
                <h1 className="m-0 text-balance font-semibold leading-[1.04] tracking-[-0.035em] text-foreground text-[clamp(2.25rem,6vw,4.25rem)]">
                  Stay in <Emphasis>control</Emphasis> of the agentic enterprise
                </h1>
              </HomeReveal>
              <HomeReveal delay={160}>
                <P
                  size="md"
                  className="max-w-[480px] leading-[1.6] text-muted-foreground"
                >
                  AI agents are already inside your organization. Dust gives
                  security teams the levers to pull, and the evidence to show an
                  auditor.
                </P>
              </HomeReveal>
              <HomeReveal
                delay={240}
                className="flex flex-row flex-wrap items-center gap-2 xs:gap-4"
              >
                <Button
                  href={TALK_TO_SECURITY_HREF}
                  variant="highlight"
                  size="md"
                  label="Talk to an expert"
                  onClick={withTracking(
                    TRACKING_AREAS.HOME,
                    "security_hero_cta_primary"
                  )}
                />
                {/* Custom link: Sparkle's Button only renders a leading icon,
                    so we build the trailing-arrow CTA by hand, matched to the
                    md button height (h-12) sitting next to it. */}
                <a
                  href={TRUST_PAGE_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={withTracking(
                    TRACKING_AREAS.HOME,
                    "security_hero_cta_secondary"
                  )}
                  className="group inline-flex h-12 w-fit items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted-background xs:px-4"
                >
                  Read our security &amp; trust page
                  <Icon
                    visual={ArrowRight}
                    size="sm"
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </a>
              </HomeReveal>
            </div>
            <HomeReveal
              variant="photo"
              delay={200}
              className="hidden w-full justify-center lg:flex lg:w-[45%]"
            >
              <EventLogCard
                rows={[
                  {
                    actor: "agent",
                    text: (
                      <>
                        <span className="font-semibold">Sales-Agent</span>{" "}
                        updated a deal in{" "}
                        <span className="text-blue-700">HubSpot</span>
                      </>
                    ),
                    time: "09:41:02",
                  },
                  {
                    actor: "human",
                    text: (
                      <>
                        <span className="font-semibold">jane@acme.com</span>{" "}
                        sent a message in{" "}
                        <span className="text-blue-700">Slack</span>
                      </>
                    ),
                    time: "09:41:00",
                  },
                  {
                    actor: "agent",
                    text: (
                      <>
                        <span className="font-semibold">Research-Agent</span>{" "}
                        read 3 sources from the open web
                      </>
                    ),
                    time: "09:40:55",
                  },
                ]}
              />
            </HomeReveal>
          </div>
        </section>

        {/* Trusted by — scrolling logo marquee (title kept local to this page) */}
        <section className="flex w-full items-center justify-center bg-gradient-to-b from-background via-blue-50/40 to-blue-100/60 pb-20 pt-24 lg:pt-32">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-center gap-12 text-center">
            <HomeReveal>
              <h2 className="m-0 text-balance px-6 text-center text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl">
                Trusted among security teams
                <br />
                at <span className="text-blue-500">3,000+</span> global
                organizations
              </h2>
            </HomeReveal>
            <HomeReveal delay={120} className="w-full px-6">
              <HomeTrustedMarqueeCompact />
            </HomeReveal>
          </div>
        </section>

        {/* The three things security teams care about */}
        <section className="w-full bg-background py-14 lg:py-24">
          <div className={cn(CONTAINER, "flex flex-col gap-12")}>
            <div className="flex flex-col gap-6">
              <HomeReveal>
                <HomeEyebrow label="What security teams actually ask" />
              </HomeReveal>
              <HomeReveal delay={80}>
                <H2 className={cn(H2_CLASSES, "max-w-[820px]")}>
                  The things security teams care about
                </H2>
              </HomeReveal>
              <HomeReveal delay={160}>
                <P
                  size="sm"
                  className="max-w-[760px] leading-[1.6] text-muted-foreground"
                >
                  A handful of concerns drive every AI security conversation.
                  Each has a concrete answer in how Dust is built.
                </P>
              </HomeReveal>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {CONCERNS.map((concern, index) => {
                const theme = ACCENT[concern.accent];
                return (
                  <HomeReveal
                    key={concern.code}
                    delay={120 + index * 70}
                    className={cn(
                      "flex flex-col gap-5 rounded-3xl p-8",
                      theme.bg
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn("text-lg font-semibold", theme.number)}
                      >
                        {concern.code}
                      </span>
                      <span className="text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
                        {concern.title}
                      </span>
                    </div>
                    <p className="m-0 text-[15px] font-medium italic leading-[1.5] text-foreground/80">
                      "{concern.question}"
                    </p>
                    <div className="mt-auto flex items-start gap-2.5 border-t border-black/[0.06] pt-5">
                      <span
                        className={cn(
                          "mt-1.5 block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                          theme.dot
                        )}
                      />
                      <span className="text-sm leading-[1.5] text-foreground">
                        {concern.answer}
                      </span>
                    </div>
                  </HomeReveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* 01 — Attribution */}
        <section className="w-full bg-rose-50/40 py-14 lg:py-24">
          <div
            className={cn(
              CONTAINER,
              "flex flex-col items-center gap-12 lg:flex-row lg:gap-20"
            )}
          >
            <div className="flex w-full flex-col gap-6 lg:w-1/2">
              <HomeReveal>
                <SectionNumber code="01" accent="red" label="Attribution" />
              </HomeReveal>
              <HomeReveal delay={80}>
                <H2 className={H2_CLASSES}>Human or agent?</H2>
              </HomeReveal>
              <HomeReveal delay={160}>
                <P
                  size="sm"
                  className="max-w-[520px] leading-[1.6] text-muted-foreground"
                >
                  When something happens in your CRM, did a person do it or an
                  agent acting on their behalf? Most tools borrow a user's
                  credentials, leaving no trace an agent was involved.
                </P>
              </HomeReveal>
              <HomeReveal delay={220}>
                <P size="sm" className="max-w-[520px] leading-[1.6]">
                  <span className="font-semibold text-foreground">
                    Dust is different.
                  </span>{" "}
                  <span className="text-muted-foreground">
                    Our logs go beyond observability into real monitoring: the
                    actual security event, not noise you have to find signal in.
                  </span>
                </P>
              </HomeReveal>
            </div>
            <HomeReveal
              variant="photo"
              delay={140}
              className="flex w-full justify-center lg:w-1/2"
            >
              <EventLogCard
                rows={[
                  {
                    actor: "agent",
                    text: (
                      <>
                        <span className="font-semibold">Support-Agent</span>{" "}
                        created an issue in{" "}
                        <span className="text-blue-700">Jira</span>
                      </>
                    ),
                    time: "12:30:04",
                  },
                  {
                    actor: "human",
                    text: (
                      <>
                        <span className="font-semibold">marc@acme.com</span>{" "}
                        replied in <span className="text-blue-700">Slack</span>
                      </>
                    ),
                    time: "12:30:01",
                  },
                ]}
              />
            </HomeReveal>
          </div>
        </section>

        {/* 02 — Data leakage */}
        <section className="w-full bg-background py-14 lg:py-24">
          <div
            className={cn(
              CONTAINER,
              "flex flex-col items-center gap-12 lg:flex-row-reverse lg:gap-20"
            )}
          >
            <div className="flex w-full flex-col gap-6 lg:w-1/2">
              <HomeReveal>
                <SectionNumber code="02" accent="green" label="Data leakage" />
              </HomeReveal>
              <HomeReveal delay={80}>
                <H2 className={H2_CLASSES}>Keep the crown jewels in</H2>
              </HomeReveal>
              <HomeReveal delay={160}>
                <P
                  size="sm"
                  className="max-w-[520px] leading-[1.6] text-muted-foreground"
                >
                  IP, client names, deals in flight, PII. One mishandled record
                  can become a regulatory filing or a headline. Dust enforces
                  boundaries, not policies on paper.
                </P>
              </HomeReveal>
            </div>
            <div className="flex w-full flex-col gap-5 rounded-3xl bg-green-50 p-8 lg:w-1/2">
              <DotList
                items={[
                  {
                    accent: "green",
                    title: "Restricted spaces and pods.",
                    text: "Agents only access a defined body of knowledge. People without access to a pod simply can't reach it.",
                  },
                  {
                    accent: "blue",
                    title: "Your mental model becomes an enforced boundary.",
                    text: "Finance has no path to health data. By design, not by policy.",
                  },
                  {
                    accent: "red",
                    title: "Admins can enter conversations directly",
                    text: "when an investigation calls for it, not just metadata or dashboards.",
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {/* 03 — Control */}
        <section className="w-full bg-blue-50/40 py-14 lg:py-24">
          <div className={cn(CONTAINER, "flex flex-col gap-12")}>
            <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
              <div className="flex w-full flex-col gap-6 lg:w-1/2">
                <HomeReveal>
                  <SectionNumber code="03" accent="blue" label="Control" />
                </HomeReveal>
                <HomeReveal delay={80}>
                  <H2 className={H2_CLASSES}>
                    The precondition, not a feature
                  </H2>
                </HomeReveal>
                <HomeReveal delay={160}>
                  <P
                    size="sm"
                    className="max-w-[520px] leading-[1.6] text-muted-foreground"
                  >
                    Control isn't a nice-to-have. It's the precondition for
                    deploying AI responsibly across hundreds of users.
                  </P>
                </HomeReveal>
              </div>
              <div className="flex w-full flex-col gap-5 lg:w-1/2">
                <HomeReveal delay={120}>
                  <p className="m-0 text-sm font-semibold text-foreground">
                    With Dust, administrators decide:
                  </p>
                </HomeReveal>
                <DotList
                  items={[
                    {
                      accent: "blue",
                      text: "Who joins the workspace, and who's kept out.",
                    },
                    {
                      accent: "green",
                      text: "Which tools and connectors (MCPs) exist. Only admins set them up.",
                    },
                    {
                      accent: "golden",
                      text: "Which URLs, endpoints, and secrets are authorized in the Computer environment.",
                    },
                    {
                      accent: "red",
                      text: "Which departments get access, and when, via SSO + SCIM. A valid company email isn't enough; you must be in the group that grants access.",
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Lethal Trifecta */}
        <section className="w-full bg-background py-14 lg:py-24">
          <div className={cn(CONTAINER, "flex flex-col gap-12")}>
            <div className="flex flex-col gap-6">
              <HomeReveal>
                <HomeEyebrow label="Architecture by design" />
              </HomeReveal>
              <HomeReveal delay={80}>
                <H2 className={cn(H2_CLASSES, "max-w-[820px]")}>
                  Breaking the &ldquo;Lethal Trifecta&rdquo; apart
                </H2>
              </HomeReveal>
              <HomeReveal delay={160}>
                <P
                  size="sm"
                  className="max-w-[760px] leading-[1.6] text-muted-foreground"
                >
                  An agent becomes dangerous with all three at once. Untrusted
                  content can hijack it and turn its ability to act into an
                  exfiltration channel.
                </P>
              </HomeReveal>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {TRIFECTA.map((item, index) => {
                const theme = ACCENT[item.accent];
                return (
                  <HomeReveal
                    key={item.label}
                    delay={120 + index * 70}
                    className="flex h-full items-center gap-3 rounded-2xl border border-border bg-muted-background px-6 py-5"
                  >
                    <span
                      className={cn(
                        "block h-2 w-2 flex-shrink-0 rounded-full",
                        theme.dot
                      )}
                    />
                    <span className="text-sm font-medium leading-[1.4] text-foreground">
                      {item.label}
                    </span>
                  </HomeReveal>
                );
              })}
            </div>

            <HomeReveal delay={120}>
              <P
                size="sm"
                className="max-w-[760px] leading-[1.6] text-muted-foreground"
              >
                Dust pulls the three circles apart by design, with{" "}
                <span className="font-semibold text-foreground">
                  Structured Output
                </span>{" "}
                (constrain exactly what an agent can produce) and{" "}
                <span className="font-semibold text-foreground">
                  sub-agents
                </span>{" "}
                (split roles cleanly):
              </P>
            </HomeReveal>

            <RoleColumns
              columns={[
                {
                  code: "01",
                  role: "Research agent",
                  accent: "red",
                  touches: "Untrusted internet content",
                  cannot: "Reach internal data or write",
                },
                {
                  code: "02",
                  role: "Writer agent",
                  accent: "blue",
                  touches: "Structured input only",
                  cannot: "Browse untrusted content",
                },
                {
                  code: "03",
                  role: "Orchestrator",
                  accent: "green",
                  touches: "Internal data; calls other agents",
                  cannot: "Act as an unguarded exfiltration path",
                },
              ]}
            />
          </div>
        </section>

        {/* Go deeper — webinar */}
        <section className="w-full bg-background py-14 lg:py-24">
          <div
            className={cn(
              CONTAINER,
              "flex flex-col items-center gap-12 lg:flex-row lg:gap-16"
            )}
          >
            <div className="flex w-full flex-col gap-6 lg:w-1/2">
              <HomeReveal>
                <HomeEyebrow label="Online event" />
              </HomeReveal>
              <HomeReveal delay={80}>
                <H2 className={H2_CLASSES}>Go deeper</H2>
              </HomeReveal>
              <HomeReveal delay={160}>
                <P
                  size="sm"
                  className="max-w-[520px] leading-[1.6] text-muted-foreground"
                >
                  Watch the replay of our online event, "The AI Security Gap,"
                  on keeping agents under control across the enterprise.
                </P>
              </HomeReveal>
              <HomeReveal delay={220}>
                <a
                  href={WEBINAR_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={withTracking(
                    TRACKING_AREAS.HOME,
                    "security_webinar_cta"
                  )}
                  className="group inline-flex h-12 w-fit items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted-background"
                >
                  Watch the replay
                  <Icon
                    visual={ArrowRight}
                    size="sm"
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </a>
              </HomeReveal>
            </div>
            <HomeReveal
              variant="photo"
              delay={140}
              className="flex w-full justify-center lg:w-1/2"
            >
              <a
                href={WEBINAR_HREF}
                target="_blank"
                rel="noopener noreferrer"
                onClick={withTracking(
                  TRACKING_AREAS.HOME,
                  "security_webinar_cover"
                )}
                className="block w-full max-w-[560px] overflow-hidden rounded-3xl border border-border shadow-sm transition-shadow duration-200 hover:shadow-md"
              >
                <img
                  src="/static/landing/security/ai-security-gap-webinar.svg"
                  alt="The AI Security Gap — Dust & Contrast online event"
                  className="h-auto w-full"
                />
              </a>
            </HomeReveal>
          </div>
        </section>

        {/* The bottom line — dark CTA */}
        <section className="relative w-full overflow-hidden bg-slate-950 py-24 text-white lg:py-32">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <div
            className={cn(
              CONTAINER,
              "flex flex-col items-center gap-10 text-center"
            )}
          >
            <HomeReveal>
              <span className="inline-flex h-7 w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] uppercase tracking-[0.12em] text-white/70 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                The bottom line
              </span>
            </HomeReveal>
            <HomeReveal delay={80}>
              <h2 className="m-0 max-w-[920px] text-balance text-center font-semibold leading-[1.04] tracking-[-0.04em] text-white text-[clamp(2.25rem,4.5vw,3.75rem)]">
                The agentic enterprise is here. Stay in control while you adopt
                it.
              </h2>
            </HomeReveal>
            <HomeReveal
              delay={160}
              className="flex max-w-[680px] flex-col gap-2 text-white/70"
            >
              <p className="m-0 text-base leading-[1.6]">
                Real logs. Admin-owned connectors and secrets. Controlled
                rollout. Hard boundaries around knowledge. An architecture that
                breaks the Lethal Trifecta apart by design.
              </p>
            </HomeReveal>
            <HomeReveal
              delay={240}
              className="mt-2 flex flex-col items-center gap-4 sm:flex-row"
            >
              <Link
                href={TALK_TO_SECURITY_HREF}
                className="active:scale-[0.97] inline-block transition-transform duration-100"
              >
                <Button
                  variant="highlight"
                  size="md"
                  label="Talk to our security team"
                  onClick={withTracking(
                    TRACKING_AREAS.HOME,
                    "security_footer_cta_primary"
                  )}
                />
              </Link>
              <a
                href={TRUST_PAGE_HREF}
                target="_blank"
                rel="noopener noreferrer"
                onClick={withTracking(
                  TRACKING_AREAS.HOME,
                  "security_footer_cta_secondary"
                )}
                className="group inline-flex items-center gap-2 text-sm uppercase tracking-[0.1em] text-white/80 transition-colors hover:text-white"
              >
                <span className="block h-px w-6 bg-white/40 transition-all duration-200 group-hover:w-10 group-hover:bg-white" />
                dust.tt/security
                <span aria-hidden="true">→</span>
              </a>
            </HomeReveal>
          </div>
        </section>
      </div>
    </>
  );
}

interface SectionNumberProps {
  code: string;
  accent: Accent;
  label: string;
}

function SectionNumber({ code, accent, label }: SectionNumberProps) {
  const theme = ACCENT[accent];
  return (
    <span
      className={cn(
        "inline-flex h-7 w-fit items-center gap-2 rounded-full px-3 text-xs font-medium uppercase tracking-[0.06em]",
        theme.chip
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", theme.chipDot)} />
      {code} · {label}
    </span>
  );
}

interface Concern {
  code: string;
  title: string;
  accent: Accent;
  question: string;
  answer: string;
}

const CONCERNS: Concern[] = [
  {
    code: "01",
    title: "Attribution",
    accent: "blue",
    question: "Was this done by a person or an agent, and who's responsible?",
    answer: "Real logs tie every action to an agent and its human operator.",
  },
  {
    code: "02",
    title: "Data leakage",
    accent: "red",
    question: "Could our crown jewels escape, and would we be liable?",
    answer: "Restricted spaces and pods wall off knowledge by access.",
  },
  {
    code: "03",
    title: "Control",
    accent: "green",
    question:
      "Can I grant access, revoke it, and verify my mental model holds?",
    answer: "Admin-only connectors, tools, secrets, and proxy endpoints.",
  },
  {
    code: "04",
    title: "Rollout",
    accent: "golden",
    question: "Who gets access, and when?",
    answer: "SSO + SCIM gate access by group, not by email domain.",
  },
];

interface TrifectaItem {
  label: string;
  accent: Accent;
}

const TRIFECTA: TrifectaItem[] = [
  { label: "Access to private company data", accent: "blue" },
  {
    label: "Exposure to untrusted content (e.g. the open internet)",
    accent: "red",
  },
  { label: "The ability to act or communicate externally", accent: "golden" },
];

LandingSecurity.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
