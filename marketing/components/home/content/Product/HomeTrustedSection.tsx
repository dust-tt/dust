// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { HomeReveal } from "@marketing/components/home/content/Product/HomeReveal";
import { LogoBarImage } from "@marketing/components/home/LogoBarImage";
import { useLogoBar } from "@marketing/components/home/LogoListsContext";
import type { LogoBarLogo } from "@marketing/lib/logo_bars";
import {
  fallbackHomeTrustedGeo,
  homeTrustedBarSlug,
  toLogoListRegion,
} from "@marketing/lib/logo_bars";
import { useGeolocation } from "@marketing/lib/swr/geo";
import Link from "next/link";
import { useRouter } from "next/router";

// Logo lineups live in Contentful (`logoList` entries, one per region), with
// the hardcoded lists in lib/logo_bars.ts as the fallback. Case-study links
// come from the same entries, so they can no longer drift from TrustedBy's.
function useHomeTrustedLogos(): LogoBarLogo[] {
  const { query } = useRouter();
  const { geoData } = useGeolocation();

  // ?geo=FR|GB|US overrides geo detection (useful for dev/testing)
  const geoParam =
    typeof query.geo === "string" ? query.geo.toUpperCase() : undefined;
  const countryCode = geoParam ?? geoData?.countryCode;

  const region = toLogoListRegion(countryCode);

  return useLogoBar(region, homeTrustedBarSlug(fallbackHomeTrustedGeo(region)));
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

function MarqueeMaskWrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        maskImage:
          "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Compact, chrome-less variant of the marquee — same logos and animation but
 * without the title, background, or case-study chips. Use when you want the
 * rolling logos inline (e.g. embedded in a landing page column).
 */
export function HomeTrustedMarqueeCompact() {
  const logos = useHomeTrustedLogos();
  const marqueeLogos = [...logos, ...logos];
  return (
    <div className="w-full">
      <style dangerouslySetInnerHTML={{ __html: MARQUEE_CSS }} />
      <MarqueeMaskWrap>
        <div className="home-trusted-track flex w-max items-center gap-x-10 sm:gap-x-12">
          {marqueeLogos.map((logo, idx) => (
            <div
              key={`${logo.name}-${idx}`}
              className="flex h-10 flex-shrink-0 items-center justify-center opacity-60"
              aria-hidden={idx >= logos.length}
            >
              <LogoBarImage
                logo={logo}
                alt={idx >= logos.length ? "" : logo.name}
                width={180}
                height={50}
              />
            </div>
          ))}
        </div>
      </MarqueeMaskWrap>
    </div>
  );
}

export function HomeTrustedSection() {
  const logos = useHomeTrustedLogos();
  const marqueeLogos = [...logos, ...logos];
  return (
    <section className="flex w-full items-center justify-center bg-background pb-20 pt-12">
      <style dangerouslySetInnerHTML={{ __html: MARQUEE_CSS }} />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-center gap-12 text-center">
        <HomeReveal>
          <h2 className="m-0 text-balance px-6 text-center text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl">
            Trusted by teams
            <br />
            at <span className="text-blue-500">3,000+</span> global
            organizations
          </h2>
        </HomeReveal>
        <HomeReveal delay={120} className="w-full">
          <MarqueeMaskWrap>
            <div className="home-trusted-track flex w-max items-end gap-x-16 sm:gap-x-20 lg:gap-x-24">
              {marqueeLogos.map((logo, idx) => {
                const itemClassName =
                  "home-trusted-item flex flex-shrink-0 flex-col items-center gap-1";
                const inner = (
                  <>
                    <div className="flex h-12 items-center justify-center opacity-70 transition-opacity duration-150 ease-in-out [.home-trusted-item:hover_&]:opacity-100 md:h-14">
                      <LogoBarImage
                        logo={logo}
                        alt={idx >= logos.length ? "" : logo.name}
                        width={220}
                        height={60}
                      />
                    </div>
                    {/* Reserve a fixed-height slot so items with and without a
                      chip share the same total height. Flex-center the chip
                      so it sits snug under the logo rather than floating in
                      the middle of an over-tall line box. */}
                    <div className="flex h-4 items-center justify-center">
                      {logo.caseStudyUrl && (
                        <span className="home-trusted-chip inline-flex items-center gap-1 text-[11px] font-medium leading-none text-foreground/40 [.home-trusted-item:hover_&]:text-foreground/80">
                          Case study
                          <ExternalArrowIcon />
                        </span>
                      )}
                    </div>
                  </>
                );
                return logo.caseStudyUrl ? (
                  <Link
                    key={`${logo.name}-${idx}`}
                    href={logo.caseStudyUrl}
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
          </MarqueeMaskWrap>
        </HomeReveal>
      </div>
    </section>
  );
}
