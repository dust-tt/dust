// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import { useGeolocation } from "@app/lib/swr/geo";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";

// Exact copy of CASE_STUDIES from TrustedBy.tsx — keys are lowercase with no
// spaces (e.g. "backmarket", "payfit"). Lookup strips spaces from logo.name.
const CASE_STUDIES: Record<string, string> = {
  alan: "/customers/alans-pmm-team-transforms-sales-conversations-into-intelligence-with-ai-agents",
  assembled: "/customers/part-1-assembled-ai-operating-system",
  backmarket:
    "/customers/back-markets-fraud-team-builds-ai-detection-system-in-one-week-contributing",
  blueground: "/customers/customer-support-blueground",
  clay: "/customers/clay-scaling-gtme-team",
  doctolib:
    "/customers/why-doctolib-made-company-wide-enterprise-ai-a-national-cause",
  fleet: "/customers/how-valentine-head-of-marketing-at-fleet-uses-dust",
  kyriba: "/customers/kyriba-accelerating-innovation-with-dust",
  malt: "/customers/malt-customer-support",
  mirakl: "/customers/why-mirakl-chose-dust-as-its-go-to-agentic-solution",
  payfit: "/customers/dust-ai-payfit-efficiency",
  pennylane: "/customers/pennylane-dust-customer-support-journey",
  persona: "/customers/how-persona-hit-80-ai-agent-adoption-with-dust",
  profound: "/customers/profound-post-sales-team-reclaimed-1800-hours",
  qonto: "/customers/qonto-dust-ai-partnership",
  wakam:
    "/customers/how-wakam-cut-legal-contract-analysis-time-by-50-with-dust",
  watershed:
    "/customers/how-watershed-got-90-of-its-team-to-leverage-dust-agents",
  vanta:
    "/customers/how-vantas-gtm-team-saves-thousands-of-hours-annually-with-dust",
};

