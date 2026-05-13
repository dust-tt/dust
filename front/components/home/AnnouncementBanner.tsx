// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const SCROLL_HIDE_THRESHOLD_PX = 12;
const ANNOUNCEMENT_HREF = "/blog/series-b-multiplayer-ai";
const ANNOUNCEMENT_TEXT =
  "Dust announces Series B to fuel next chapter of growth";

// Banner auto-enables at this UTC timestamp: Monday 18 May 2026, 15:00 CET (UTC+1).
export const BANNER_VISIBLE_AFTER_MS = new Date(
  "2026-05-18T14:00:00Z"
).getTime();

interface AnnouncementBannerProps {
  show: boolean;
}

// Wrapper ensures scroll hooks are only registered when the banner is visible.
export function AnnouncementBanner({ show }: AnnouncementBannerProps) {
  if (!show) {
    return null;
  }
  return <AnnouncementBannerContent />;
}

function AnnouncementBannerContent() {
  const [hidden, setHidden] = useState(false);

  const sync = useCallback(() => {
    setHidden(window.scrollY > SCROLL_HIDE_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, [sync]);

  return (
    <Link
      href={ANNOUNCEMENT_HREF}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
      className={`group fixed left-0 right-0 top-0 z-[60] flex h-10 w-full items-center justify-center gap-2 bg-blue-500 px-4 text-white transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-opacity ${
        hidden
          ? "pointer-events-none -translate-y-full opacity-0 motion-reduce:translate-y-0"
          : "translate-y-0 opacity-100"
      }`}
    >
      <span className="inline-flex h-5 flex-shrink-0 items-center rounded-full bg-white px-2 text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-blue-500">
        New
      </span>
      <span className="truncate text-xs font-medium tracking-tight sm:text-sm">
        {ANNOUNCEMENT_TEXT}
      </span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
        aria-hidden="true"
      >
        <line x1="3" y1="8" x2="13" y2="8" />
        <polyline points="9 4 13 8 9 12" />
      </svg>
    </Link>
  );
}
