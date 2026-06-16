import config from "@marketing/lib/api/config";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@marketing/lib/cookies";
import { useLandingAuthContext } from "@marketing/lib/swr/website";
import { TRACKING_AREAS, withTracking } from "@marketing/lib/tracking";
import { appendUTMParams } from "@marketing/lib/utils/utm";
import { ArrowRight, Button } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

interface OpenDustButtonProps {
  variant?: "highlight" | "outline";
  size?: "sm" | "md";
  trackingArea?: string;
  trackingObject?: string;
  showWelcome?: boolean;
}

export function OpenDustButton({
  variant = "highlight",
  size = "sm",
  trackingArea = TRACKING_AREAS.NAVIGATION,
  trackingObject = "open_dust",
  showWelcome = false,
}: OpenDustButtonProps) {
  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const { user, defaultWorkspaceId, isLoading, isAuthenticated } =
    useLandingAuthContext({
      hasSessionCookie: hasSession,
    });

  if (!hasSession) {
    return null;
  }

  if (isLoading) {
    return (
      <Button
        variant={variant}
        size={size}
        label="Open Dust"
        disabled
        isLoading
      />
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // When we already know the user's workspace, navigate straight to the app to
  // skip the slow server-side `/api/login` round-trip. Fall back to `/api/login`
  // when there is no default workspace (no-workspace / first-login / invite / SSO
  // edge cases that need the full login flow).
  const target = defaultWorkspaceId
    ? appendUTMParams(`${config.getAppUrl()}/w/${defaultWorkspaceId}`)
    : appendUTMParams("/api/login");

  const button = (
    <Button
      variant={variant}
      size={size}
      label="Open Dust"
      icon={ArrowRight}
      onClick={withTracking(trackingArea, trackingObject, () => {
        // eslint-disable-next-line react-hooks/immutability
        window.location.href = target;
      })}
    />
  );

  if (!showWelcome) {
    return button;
  }

  const firstName = user?.firstName ?? "there";

  return (
    <div className="flex flex-col items-center gap-3">
      {button}
      <p className="text-sm text-muted-foreground">
        Welcome back, {firstName}! Continue where you left off.
      </p>
    </div>
  );
}
