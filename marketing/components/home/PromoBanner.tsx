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

// Events to promote, in the order visitors page through them — an editorial
// call, not expiry order. Expired entries drop out on their own, so the banner
// needs no deploy to stay current; empty the list when there is nothing to
// promote. Preview a region-gated entry from anywhere with `?geo=FR`.

// Derived from `LOGO_LIST_REGIONS` rather than spelled out, so a market added
// there joins this audience instead of silently dropping out of it.
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
    expiresAt: new Date("2026-10-01T13:00:00-04:00"),
  },
  {
    id: "ia-en-entreprise-passez-a-l-echelle-oct13",
    image: "/static/landing/IA_Entreprise_Webinar_Banner.png",
    link: "https://watch.getcontrast.io/register/dust-ia-en-entreprise-passez-a-l-echelle-gardez-le-controle?utm_source=website",
    badge: "Événement en ligne",
    // Non-breaking space before the colon: French typography, and it keeps the
    // colon off the start of a line when this title wraps.
    title: "IA en entreprise\u00a0: passez à l’échelle, gardez le contrôle",
    time: "Mardi 13 octobre · 11h30–12h30",
    linkLabel: "S’inscrire",
    regions: ["FR"],
    expiresAt: new Date("2026-10-13T12:30:00+02:00"),
  },
];

interface PromoConfig {
  /** Changing it resets dismissal for returning visitors. */
  id: string;
  image: string;
  link: string;
  badge: string;
  title: string;
  time: string;
  host?: string;
  linkLabel: string;
  /** Markets this promo runs in. Omit to show it everywhere. */
  regions?: readonly LogoListRegion[];
  expiresAt?: Date;
}

/** Dismissal covers the whole carousel, so the key spans every promo shown. */
function storageKey(promos: PromoConfig[]) {
  return `promo-banner-dismissed-${promos.map((promo) => promo.id).join("+")}`;
}

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

export function PromoBanner() {
  const { geoData } = useGeolocation();
  const searchParams = useSearchParams();

  const [promos, setPromos] = useState<PromoConfig[]>([]);
  const [index, setIndex] = useState(0);

  // `?geo=FR` overrides the detected country, as it does for the logo bars, so
  // marketing can check a market's promo without sitting in that market.
  const geoParam = searchParams?.get("geo");
  const region = geoParam
    ? toLogoListRegion(geoParam)
    : geoData?.countryCode
      ? toLogoListRegion(geoData.countryCode)
      : null;

  // The visitor's clock picks the schedule, so it must not be read during SSR
  // (the server would bake in a stale promo). Re-runs once geolocation answers.
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
  const step = (offset: number) =>
    setIndex((current) => (current + offset + promos.length) % promos.length);

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
                aria-hidden={!isActive}
                tabIndex={isActive ? undefined : -1}
              >
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
