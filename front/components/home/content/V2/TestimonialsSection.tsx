import { H2 } from "@app/components/home/ContentComponents";
import { Button } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";

interface StatCardProps {
  logo: string;
  logoAlt: string;
  value: string;
  label: string;
}

function StatCard({ logo, logoAlt, value, label }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <Image
        src={logo}
        alt={logoAlt}
        width={96}
        height={24}
        className="mb-4 opacity-70"
        style={{ height: 24 }}
      />
      <p className="mb-1 font-objektiv text-4xl font-bold text-highlight">
        {value}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

const STATS: StatCardProps[] = [
  {
    logo: "/static/landing/logos/color/malt.png",
    logoAlt: "Malt",
    value: "100%",
    label: "of CX team uses Dust daily",
  },
  {
    logo: "/static/landing/logos/color/doctolib.png",
    logoAlt: "Doctolib",
    value: "95%",
    label: "adoption across 3,000 employees",
  },
  {
    logo: "/static/landing/logos/color/qonto.png",
    logoAlt: "Qonto",
    value: "x4",
    label: "support tickets cut · +50k hours saved/year",
  },
  {
    logo: "/static/landing/logos/color/fleet.png",
    logoAlt: "Fleet",
    value: "70%",
    label: "reduction in translation bottleneck",
  },
];

const TRUST_LOGOS = [
  { src: "/static/landing/logos/gray/vanta.svg", alt: "Vanta" },
  { src: "/static/landing/logos/gray/assembled.svg", alt: "Assembled" },
  { src: "/static/landing/logos/gray/clay.svg", alt: "Clay" },
  { src: "/static/landing/logos/gray/cursor.svg", alt: "Cursor" },
  { src: "/static/landing/logos/gray/doctolib.svg", alt: "Doctolib" },
  { src: "/static/landing/logos/gray/mirakl.svg", alt: "Mirakl" },
  { src: "/static/landing/logos/gray/qonto.svg", alt: "Qonto" },
  { src: "/static/landing/logos/gray/persona.svg", alt: "Persona" },
  { src: "/static/landing/logos/gray/spendesk.svg", alt: "Spendesk" },
  { src: "/static/landing/logos/gray/1password.svg", alt: "1Password" },
  { src: "/static/landing/logos/gray/fleet.svg", alt: "Fleet" },
  { src: "/static/landing/logos/gray/watershed.svg", alt: "Watershed" },
];

export function TestimonialsSection() {
  return (
    <section className="py-16 lg:py-24">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        📊 Don&rsquo;t Take Our Word for It
      </p>
      <H2 mono className="mb-10 text-left">
        The numbers speak for themselves.
      </H2>

      <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard key={stat.logoAlt} {...stat} />
        ))}

        {/* Clay quote card */}
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:col-span-2">
          <Image
            src="/static/landing/logos/color/clay.png"
            alt="Clay"
            width={96}
            height={24}
            className="mb-4 opacity-70"
            style={{ height: 24 }}
          />
          <p className="italic leading-relaxed text-muted-foreground">
            &ldquo;Dust is the most impactful software we&rsquo;ve adopted since
            building Clay.&rdquo;
          </p>
        </div>

        {/* PayFit */}
        <StatCard
          logo="/static/landing/logos/color/payfit.png"
          logoAlt="PayFit"
          value="50%"
          label="faster legal task completion"
        />

        {/* Alan */}
        <StatCard
          logo="/static/landing/logos/color/alan.png"
          logoAlt="Alan"
          value="84%"
          label="weekly active users"
        />
      </div>

      {/* Trust bar */}
      <div className="text-center">
        <p className="mb-6 text-sm text-muted-foreground">
          Trusted by{" "}
          <span className="font-semibold text-foreground">5,000+</span>{" "}
          organizations
        </p>
        <div className="mb-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 opacity-50">
          {TRUST_LOGOS.map((logo) => (
            <Image
              key={logo.alt}
              src={logo.src}
              alt={logo.alt}
              width={80}
              height={20}
              className="object-contain"
              style={{ height: 20 }}
            />
          ))}
        </div>
        <Link href="https://dust.tt/home/signup">
          <Button label="Join them" variant="highlight" size="md" />
        </Link>
      </div>
    </section>
  );
}
