import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User01,
  XClose,
} from "@dust-tt/sparkle";
import type { LogoListRegion } from "@marketing/lib/logo_bars";
import { LOGO_LIST_REGIONS, toLogoListRegion } from "@marketing/lib/logo_bars";
import { useGeolocation } from "@marketing/lib/swr/geo";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// =============================================================================
// PROMO SCHEDULE — Ordered list of events to promote.
// Every entry that hasn't expired yet is shown, as a carousel the visitor can
// page through. Expired entries drop out on their own, so the banner needs no
// deploy to stay current. Array order is the order visitors page through and is
// an editorial call — the headline event leads, whichever one expires first.
// Empty it when there's nothing to promote.
//
// An entry with `regions` is only shown to visitors in those regions, so a
// market-specific event doesn't go out worldwide. Use `OUTSIDE_FRANCE` for an
// English-language event that should reach every market but France. Preview any
// entry from anywhere with `?geo=FR` on the URL.
// =============================================================================

// Every market except France, for our English-language events. Derived from
// `LOGO_LIST_REGIONS` rather than spelled out, so a market added there (see
// logo_bars.ts) joins this audience instead of silently dropping out of it.
const OUTSIDE_FRANCE: readonly LogoListRegion[] = LOGO_LIST_REGIONS.filter(
  (region) => region !== "FR"
);

const PROMO_SCHEDULE: PromoConfig[] = [
  {
    id: "take-control-of-your-ai-bill-oct8",
    image: "/static/landing/AI_Bill_Webinar_Banner.png",
    link: "https://watch.getcontrast.io/register/dust-metronome-x-northlane-x-dust?utm_source=website",
    badge: "Online Event",
    title: "Take control of your AI bill - with Metronome and Northlane CEOs",
    time: "October 8 · 12:30pm ET / 6:30pm CET",
    linkLabel: "Register Now",
    regions: OUTSIDE_FRANCE,
    // Drops out of the carousel an hour after the session starts.
    expiresAt: new Date("2026-10-08T13:30:00-04:00"),
  },
  {
    id: "how-to-use-openai-in-dust-oct1",
    image: "/static/landing/OpenAI_In_Dust_Webinar_Banner.png",
    link: "https://watch.getcontrast.io/register/dust-use-openai-in-dust?utm_source=website",
    badge: "Online Event",
    title: "How to use OpenAI in Dust",
    time: "October 1 · 12:00pm ET / 6:00pm CET",
    host: "Vince Sarkisian, Solutions Engineer @Dust",
    linkLabel: "Register Now",
    regions: OUTSIDE_FRANCE,
    // Drops out of the carousel an hour after the session starts.
    expiresAt: new Date("2026-10-01T13:00:00-04:00"),
  },
  {
    id: "ia-en-entreprise-passez-a-l-echelle-oct13",
    image: "/static/landing/IA_Entreprise_Webinar_Banner.png",
    link: "https://watch.getcontrast.io/register/dust-ia-en-entreprise-passez-a-l-echelle-gardez-le-controle?utm_source=website",
    badge: "Événement en ligne",
    // Non-breaking space before the colon: French typography, and it keeps the
    // colon off the start of a line when this title wraps in the 272px card.
    title: "IA en entreprise\u00a0: passez à l’échelle, gardez le contrôle",
    time: "Mardi 13 octobre · 11h30–12h30",
    linkLabel: "S’inscrire",
    // French-language event for a French audience — not shown in the UK or US.
    regions: ["FR"],
    // Drops out of the carousel when the session ends (CEST, DST still on).
    expiresAt: new Date("2026-10-13T12:30:00+02:00"),
  },
];
// =============================================================================

interface PromoConfig {
  /** Unique id — changing it resets dismissal for returning visitors. */
  id: string;
  /** Path to the image in public/static/ — shown on `sm` and up only. */
  image: string;
  /** Registration / event URL. */
  link: string;
  /** Badge label shown above the title (e.g. "Webinar", "Online Event"). */
  badge: string;
  title: string;
  /** Event time line, shown with a clock icon. */
  time: string;
  /** Optional host line, shown with a user icon. */
  host?: string;
  linkLabel: string;
  /**
   * Regions this promo is shown in, as `toLogoListRegion` maps the visitor's
   * country. Omit to show it everywhere.
   *
   * A region-gated promo stays hidden until geolocation resolves, and stays
   * hidden for good if it fails — showing a market's event to the rest of the
   * world is worse than showing nothing, so an unknown region never matches.
   */
  regions?: readonly LogoListRegion[];
  /** Optional expiry — banner stops showing after this date. */
  expiresAt?: Date;
}

/** Dismissal covers the whole carousel, so the key spans every promo shown. */
function storageKey(promos: PromoConfig[]) {
  return `promo-banner-dismissed-${promos.map((promo) => promo.id).join("+")}`;
}

/** Promos that are live for this visitor, in schedule order. */
/**
 * @cc [owner:martindust,label:product] region-gated-promo-needs-resolved-region
 * A promo carrying `regions` MUST NOT be returned unless `region` is non-null and listed in it.
 * An unresolved region (`null`, i.e. geolocation still pending or failed) MUST NOT match any
 * `regions` entry, so a market-gated promo stays hidden rather than defaulting to a market.
 * Note that `toLogoListRegion` maps an unknown country to `"US"`, so a caller that passes its
 * result for a failed lookup instead of `null` would show every market's promo worldwide.
 */
/**
 * @cc [owner:martindust,label:product] expired-promo-never-returned
 * A promo MUST NOT be returned once `now` is past its `expiresAt`, whatever the visitor's region.
 * A promo with no `expiresAt` never expires.
 */
