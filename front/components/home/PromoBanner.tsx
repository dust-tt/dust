import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

// =============================================================================
// PROMO CONFIG — Update this object to promote a new event.
// Set to null when there's nothing to promote.
// =============================================================================
const CURRENT_PROMO: PromoConfig | null = {
  id: "dust-for-gtm-engineers-webinar-2026-05",
  image: "/static/landing/GTM_Engineers_Webinar_Banner.png",
  link: "https://watch.getcontrast.io/register/dust-dust-for-gtm-engineers?utm_source=website",
  title: "Dust for GTM Engineers",
  subtitle: "May 12th, 5:30 PM CEST / 8:30 AM PDT",
  hostedBy: "Hosted by Maxence Garnier (GTM Engineer at Dust)",
  linkLabel: "Register Now",
  // Banner auto-hides after this date (May 12th 7:00 PM Paris / CEST).
  expiresAt: new Date("2026-05-12T19:00:00+02:00"),
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
  /** Optional second subtitle line (e.g. hosts). */
  hostedBy?: string;
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

  const { image, link, title, subtitle, hostedBy, linkLabel, id } =
    CURRENT_PROMO;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 max-w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:right-auto sm:max-w-[320px]">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden sm:block"
      >
        <img src={image} alt={title} className="w-full cursor-pointer" />
      </a>
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
        className="block px-3 py-2.5 pr-8 sm:px-4 sm:py-3 sm:pr-4"
      >
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <div className="mt-0.5 text-xs text-slate-900">{subtitle}</div>
        {hostedBy && (
          <div className="mt-0.5 text-xs text-slate-500">{hostedBy}</div>
        )}
        <div className="mt-1.5 text-xs font-medium text-blue-600 hover:underline">
          {linkLabel} →
        </div>
      </a>
    </div>
  );
}
