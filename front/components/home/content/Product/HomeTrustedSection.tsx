// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import Image from "next/image";

const LOGOS = [
  { name: "cursor", src: "/static/landing/logos/gray/cursor.svg" },
  { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
  { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
  { name: "spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
  { name: "mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
  { name: "1password", src: "/static/landing/logos/gray/1password.svg" },
  { name: "watershed", src: "/static/landing/logos/gray/watershed.svg" },
  { name: "vanta", src: "/static/landing/logos/gray/vanta.svg" },
];

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
  const marqueeLogos = [...LOGOS, ...LOGOS];
  return (
    <section className="flex w-full items-center justify-center bg-gradient-to-b from-background via-blue-50/40 to-blue-100/60 pb-32 pt-12">
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
                aria-hidden={idx >= LOGOS.length}
              >
                <Image
                  alt={idx >= LOGOS.length ? "" : logo.name}
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
