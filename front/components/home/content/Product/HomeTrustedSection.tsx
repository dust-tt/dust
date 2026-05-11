// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { useGeolocation } from "@app/lib/swr/geo";
import Image from "next/image";
import { useRouter } from "next/router";

const LOGO_SETS = {
  // 🇺🇸 US & rest of world (default)
  default: [
    { name: "Datadog", src: "/static/landing/logos/gray/datadog.svg" },
    { name: "Clay", src: "/static/landing/logos/gray/clay.svg" },
    { name: "Assembled", src: "/static/landing/logos/gray/assembled.svg" },
    { name: "Decagon", src: "/static/landing/logos/gray/decagon.svg" },
    { name: "Kyriba", src: "/static/landing/logos/gray/kyriba.svg" },
    { name: "EvenUp", src: "/static/landing/logos/gray/evenup.svg" },
    { name: "Persona", src: "/static/landing/logos/gray/persona.svg" },
    { name: "1Password", src: "/static/landing/logos/gray/1password.svg" },
    { name: "Vanta", src: "/static/landing/logos/gray/vanta.svg" },
    { name: "Watershed", src: "/static/landing/logos/gray/watershed.svg" },
    { name: "Whatnot", src: "/static/landing/logos/gray/whatnot.svg" },
    { name: "Profound", src: "/static/landing/logos/gray/profound.svg" },
  ],
  // 🇬🇧 UK — UK HQ/office + high ARR + brand recognition
  // TODO: add paddle.svg, truelayer.svg, birdie.svg to /public/static/landing/logos/gray/
  gb: [
    // { name: "Paddle", src: "/static/landing/logos/gray/paddle.svg" },
    // { name: "TrueLayer", src: "/static/landing/logos/gray/truelayer.svg" },
    { name: "Back Market", src: "/static/landing/logos/gray/backmarket.svg" },
    { name: "Alan", src: "/static/landing/logos/gray/alan.svg" },
    { name: "Mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
    { name: "Spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
    { name: "Watershed", src: "/static/landing/logos/gray/watershed.svg" },
    { name: "Datadog", src: "/static/landing/logos/gray/datadog.svg" },
    { name: "SumUp", src: "/static/landing/logos/gray/Sumup.svg" },
    {
      name: "Contentsquare",
      src: "/static/landing/logos/gray/contentsquare.svg",
    },
    { name: "Vanta", src: "/static/landing/logos/gray/vanta.svg" },
    // { name: "Birdie", src: "/static/landing/logos/gray/birdie.svg" },
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
  @media (prefers-reduced-motion: reduce) {
    .home-trusted-track {
      animation: none;
    }
  }
`;

export function HomeTrustedSection() {
  const logos = useLogoSet();
  const marqueeLogos = [...logos, ...logos];
  return (
    <section className="flex w-full items-center justify-center bg-gradient-to-b from-background via-blue-50/40 to-blue-100/60 pb-20 pt-12">
      <style dangerouslySetInnerHTML={{ __html: MARQUEE_CSS }} />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-center gap-12 text-center">
        <h2 className="m-0 text-balance px-6 text-center text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl">
          Trusted among AI operators
          <br />
          at <span className="text-blue-500">5,000+</span> global organizations
        </h2>
        <div
          className="relative w-full overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)",
          }}
        >
          <div className="home-trusted-track flex w-max items-center gap-x-16 sm:gap-x-20 lg:gap-x-24">
            {marqueeLogos.map((logo, idx) => (
              <div
                key={`${logo.name}-${idx}`}
                className="flex h-14 flex-shrink-0 items-center justify-center opacity-70 transition-opacity hover:opacity-100 md:h-16"
                aria-hidden={idx >= logos.length}
              >
                <Image
                  alt={idx >= logos.length ? "" : logo.name}
                  src={logo.src}
                  width={220}
                  height={64}
                  className="h-auto max-h-14 w-auto object-contain md:max-h-16"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
