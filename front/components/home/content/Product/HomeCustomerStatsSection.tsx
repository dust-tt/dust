// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H2 } from "@app/components/home/ContentComponents";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import Image from "next/image";

type Accent = "blue" | "golden" | "rose" | "green" | "ink";

interface AccentTheme {
  bg: string;
  ring: string;
  metric: string;
  iconBg: string;
  iconAccent: string;
}

const ACCENT_THEME: Record<Accent, AccentTheme> = {
  blue: {
    bg: "bg-blue-50",
    ring: "ring-1 ring-inset ring-blue-100",
    metric: "text-blue-500",
    iconBg: "bg-blue-200",
    iconAccent: "bg-blue-500",
  },
  golden: {
    bg: "bg-golden-50",
    ring: "ring-1 ring-inset ring-golden-100",
    metric: "text-golden-500",
    iconBg: "bg-golden-200",
    iconAccent: "bg-golden-500",
  },
  rose: {
    bg: "bg-rose-50",
    ring: "ring-1 ring-inset ring-rose-100",
    metric: "text-rose-500",
    iconBg: "bg-rose-200",
    iconAccent: "bg-rose-500",
  },
  green: {
    bg: "bg-green-50",
    ring: "ring-1 ring-inset ring-green-100",
    metric: "text-green-700",
    iconBg: "bg-green-200",
    iconAccent: "bg-green-600",
  },
  ink: {
    bg: "bg-slate-950 text-white",
    ring: "ring-1 ring-inset ring-white/10",
    metric: "text-white",
    iconBg: "bg-white/20",
    iconAccent: "bg-blue-400",
  },
};

interface BentoStatCard {
  kind: "stat";
  span: string;
  accent: Accent;
  metric: string;
  description: string;
  logoSrc?: string;
  logoLabel?: string;
  metricSize?: "default" | "hero";
}

interface BentoQuoteCard {
  kind: "quote";
  span: string;
  accent: Accent;
  quote: string;
  logoSrc?: string;
  logoLabel?: string;
}

interface BentoPhotoCard {
  kind: "photo";
  span: string;
  imageSrc: string;
  alt: string;
  caption?: string;
  overline?: string;
}

type BentoCard = BentoStatCard | BentoQuoteCard | BentoPhotoCard;

const CARDS: BentoCard[] = [
  {
    kind: "stat",
    span: "col-span-1 sm:col-span-2 lg:col-span-2 lg:row-span-2",
    accent: "blue",
    metric: "100%",
    description: "of the customer experience team uses Dust daily",
    logoSrc: "/static/landing/logos/gray/malt.svg",
    logoLabel: "Malt",
    metricSize: "hero",
  },
  {
    kind: "photo",
    span: "col-span-1 sm:col-span-2 lg:col-span-2 lg:row-span-1",
    imageSrc: "/static/landing/people/people4.png",
    alt: "A team collaborating on Dust agents",
    overline: "From the field",
    caption: "Operators shipping every day.",
  },
  {
    kind: "stat",
    span: "col-span-1 lg:col-span-1",
    accent: "rose",
    metric: "×4",
    description: "Support tickets cut",
  },
  {
    kind: "stat",
    span: "col-span-1 lg:col-span-1",
    accent: "golden",
    metric: "50%",
    description: "Faster legal task completion",
    logoSrc: "/static/landing/logos/gray/payfit.svg",
    logoLabel: "Payfit",
  },
  {
    kind: "quote",
    span: "col-span-1 sm:col-span-2 lg:col-span-2",
    accent: "ink",
    quote:
      "Dust is the most impactful software we've adopted since building Clay.",
    logoSrc: "/static/landing/logos/gray/clay.svg",
    logoLabel: "Clay",
  },
  {
    kind: "stat",
    span: "col-span-1 lg:col-span-1",
    accent: "green",
    metric: "+50k",
    description: "Hours saved annually",
    logoSrc: "/static/landing/logos/gray/qonto.svg",
    logoLabel: "Qonto",
  },
  {
    kind: "stat",
    span: "col-span-1 lg:col-span-1",
    accent: "blue",
    metric: "95%",
    description: "Adoption",
  },
  {
    kind: "stat",
    span: "col-span-1 lg:col-span-1",
    accent: "rose",
    metric: "70%",
    description: "Translation bottleneck reduction",
    logoSrc: "/static/landing/logos/gray/fleet.svg",
    logoLabel: "Fleet",
  },
  {
    kind: "stat",
    span: "col-span-1 lg:col-span-1",
    accent: "green",
    metric: "84%",
    description: "Weekly active users",
    logoLabel: "Olon",
  },
  {
    kind: "quote",
    span: "col-span-1 sm:col-span-2 lg:col-span-2",
    accent: "blue",
    quote:
      "Dust has made it incredibly empowering for our employees to work smarter.",
    logoLabel: "Decade",
  },
  {
    kind: "photo",
    span: "col-span-1 sm:col-span-2 lg:col-span-2",
    imageSrc: "/static/landing/people/people5.png",
    alt: "Customers running Dust agents in their daily workflow",
    overline: "On the floor",
    caption: "AI operators making it look easy.",
  },
];