function getActivePromos(
  now: Date,
  region: LogoListRegion | null
): PromoConfig[] {
  return PROMO_SCHEDULE.filter((promo) => {
    if (promo.expiresAt && now > promo.expiresAt) {
      return false;
    }
    return (
      !promo.regions || (region !== null && promo.regions.includes(region))
    );
  });
}

/**
 * @cc [owner:martindust,label:product] slide-rows-align-across-promos
 * The call to action MUST sit at the same offset on every slide, so paging never shifts it, and
 * the time line MUST stay vertically centred between the title and that call to action. Titles of
 * differing height therefore absorb their difference around the time line, never below the call
 * to action, which would leave it orphaned at the bottom of the shorter slide.
 */
/**
 * @cc [owner:martindust,label:product] paging-chrome-only-for-multiple-promos
 * The previous/next arrows and the dot indicators MUST render only while more than one promo is
 * active. A single active promo MUST render as a plain banner with no paging affordances, so the
 * card degrades from a carousel to a regular banner on its own as promos expire.
 */
export function PromoBanner() {
  const { geoData } = useGeolocation();
  const searchParams = useSearchParams();

  const [promos, setPromos] = useState<PromoConfig[]>([]);
  const [index, setIndex] = useState(0);

  // `?geo=FR` overrides the detected country, so marketing can check a
  // market's promo without sitting in that market — same override as the logo
  // bars. Null until geolocation answers: `toLogoListRegion` treats an unknown
  // country as US, which would leak a market-gated promo to the wrong visitor.
  const geoParam = searchParams?.get("geo");
  const region = geoParam
    ? toLogoListRegion(geoParam)
    : geoData?.countryCode
      ? toLogoListRegion(geoData.countryCode)
      : null;

  // Runs on mount, and again once geolocation resolves the region. The clock is
  // read here rather than during render: the schedule is picked from the
  // visitor's clock, so it must not run during SSR (the server would bake in a
  // stale promo).
  useEffect(() => {
    setIndex(0);
    const activePromos = getActivePromos(new Date(), region);
    if (
      activePromos.length === 0 ||
      sessionStorage.getItem(storageKey(activePromos)) === "true"
    ) {
      setPromos([]);
      return;
    }
    setPromos(activePromos);
  }, [region]);

  if (promos.length === 0) {
    return null;
  }

  const hasMultiplePromos = promos.length > 1;
  // Wraps around, so two events stay one click apart in either direction.
  const step = (offset: number) =>
    setIndex((current) => (current + offset + promos.length) % promos.length);

  // Below `sm` the card keeps its width but loses vertical padding, so it
  // covers less of the hero on a phone.
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[272px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-black/5">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        onClick={() => {
          sessionStorage.setItem(storageKey(promos), "true");
          setPromos([]);
        }}
      >
        <XClose className="h-3.5 w-3.5" />
      </button>
      {/* Slides sit side by side on one row; paging slides the row rather than
          swapping the content, so the movement reads as continuous. */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)] will-change-[transform] motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {promos.map((promo, promoIndex) => {
            const isActive = promoIndex === index;

            return (
              <a
                key={promo.id}
                href={promo.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex w-full shrink-0 flex-col"
                // Off-screen slides stay out of the tab order and the a11y tree.
                aria-hidden={!isActive}
                tabIndex={isActive ? undefined : -1}
              >
                {/* Decorative, and hidden below `sm` so the card stays small on
                    a phone — the title and time carry the message on their own. */}
                <Image
                  alt=""
                  src={promo.image}
                  width={972}
                  height={540}
                  className="hidden h-auto w-full sm:block"
                />
                <div className="flex flex-1 flex-col px-4 py-3 sm:py-3.5">
                  <div className="mb-1.5 flex items-center gap-1.5 pr-6 text-[10px] font-semibold uppercase tracking-wide text-blue-600 sm:mb-2">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    </span>
                    {promo.badge}
                  </div>
                  <div className="text-[13px] font-semibold leading-snug text-slate-900">
                    {promo.title}
                  </div>
                  {/* Centred in whatever space the title leaves over, so the
                      date holds the middle of the card while the CTA below it
                      still lands at the same height on every slide. The padding
                      is the minimum breathing room when there is no slack. */}
                  <div className="flex flex-1 items-center py-1.5 sm:py-2">
                    <div className="space-y-0.5 text-[11px] leading-snug text-slate-500">
                      <div className="flex items-start gap-1.5">
                        <Clock className="mt-px h-3 w-3 shrink-0 text-slate-400" />
                        <span>{promo.time}</span>
                      </div>
                      {promo.host && (
                        <div className="flex items-start gap-1.5">
                          <User01 className="mt-px h-3 w-3 shrink-0 text-slate-400" />
                          <span>{promo.host}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-blue-600 group-hover:underline">
                    {promo.linkLabel}
                    <span
                      aria-hidden
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
      {/* Kept outside the <a> — nesting buttons in a link is invalid markup and
          every arrow click would also open the registration page. */}
      {hasMultiplePromos && (
        <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1 sm:py-1.5">
          <button
            type="button"
            aria-label="Previous event"
            className="flex h-5 w-5 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
            onClick={() => step(-1)}
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-1">
            {promos.map((promo, promoIndex) => (
              <button
                key={promo.id}
                type="button"
                aria-label={`Show ${promo.title}`}
                aria-current={promoIndex === index}
                className={`h-1 rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
                  promoIndex === index
                    ? "w-2.5 bg-blue-500"
                    : "w-1 bg-slate-300 hover:bg-slate-400"
                }`}
                onClick={() => setIndex(promoIndex)}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next event"
            className="flex h-5 w-5 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
            onClick={() => step(1)}
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
