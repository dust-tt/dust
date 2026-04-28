// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { HomeCountUp } from "@app/components/home/content/Product/HomeCountUp";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button } from "@dust-tt/sparkle";
import Link from "next/link";

interface CTAStat {
  label: string;
  display: React.ReactNode;
}

const STATS: CTAStat[] = [
  {
    label: "Agents deployed",
    display: <HomeCountUp to={300000} suffix="+" durationMs={1400} />,
  },
  {
    label: "Teams running on Dust",
    display: <HomeCountUp to={5000} suffix="+" durationMs={1400} />,
  },
  {
    label: "All-time, every day",
    display: "Live now",
  },
];

export function HomeAIOperatorsCTASection() {
  return (
    <section className="relative w-full overflow-hidden bg-slate-950 py-32 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
      <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-10 px-6 text-center">
        <HomeReveal>
          <span className="inline-flex h-7 w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white/70 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            The platform for AI operators
          </span>
        </HomeReveal>
        <HomeReveal delay={80}>
          <h1 className="m-0 max-w-[920px] text-balance text-center text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white md:text-5xl xl:text-6xl">
            The best teams aren&apos;t just using AI.
            <br />
            They&apos;re{" "}
            <HomeReveal
              as="em"
              variant="running"
              delay={400}
              className="font-serif italic font-normal"
            >
              <span
                style={{
                  fontFamily:
                    'ui-serif, Georgia, Cambria, "Times New Roman", serif',
                }}
              >
                running
              </span>
            </HomeReveal>{" "}
            it.
          </h1>
        </HomeReveal>
        <HomeReveal
          delay={200}
          className="flex max-w-[680px] flex-col gap-6 text-white/70"
        >
          <p className="m-0 text-base leading-[1.6]">
            There&apos;s a new kind of person emerging in fast-moving companies;
            someone who doesn&apos;t wait for an AI tool to be handed to them.
            They build it with judgment, deploy it, and run it for their whole
            team. We call them AI operators.
          </p>
          <p className="m-0 text-base leading-[1.6]">
            At companies like Datadog, 1Password, Cursor, Vanta, Persona, Clay,
            and Qonto, thousands of AI operators have deployed over 300,000
            agents. They&apos;ve rewired how their teams work, achieved 70%
            weekly active usage, and expanded every single renewal.
          </p>
          <p className="m-0 text-base leading-[1.6] text-white/85">
            Work is being rewritten. The pen is in the hands of AI operators and
            their leaders.
            <br />
            We&apos;re building the platform they choose.
          </p>
        </HomeReveal>
        <HomeReveal
          delay={300}
          className="mt-2 flex flex-col items-center gap-5"
        >
          <Link
            href="/sign-up"
            className="active:scale-[0.97] inline-block transition-transform duration-100"
          >
            <Button
              variant="highlight"
              size="md"
              label="Become an AI operator"
              onClick={withTracking(TRACKING_AREAS.HOME, "ai_operator_become")}
            />
          </Link>
          <Link
            href="https://dust.tt/jobs"
            className="group inline-flex items-center gap-2 font-mono text-sm uppercase tracking-[0.1em] text-white/80 transition-colors hover:text-white"
          >
            <span className="block h-px w-6 bg-white/40 transition-all duration-200 group-hover:w-10 group-hover:bg-white" />
            We&apos;re hiring
            <span aria-hidden="true">→</span>
          </Link>
        </HomeReveal>
        <div className="mt-12 grid w-full max-w-[820px] grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
          {STATS.map((stat, index) => (
            <HomeReveal
              key={stat.label}
              delay={400 + index * 80}
              className="flex flex-col items-center gap-1 bg-slate-950 px-6 py-6"
            >
              <div className="text-2xl font-semibold tracking-[-0.02em] text-white md:text-3xl">
                {stat.display}
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/60">
                {stat.label}
              </div>
            </HomeReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