function HalfCircleIcon({ accent }: { accent: Accent }) {
  const theme = ACCENT_THEME[accent];
  return (
    <div className="relative h-10 w-10" aria-hidden="true">
      <div className={`absolute inset-0 rounded-full ${theme.iconBg}`} />
      <div
        className={`absolute inset-x-0 bottom-0 h-1/2 rounded-b-full ${theme.iconAccent}`}
      />
    </div>
  );
}

function Attribution({
  logoSrc,
  logoLabel,
  accent,
}: {
  logoSrc?: string;
  logoLabel?: string;
  accent: Accent;
}) {
  const isInk = accent === "ink";
  const labelClass = isInk ? "text-white/65" : "text-foreground/55";
  return (
    <div className="flex h-9 items-center gap-2.5">
      {logoSrc ? (
        <span
          className={`inline-flex h-9 items-center ${
            isInk ? "[&_img]:invert [&_img]:brightness-200" : ""
          }`}
        >
          <Image
            src={logoSrc}
            alt={logoLabel ?? ""}
            width={120}
            height={36}
            className="h-9 w-auto opacity-80"
          />
        </span>
      ) : null}
      {logoLabel && !logoSrc ? (
        <span
          className={`text-xs font-semibold uppercase tracking-[0.08em] ${labelClass}`}
        >
          {logoLabel}
        </span>
      ) : null}
    </div>
  );
}

function StatCard({ card, delay }: { card: BentoStatCard; delay: number }) {
  const theme = ACCENT_THEME[card.accent];
  const isHero = card.metricSize === "hero";
  const metricClass = isHero
    ? "heading-7xl lg:heading-8xl xl:heading-9xl"
    : "heading-5xl lg:heading-6xl";
  const labelClass =
    card.accent === "ink" ? "text-white/75" : "text-foreground/75";
  return (
    <HomeReveal
      delay={delay}
      className={`group relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl p-7 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] ${theme.bg} ${theme.ring} ${card.span}`}
    >
      <HalfCircleIcon accent={card.accent} />
      <div className="flex flex-col gap-3">
        <div
          className={`${metricClass} font-semibold leading-[0.92] tracking-[-1px] ${theme.metric}`}
        >
          {card.metric}
        </div>
        <p
          className={`m-0 max-w-[26ch] text-balance text-base leading-[1.4] ${labelClass}`}
        >
          {card.description}
        </p>
      </div>
      <Attribution
        logoSrc={card.logoSrc}
        logoLabel={card.logoLabel}
        accent={card.accent}
      />
    </HomeReveal>
  );
}

function QuoteCard({ card, delay }: { card: BentoQuoteCard; delay: number }) {
  const theme = ACCENT_THEME[card.accent];
  const isInk = card.accent === "ink";
  const quoteClass = isInk ? "text-white" : "text-foreground";
  const decorationClass = isInk ? "text-white/10" : "text-blue-500/15";
  return (
    <HomeReveal
      delay={delay}
      className={`group relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl p-7 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.22)] ${theme.bg} ${theme.ring} ${card.span}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -left-3 -top-12 select-none text-[180px] font-semibold leading-none ${decorationClass}`}
      >
        &ldquo;
      </span>
      <blockquote
        className={`relative m-0 max-w-[40ch] text-balance text-xl font-medium leading-[1.35] tracking-[-0.01em] md:text-2xl ${quoteClass}`}
      >
        {card.quote}
      </blockquote>
      <Attribution
        logoSrc={card.logoSrc}
        logoLabel={card.logoLabel}
        accent={card.accent}
      />
    </HomeReveal>
  );
}

function PhotoCard({ card, delay }: { card: BentoPhotoCard; delay: number }) {
  return (
    <HomeReveal
      delay={delay}
      className={`group relative overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-inset ring-white/5 ${card.span}`}
    >
      <Image
        src={card.imageSrc}
        alt={card.alt}
        fill
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        sizes="(min-width: 1024px) 50vw, 100vw"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/15 to-transparent"
      />
      {(card.overline || card.caption) && (
        <div className="absolute inset-x-6 bottom-6 flex flex-col gap-1 text-white">
          {card.overline ? (
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/80">
              {card.overline}
            </span>
          ) : null}
          {card.caption ? (
            <span className="text-balance text-lg font-medium leading-[1.25] tracking-[-0.005em] md:text-xl">
              {card.caption}
            </span>
          ) : null}
        </div>
      )}
    </HomeReveal>
  );
}

export function HomeCustomerStatsSection() {
  return (
    <section className="relative w-full bg-background py-24">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6">
        <HomeReveal>
          <H2 className="font-medium tracking-[-0.03em] text-foreground">
            Don&rsquo;t take our word for it
          </H2>
        </HomeReveal>
        <div className="grid auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[200px] lg:grid-flow-row-dense lg:grid-cols-4">
          {CARDS.map((card, index) => {
            const delay = 120 + index * 40;
            if (card.kind === "stat") {
              return <StatCard key={index} card={card} delay={delay} />;
            }
            if (card.kind === "quote") {
              return <QuoteCard key={index} card={card} delay={delay} />;
            }
            return <PhotoCard key={index} card={card} delay={delay} />;
          })}
        </div>
      </div>
    </section>
  );
}
