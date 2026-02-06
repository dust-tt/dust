import { ArrowRightIcon, Button, cn, Spinner } from "@dust-tt/sparkle";
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

interface LandingEmailSignupProps {
  ctaButtonText: string;
  welcomeBackText?: string;
  trackingLocation: string;
  className?: string;
}

export function LandingEmailSignup({
  ctaButtonText,
  welcomeBackText = "Welcome back! Continue where you left off.",
  trackingLocation,
  className = "",
}: LandingEmailSignupProps) {
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
      area: TRACKING_AREAS.HOME,
      object: `${trackingLocation}_email`,
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

  if (hasSession) {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <Button
          variant="highlight"
          size="md"
          label="Open Dust"
          icon={ArrowRightIcon}
          onClick={withTracking(
            TRACKING_AREAS.HOME,
            `${trackingLocation}_open_dust`,
            () => {
              window.location.href = "/api/login";
            }
          )}
        />
        <p className="text-sm text-muted-foreground">{welcomeBackText}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
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
  );
}
