import { Clock, User01, XClose } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

// =============================================================================
// PROMO CONFIG — Update this object to promote a new event.
// Set to null when there's nothing to promote.
// =============================================================================
const CURRENT_PROMO: PromoConfig | null = {
  id: "supercharge-revops-jul16",
  image: "/static/landing/RevOps_Webinar_Banner.jpeg",
  link: "https://watch.getcontrast.io/register/dust-supercharge-revops-with-dust-2?utm_source=website",
  badge: "Online Event",
  title: "Supercharge RevOps with Dust",
  time: "July 16 · 9:00am PST / 6:00pm CEST",
  linkLabel: "Register Now",
  // Banner auto-hides after this date (a few hours after the July 16th event).
  expiresAt: new Date("2026-07-16T13:00:00-08:00"),
};
// =============================================================================

interface PromoConfig {
  /** Unique id — changing it resets dismissal for returning visitors. */
  id: string;
  /** Path to the image in public/static/. */
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

function storageKey(id: string) {
  return `promo-banner-dismissed-${id}`;
}

export function PromoBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!CURRENT_PROMO) {
      return;
    }
    if (CURRENT_PROMO.expiresAt && new Date() > CURRENT_PROMO.expiresAt) {
      return;
    }
    if (sessionStorage.getItem(storageKey(CURRENT_PROMO.id)) !== "true") {
      setIsVisible(true);
    }
  }, []);

  if (!isVisible || !CURRENT_PROMO) {
    return null;
  }

  const { link, badge, title, time, host, linkLabel, id } = CURRENT_PROMO;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[264px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl ring-1 ring-black/5">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        onClick={() => {
          sessionStorage.setItem(storageKey(id), "true");
          setIsVisible(false);
        }}
      >
        <XClose className="h-4 w-4" />
      </button>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="group block p-4"
      >
        <div className="mb-2.5 flex items-center gap-2 pr-6 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          {badge}
        </div>
        <div className="text-sm font-semibold leading-snug text-slate-900">
          {title}
        </div>
        <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-500">
          <div className="flex items-start gap-1.5">
            <Clock className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{time}</span>
          </div>
          {host && (
            <div className="flex items-start gap-1.5">
              <User01 className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{host}</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-blue-600 group-hover:underline">
          {linkLabel}
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </div>
      </a>
    </div>
  );
}
