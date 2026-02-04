import {
  ArrowRightIcon,
  Button,
  CheckIcon,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { clientFetch } from "@app/lib/egress/client";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  withTracking,
} from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

interface EmailCTASectionProps {
  title: string;
  subtitle: string;
  buttonText: string;
  trustBadges: string[];
  trackingObject?: string;
}

export function EmailCTASection({
  title,
  subtitle,
  buttonText,
  trustBadges,
  trackingObject = "glean_cta_bottom",
}: EmailCTASectionProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }

    trackEvent({
      area: TRACKING_AREAS.COMPETITIVE,
      object: `${trackingObject}_email`,
      action: TRACKING_ACTIONS.SUBMIT,
    });

    setIsLoading(true);

    try {
      const response = await clientFetch("/api/enrichment/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!data.success && data.error) {
        setError(data.error);
        return;
      }

      if (data.redirectUrl) {
        window.location.href = appendUTMParams(data.redirectUrl);
      }
    } catch (err) {
      logger.error({ error: normalizeError(err) }, "Enrichment error");
      window.location.href = appendUTMParams(
        `/api/workos/login?screenHint=sign-up&loginHint=${encodeURIComponent(email)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="w-full">
      <div
        className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen py-16 md:py-20"
        style={{
          background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
            {title}
          </h2>
          <p className="mb-8 text-lg text-blue-100">{subtitle}</p>

          <div className="mx-auto max-w-lg">
            {hasSession ? (
              <div className="flex flex-col items-center gap-3">
                <Button
                  variant="highlight"
                  size="md"
                  label="Open Dust"
                  icon={ArrowRightIcon}
                  onClick={withTracking(
                    TRACKING_AREAS.COMPETITIVE,
                    `${trackingObject}_open_dust`,
                    () => {
                      window.location.href = "/api/login";
                    }
                  )}
                />
                <p className="text-sm text-blue-200">
                  Welcome back! Continue where you left off.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex w-full flex-col items-center gap-3 sm:flex-row">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your work email"
                    className="w-full flex-1 rounded-xl border-2 border-white/20 bg-white px-4 py-3.5 text-base text-gray-700 placeholder-gray-400 shadow-lg outline-none focus:border-white/40 focus:ring-0"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 font-semibold text-white shadow-lg transition-all hover:bg-emerald-600 hover:shadow-xl disabled:opacity-70 sm:w-auto"
                  >
                    {isLoading && <Spinner size="xs" />}
                    {buttonText}
                    <Icon visual={ArrowRightIcon} size="sm" />
                  </button>
                </div>
                {error && <p className="mt-2 text-sm text-red-200">{error}</p>}
              </form>
            )}
          </div>

          {/* Trust badges */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-blue-100">
            {trustBadges.map((badge, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Icon visual={CheckIcon} className="h-4 w-4 text-emerald-400" />
                <span>{badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
