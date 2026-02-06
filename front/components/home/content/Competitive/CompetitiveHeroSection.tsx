import {
  ArrowRightIcon,
  CheckIcon,
  Icon,
  LockIcon,
  Spinner,
  TimeIcon,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import { WorkspaceSelector } from "@app/components/home/WorkspaceSelector";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { clientFetch } from "@app/lib/egress/client";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

function getTrustBadgeIcon(index: number): {
  icon: typeof CheckIcon;
  colorClass: string;
} {
  switch (index) {
    case 0:
      return { icon: CheckIcon, colorClass: "text-emerald-500" };
    case 1:
      return { icon: TimeIcon, colorClass: "text-blue-500" };
    default:
      return { icon: LockIcon, colorClass: "text-amber-500" };
  }
}

interface CompetitiveHeroSectionProps {
  chip: string;
  headline: ReactNode;
  postItText: string;
  valueProps: string[];
  valuePropTitle: string;
  ctaButtonText: string;
  trustBadges: string[];
  trackingObject?: string;
}

export function CompetitiveHeroSection({
  chip,
  headline,
  postItText,
  valueProps,
  valuePropTitle,
  ctaButtonText,
  trustBadges,
  trackingObject = "glean_hero",
}: CompetitiveHeroSectionProps) {
  return (
    <section className="w-full">
      <div
        className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen py-16 md:py-24"
        style={{
          background:
            "linear-gradient(180deg, #FFF 0%, #E9F7FF 40%, #E9F7FF 60%, #FFF 100%)",
        }}
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 text-center sm:px-6">
          {/* Chip */}
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700">
            <span className="flex h-2 w-2 rounded-full bg-blue-500" />
            {chip}
          </div>

          {/* Headline with gradient on second line */}
          <h1 className="text-center text-4xl font-bold md:text-5xl lg:text-6xl">
            {headline}
          </h1>

          {/* Post-it style note - tilted with shadow */}
          <div
            className="relative inline-block rotate-[-2deg] transform rounded bg-yellow-300 px-4 py-3 shadow-lg"
            style={{
              boxShadow:
                "3px 3px 10px rgba(0,0,0,0.15), 1px 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <span className="text-sm font-medium text-gray-700">
              {postItText}
            </span>
          </div>

          {/* Value props box */}
          <div className="mt-4 w-full max-w-2xl">
            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white shadow-lg">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-blue-100">
                {valuePropTitle}
              </p>
              <ul className="space-y-3 text-left">
                {valueProps.map((prop, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-400">
                      <CheckIcon className="h-3 w-3 text-white" />
                    </span>
                    <span className="text-white/95">{prop}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Email CTA */}
          <div className="mt-2 w-full max-w-lg">
            {hasSession ? (
              <WorkspaceSelector
                variant="highlight"
                size="md"
                trackingArea={TRACKING_AREAS.COMPETITIVE}
                trackingObject={`${trackingObject}_open_dust`}
                showWelcomeMessage
              />
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-md">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your work email"
                    className="flex-1 border-none bg-transparent px-3 py-2 text-base text-gray-700 placeholder-gray-400 outline-none focus:ring-0"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 font-semibold text-white shadow-sm transition-all hover:bg-blue-600 hover:shadow-md disabled:opacity-70"
                  >
                    {isLoading && <Spinner size="xs" />}
                    {ctaButtonText}
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </div>
                {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
              </form>
            )}
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            {trustBadges.map((badge, index) => {
              const iconConfig = getTrustBadgeIcon(index);
              return (
                <div key={index} className="flex items-center gap-2">
                  <Icon
                    visual={iconConfig.icon}
                    className={`h-4 w-4 ${iconConfig.colorClass}`}
                  />
                  <span>{badge}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
