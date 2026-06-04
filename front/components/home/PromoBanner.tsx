import { Button, ClockIcon, UserIcon, XMarkIcon } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

// =============================================================================
// PROMO CONFIG — Update this object to promote a new event.
// Set to null when there's nothing to promote.
// =============================================================================
const CURRENT_PROMO: PromoConfig | null = {
  id: "dust-for-customer-success",
  image: "/static/landing/SEO_Marketing_Webinar_Banner.png",
  link: "https://watch.getcontrast.io/register/dust-dust-for-customer-success?utm_source=website",
  badge: "Online Event",
  title: "Dust for Customer Success",
  time: "June 11",
  host: "Gianna Gard · AI Deployment",
  linkLabel: "Register Now",
  // Banner auto-hides after this date (June 11th 7:00 PM Paris / CEST).
  expiresAt: new Date("2026-06-11T19:00:00+02:00"),
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
    <div className="fixed bottom-4 right-4 z-40 max-w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:max-w-[210px]">
      <Button
        variant="outline"
        icon={XMarkIcon}
        size="icon-xs"
        className="absolute right-1 top-1 z-10"
        onClick={() => {
          sessionStorage.setItem(storageKey(id), "true");
          setIsVisible(false);
        }}
      />
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-2.5 py-2 pr-7 sm:px-3 sm:py-2.5 sm:pr-3"
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
          {badge}
        </div>
        <div className="text-xs font-semibold text-slate-900">{title}</div>
        <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <ClockIcon className="h-3 w-3 shrink-0 text-slate-400" />
            <span>{time}</span>
          </div>
          {host && (
            <div className="flex items-center gap-1.5">
              <UserIcon className="h-3 w-3 shrink-0 text-slate-400" />
              <span>{host}</span>
            </div>
          )}
        </div>
        <div className="mt-1.5 text-[11px] font-medium text-blue-600 hover:underline">
          {linkLabel} →
        </div>
      </a>
    </div>
  );
}
