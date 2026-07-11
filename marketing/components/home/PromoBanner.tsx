import { Clock, User01, XClose } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

function ChevronIcon({
  direction,
  className,
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d={
          direction === "left"
            ? "M14.269 5.269a1.034 1.034 0 1 1 1.463 1.462L10.462 12l5.27 5.268a1.034 1.034 0 1 1-1.463 1.463l-6-6a1.034 1.034 0 0 1 0-1.463z"
            : "M9.731 5.269a1.034 1.034 0 1 0-1.463 1.462L13.538 12l-5.27 5.268a1.034 1.034 0 1 0 1.463 1.463l6-6a1.034 1.034 0 0 0 0-1.463z"
        }
      />
    </svg>
  );
}

// =============================================================================
// PROMO CONFIG — Update this array to promote events.
// Add or remove entries; when more than one is active they show as a carousel.
// Leave the array empty when there's nothing to promote.
// =============================================================================
const CURRENT_PROMOS: PromoConfig[] = [
  {
    id: "supercharge-revops-jul16",
    image: "/static/landing/RevOps_Webinar_Banner.jpeg",
    link: "https://watch.getcontrast.io/register/dust-supercharge-revops-with-dust-2?utm_source=website",
    badge: "Online Event",
    title: "Supercharge RevOps with Dust",
    time: "July 15 · 9:00am PST / 6:00pm CEST",
    linkLabel: "Register Now",
    // Banner auto-hides after this date (a few hours after the July 15th event).
    expiresAt: new Date("2026-07-15T13:00:00-08:00"),
  },
  {
    id: "second-brain-jul16",
    link: "https://watch.getcontrast.io/register/dust-second-brain-hot-off-the-grill?utm_source=website",
    badge: "Online Event",
    title: "Second Brain, hot off the grill",
    time: "July 16 · 8:30am PST / 5:30pm CEST",
    linkLabel: "Register Now",
    // Banner auto-hides after this date (a few hours after the July 16th event).
    expiresAt: new Date("2026-07-16T13:00:00-08:00"),
  },
];
// =============================================================================

interface PromoConfig {
  /** Unique id — changing it resets dismissal for returning visitors. */
  id: string;
  /** Path to the image in public/static/. */
  image?: string;
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

function storageKey(ids: string[]) {
  return `promo-banner-dismissed-${ids.join("+")}`;
}

export function PromoBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Only keep promos that haven't expired yet.
  const promos = useMemo(
    () =>
      CURRENT_PROMOS.filter(
        (promo) => !promo.expiresAt || new Date() <= promo.expiresAt
      ),
    []
  );

  useEffect(() => {
    if (promos.length === 0) {
      return;
    }
    const key = storageKey(promos.map((promo) => promo.id));
    if (sessionStorage.getItem(key) !== "true") {
      setIsVisible(true);
    }
  }, [promos]);

  if (!isVisible || promos.length === 0) {
    return null;
  }

  const hasCarousel = promos.length > 1;

  const goTo = (index: number) => {
    setActiveIndex((index + promos.length) % promos.length);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[264px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-black/5">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute right-1.5 top-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        onClick={() => {
          sessionStorage.setItem(storageKey(promos.map((p) => p.id)), "true");
          setIsVisible(false);
        }}
      >
        <XClose className="h-4 w-4" />
      </button>

      {/* Sliding track — each slide is exactly one card width. */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {promos.map((p, index) => (
            <a
              key={p.id}
              href={p.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-hidden={index !== activeIndex}
              tabIndex={index === activeIndex ? 0 : -1}
              className="group block w-full shrink-0 px-4 pb-3 pt-3.5"
            >
              <div className="mb-2 flex items-center gap-2 pr-6 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
                {p.badge}
              </div>
              <div className="text-sm font-semibold leading-snug text-slate-900">
                {p.title}
              </div>
              <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-500">
                <div className="flex items-start gap-1.5">
                  <Clock className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>{p.time}</span>
                </div>
                {p.host && (
                  <div className="flex items-start gap-1.5">
                    <User01 className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>{p.host}</span>
                  </div>
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-blue-600 group-hover:underline">
                {p.linkLabel}
                <span
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {hasCarousel && (
        <div className="-mt-1 flex items-center justify-center gap-2.5 px-4 pb-2.5">
          <button
            type="button"
            aria-label="Previous"
            className="flex h-5 w-5 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            onClick={() => goTo(activeIndex - 1)}
          >
            <ChevronIcon direction="left" className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-1.5">
            {promos.map((p, index) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Go to promo ${index + 1}`}
                aria-current={index === activeIndex}
                className={`h-1.5 rounded-full transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  index === activeIndex
                    ? "w-4 bg-blue-500"
                    : "w-1.5 bg-slate-300 hover:bg-slate-400"
                }`}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next"
            className="flex h-5 w-5 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            onClick={() => goTo(activeIndex + 1)}
          >
            <ChevronIcon direction="right" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
