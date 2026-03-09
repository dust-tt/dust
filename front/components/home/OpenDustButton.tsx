import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { useLandingAuthContext } from "@app/lib/swr/website";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import { ArrowRightIcon, Button } from "@dust-tt/sparkle";
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

  const { user, isLoading, isAuthenticated } = useLandingAuthContext({
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

  const button = (
    <Button
      variant={variant}
      size={size}
      label="Open Dust"
      icon={ArrowRightIcon}
      onClick={withTracking(trackingArea, trackingObject, () => {
        // eslint-disable-next-line react-hooks/immutability
        window.location.href = appendUTMParams("/api/login");
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
