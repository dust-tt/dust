import Image from "next/image";

const LOGOS = [
  { src: "/static/landing/logos/gray/clay.svg", alt: "Clay", height: 24 },
  { src: "/static/landing/logos/gray/cursor.svg", alt: "Cursor", height: 24 },
  {
    src: "/static/landing/logos/gray/watershed.svg",
    alt: "Watershed",
    height: 20,
  },
  {
    src: "/static/landing/logos/gray/persona.svg",
    alt: "Persona",
    height: 20,
  },
  { src: "/static/landing/logos/gray/qonto.svg", alt: "Qonto", height: 24 },
  { src: "/static/landing/logos/gray/mirakl.svg", alt: "Mirakl", height: 20 },
  {
    src: "/static/landing/logos/gray/spendesk.svg",
    alt: "Spendesk",
    height: 20,
  },
  {
    src: "/static/landing/logos/gray/1password.svg",
    alt: "1Password",
    height: 24,
  },
];

const STATS = [
  { value: "300,000+", label: "agents deployed" },
  { value: "12M", label: "conversations" },
  { value: "70%", label: "weekly active users" },
];

export function SocialProofBar() {
  return (
    <section className="py-12 lg:py-16">
      <div className="mb-8 text-center">
        <p className="text-sm text-muted-foreground">
          Trusted among AI operators at{" "}
          <span className="font-semibold text-foreground">5,000+</span> global
          organizations
        </p>
      </div>

      <div className="mb-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 opacity-60">
        {LOGOS.map((logo) => (
          <Image
            key={logo.alt}
            src={logo.src}
            alt={logo.alt}
            width={logo.height * 4}
            height={logo.height}
            className="object-contain"
            style={{ height: logo.height }}
          />
        ))}
        <span className="text-sm font-semibold tracking-wide text-muted-foreground">
          Datadog
        </span>
        <span className="text-sm font-semibold tracking-wide text-muted-foreground">
          Criteo
        </span>
      </div>

      <div className="mx-auto grid max-w-2xl grid-cols-3 gap-8 text-center">
        {STATS.map((stat) => (
          <div key={stat.label}>
            <p className="font-objektiv text-3xl font-bold text-highlight md:text-4xl">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
