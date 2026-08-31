import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User01,
  XClose,
} from "@dust-tt/sparkle";
import Image from "next/image";
import { useEffect, useState } from "react";

// =============================================================================
// PROMO SCHEDULE — Ordered list of events to promote.
// Every entry that hasn't expired yet is shown, as a carousel the visitor can
// page through. Expired entries drop out on their own, so the banner needs no
// deploy to stay current. Keep it ordered by `expiresAt` (soonest first) —
// that's the order visitors page through. Empty it when there's nothing to
// promote.
// =============================================================================
const PROMO_SCHEDULE: PromoConfig[] = [
  {
    id: "take-control-of-your-ai-spend-sep17",
    image: "/static/landing/AI_Spend_Webinar_Banner.png",
    link: "https://watch.getcontrast.io/register/dust-take-control-of-your-ai-spend?utm_source=website",
    badge: "Online Event",
    title: "Take control of your AI spend",
    time: "September 17 · 9:00am PT / 6:00pm CET",
    linkLabel: "Register Now",
    // Drops out of the carousel an hour after the September 17th event.
    expiresAt: new Date("2026-09-17T10:00:00-07:00"),
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
  /** Optional expiry — banner stops showing after this date. */
  expiresAt?: Date;
}

/** Dismissal covers the whole carousel, so the key spans every promo shown. */
function storageKey(promos: PromoConfig[]) {
  return `promo-banner-dismissed-${promos.map((promo) => promo.id).join("+")}`;
}

/** Promos that haven't expired yet, in schedule order. */
function getActivePromos(now: Date): PromoConfig[] {
  return PROMO_SCHEDULE.filter(
    (promo) => !promo.expiresAt || now <= promo.expiresAt
  );
}

export function PromoBanner() {
  // Resolved on mount only: the schedule is picked from the visitor's clock, so
  // it must not run during SSR (the server would bake in a stale promo).
  const [promos, setPromos] = useState<PromoConfig[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const activePromos = getActivePromos(new Date());
    if (activePromos.length === 0) {
      return;
    }
    if (sessionStorage.getItem(storageKey(activePromos)) !== "true") {
      setPromos(activePromos);
    }
  }, []);

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
    <div className="fixed bottom-4 right-4 z-40 w-[264px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-black/5">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        onClick={() => {
          sessionStorage.setItem(storageKey(promos), "true");
          setPromos([]);
        }}
      >
        <XClose className="h-4 w-4" />
      </button>
      {/* Slides sit side by side on one row; paging slides the row rather than
          swapping the content, so the movement reads as continuous. */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
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
                className="group block w-full shrink-0"
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
                <div className="px-4 py-3 sm:p-4">
                  <div className="mb-1.5 flex items-center gap-2 pr-6 text-[11px] font-semibold uppercase tracking-wide text-blue-600 sm:mb-2.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                    </span>
                    {promo.badge}
                  </div>
                  <div className="text-sm font-semibold leading-snug text-slate-900">
                    {promo.title}
                  </div>
                  <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-500 sm:mt-2">
                    <div className="flex items-start gap-1.5">
                      <Clock className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{promo.time}</span>
                    </div>
                    {promo.host && (
                      <div className="flex items-start gap-1.5">
                        <User01 className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>{promo.host}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-blue-600 group-hover:underline sm:mt-3">
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
        <div className="flex items-center justify-between border-t border-slate-100 px-1.5 py-0.5 sm:py-1">
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
                className={`h-1 w-1 rounded-full transition-colors ${
                  promoIndex === index
                    ? "bg-blue-500"
                    : "bg-slate-300 hover:bg-slate-400"
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