const LOGO_SETS = {
  // 🇺🇸 US & rest of world (default)
  default: [
    { name: "Datadog", src: "/static/landing/logos/gray/datadog.svg" },
    { name: "Clay", src: "/static/landing/logos/gray/clay.svg" },
    { name: "Cursor", src: "/static/landing/logos/gray/cursor.svg" },
    { name: "Assembled", src: "/static/landing/logos/gray/assembled.svg" },
    { name: "Decagon", src: "/static/landing/logos/gray/decagon.svg" },
    { name: "EvenUp", src: "/static/landing/logos/gray/evenup.svg" },
    { name: "Persona", src: "/static/landing/logos/gray/persona.svg" },
    { name: "1Password", src: "/static/landing/logos/gray/1password.svg" },
    { name: "Vanta", src: "/static/landing/logos/gray/vanta.svg" },
    { name: "Watershed", src: "/static/landing/logos/gray/watershed.svg" },
    { name: "Whatnot", src: "/static/landing/logos/gray/whatnot.svg" },
    { name: "Profound", src: "/static/landing/logos/gray/profound.svg" },
  ],
  // 🇬🇧 UK — UK HQ/office + high ARR + brand recognition
  gb: [
    { name: "Paddle", src: "/static/landing/logos/gray/paddle.svg" },
    { name: "Vanta", src: "/static/landing/logos/gray/vanta.svg" },
    { name: "Cursor", src: "/static/landing/logos/gray/cursor.svg" },
    { name: "Kyriba", src: "/static/landing/logos/gray/kyriba.svg" },
    { name: "TrueLayer", src: "/static/landing/logos/gray/truelayer.svg" },
    {
      name: "Contentsquare",
      src: "/static/landing/logos/gray/contentsquare.svg",
    },
    { name: "Datadog", src: "/static/landing/logos/gray/datadog.svg" },
    { name: "Spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
    { name: "Back Market", src: "/static/landing/logos/gray/backmarket.svg" },
    { name: "Causaly", src: "/static/landing/logos/gray/causaly.svg" },
    { name: "Clay", src: "/static/landing/logos/gray/clay.svg" },
    { name: "1Password", src: "/static/landing/logos/gray/1password.svg" },
    { name: "Watershed", src: "/static/landing/logos/gray/watershed.svg" },
  ],
  // 🇫🇷 FR — French-native companies, most with customer stories
  fr: [
    { name: "Doctolib", src: "/static/landing/logos/gray/doctolib.svg" },
    { name: "Alan", src: "/static/landing/logos/gray/alan.svg" },
    { name: "Qonto", src: "/static/landing/logos/gray/qonto.svg" },
    { name: "Pennylane", src: "/static/landing/logos/gray/pennylane.svg" },
    { name: "PayFit", src: "/static/landing/logos/gray/payfit.svg" },
    { name: "Malt", src: "/static/landing/logos/gray/malt.svg" },
    { name: "Mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
    {
      name: "Contentsquare",
      src: "/static/landing/logos/gray/contentsquare.svg",
    },
    { name: "Spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
    {
      name: "Welcome to the Jungle",
      src: "/static/landing/logos/gray/welcometothejungle.svg",
    },
    { name: "Cursor", src: "/static/landing/logos/gray/cursor.svg" },
    { name: "Kyriba", src: "/static/landing/logos/gray/kyriba.svg" },
    { name: "Didomi", src: "/static/landing/logos/gray/didomi.svg" },
  ],
} as const;

function useLogoSet() {
  const { query } = useRouter();
  const { geoData } = useGeolocation();

  // ?geo=FR|GB|US overrides geo detection (useful for dev/testing)
  const geoParam =
    typeof query.geo === "string" ? query.geo.toUpperCase() : undefined;
  const countryCode = geoParam ?? geoData?.countryCode;

  if (countryCode === "FR") {
    return LOGO_SETS.fr;
  }
  if (countryCode === "GB") {
    return LOGO_SETS.gb;
  }
  return LOGO_SETS.default;
}

const MARQUEE_CSS = `
  @keyframes home-trusted-marquee {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(-50%, 0, 0); }
  }
  .home-trusted-track {
    animation: home-trusted-marquee 40s linear infinite;
    will-change: transform;
  }
  .home-trusted-track:hover {
    animation-play-state: paused;
  }

  /* Case study chip — always visible for logos that have a URL. Color
     deepens on hover (handled by Tailwind hover:text-foreground). */
  .home-trusted-chip {
    transition: color 180ms cubic-bezier(0.165, 0.84, 0.44, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    .home-trusted-track { animation: none; }
    .home-trusted-chip { transition: none; }
  }
`;

// Arrow-up-right icon for the case study chip.
function ExternalArrowIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 8L8 2M8 2H3.5M8 2V6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeTrustedSection() {
  const logos = useLogoSet();
  const marqueeLogos = [...logos, ...logos];
  return (
    <section className="flex w-full items-center justify-center bg-gradient-to-b from-background via-blue-50/40 to-blue-100/60 pb-20 pt-12">
      <style dangerouslySetInnerHTML={{ __html: MARQUEE_CSS }} />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-center gap-12 text-center">
        <HomeReveal>
          <h2 className="m-0 text-balance px-6 text-center text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl">
            Trusted among AI Operators
            <br />
            at <span className="text-blue-500">3,000+</span> global
            organizations
          </h2>
        </HomeReveal>
        <HomeReveal delay={120} className="w-full">
          <div
            className="relative w-full overflow-hidden"
            style={{
              maskImage:
                "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)",
            }}
          >
            <div className="home-trusted-track flex w-max items-end gap-x-16 sm:gap-x-20 lg:gap-x-24">
              {marqueeLogos.map((logo, idx) => {
                const caseStudyUrl =
                  CASE_STUDIES[logo.name.toLowerCase().replace(/\s+/g, "")];
                const itemClassName =
                  "home-trusted-item flex flex-shrink-0 flex-col items-center gap-1";
                const inner = (
                  <>
                    <div className="flex h-14 items-center justify-center opacity-70 transition-opacity duration-150 ease-in-out [.home-trusted-item:hover_&]:opacity-100 md:h-16">
                      <Image
                        alt={idx >= logos.length ? "" : logo.name}
                        src={logo.src}
                        width={220}
                        height={64}
                        className="h-auto max-h-14 w-auto object-contain md:max-h-16"
                      />
                    </div>
                    {/* Reserve a fixed-height slot so items with and without a
                      chip share the same total height. Flex-center the chip
                      so it sits snug under the logo rather than floating in
                      the middle of an over-tall line box. */}
                    <div className="flex h-4 items-center justify-center">
                      {caseStudyUrl && (
                        <span className="home-trusted-chip inline-flex items-center gap-1 text-[11px] font-medium leading-none text-foreground/40 [.home-trusted-item:hover_&]:text-foreground/80">
                          Case study
                          <ExternalArrowIcon />
                        </span>
                      )}
                    </div>
                  </>
                );
                return caseStudyUrl ? (
                  <Link
                    key={`${logo.name}-${idx}`}
                    href={caseStudyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={idx >= logos.length ? -1 : undefined}
                    aria-hidden={idx >= logos.length}
                    className={itemClassName}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={`${logo.name}-${idx}`}
                    className={itemClassName}
                    aria-hidden={idx >= logos.length}
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
        </HomeReveal>
      </div>
    </section>
  );
}
