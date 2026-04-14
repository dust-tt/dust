import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

// =============================================================================
// PROMO CONFIG — Update this object to promote a new event.
// Set to null when there's nothing to promote.
// =============================================================================
const CURRENT_PROMO: PromoConfig | null = {
  id: "product-vision-webinar-2026-04",
  image: "/static/landing/Webinar_Banner.jpeg",
  link: "https://lnkd.in/eaRc2R6U",
  title: "Dust Product Vision Webinar",
  subtitle: "Apr 14 at 3:45 PM · Gabriel (CEO) & Thibaut (Partnerships)",
  linkLabel: "Register now",
  // Banner auto-hides after this date (end of the event day).
  expiresAt: new Date("2026-04-14T17:00:00"),
};
// =============================================================================

interface PromoConfig {
  /** Unique id — changing it resets dismissal for returning visitors. */
  id: string;
  /** Path to the image in public/static/. */
  image: string;
  /** Registration / event URL. */
  link: string;
  title: string;
  subtitle: string;
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
    if (
      CURRENT_PROMO.expiresAt &&
      new Date() > CURRENT_PROMO.expiresAt
    ) {
      return;
    }
    if (sessionStorage.getItem(storageKey(CURRENT_PROMO.id)) !== "true") {
      setIsVisible(true);
    }
  }, []);

  if (!isVisible || !CURRENT_PROMO) {
    return null;
  }

  const { image, link, title, subtitle, linkLabel, id } = CURRENT_PROMO;

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="relative">
        <a href={link} target="_blank" rel="noopener noreferrer">
          <img src={image} alt={title} className="w-full cursor-pointer" />
        </a>
        <Button
          variant="outline"
          icon={XMarkIcon}
          size="icon-xs"
          className="absolute right-1 top-1"
          onClick={() => {
            sessionStorage.setItem(storageKey(id), "true");
            setIsVisible(false);
          }}
        />
      </div>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 py-3"
      >
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>
        <div className="mt-1.5 text-xs font-medium text-blue-600 hover:underline">
          {linkLabel} →
        </div>
      </a>
    </div>
  );
}
