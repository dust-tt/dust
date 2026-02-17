import { EnterpriseChoiceModal } from "@app/components/home/content/Landing/EnterpriseChoiceModal";
import { useEnrichmentSubmit } from "@app/components/home/content/Landing/useEnrichmentSubmit";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import type { TrackingArea } from "@app/lib/tracking";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { ArrowRightIcon, Button, cn, Icon, Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

interface LandingEmailSignupProps {
  ctaButtonText: string;
  trackingLocation: string;
  trackingArea?: TrackingArea;
  placeholder?: string;
  welcomeBackText?: string;
  variant?: "default" | "dark";
  className?: string;
  children?: ReactNode;
}

export function LandingEmailSignup({
  ctaButtonText,
  welcomeBackText = "Welcome back! Continue where you left off.",
  trackingLocation,
  trackingArea = TRACKING_AREAS.HOME,
  placeholder = "Enter your work email",
  variant = "default",
  className = "",
  children,
}: LandingEmailSignupProps) {
  const router = useRouter();
  const {
    email,
    setEmail,
    isLoading,
    error,
    handleSubmit,
    enterpriseModalProps,
  } = useEnrichmentSubmit({
    trackingArea,
    trackingObject: trackingLocation,
  });

  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const handleOpenDust = withTracking(
    trackingArea,
    `${trackingLocation}_open_dust`,
    () => {
      void router.push("/api/login");
    }
  );

  if (hasSession) {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <Button
          variant="highlight"
          size="md"
          label="Open Dust"
          icon={ArrowRightIcon}
          onClick={handleOpenDust}
        />
        <p
          className={cn(
            "text-sm",
            variant === "dark" ? "text-blue-200" : "text-muted-foreground"
          )}
        >
          {welcomeBackText}
        </p>
      </div>
    );
  }

  const isDark = variant === "dark";

  return (
    <>
      <form onSubmit={handleSubmit} className={className}>
        {isDark ? (
          <div className="flex w-full flex-col items-center gap-3 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholder}
              className="w-full flex-1 rounded-xl border-2 border-white/20 bg-white px-4 py-3.5 text-base text-gray-700 placeholder-gray-400 shadow-lg outline-none focus:border-white/40 focus:ring-0"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 font-semibold text-white shadow-lg transition-all hover:bg-emerald-600 hover:shadow-xl disabled:opacity-70 sm:w-auto"
            >
              {isLoading && <Spinner size="xs" />}
              {ctaButtonText}
              <Icon visual={ArrowRightIcon} size="sm" />
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-md">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholder}
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
        )}
        {error && (
          <p
            className={cn(
              "mt-2 text-sm",
              isDark ? "text-red-200" : "text-red-500"
            )}
          >
            {error}
          </p>
        )}
        {children}
      </form>
      <EnterpriseChoiceModal {...enterpriseModalProps} />
    </>
  );
}
