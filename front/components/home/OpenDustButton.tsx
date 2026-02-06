import { ArrowRightIcon, Button, Spinner } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { useLandingAuthContext } from "@app/lib/swr/website";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";

interface OpenDustButtonProps {
  variant?: "highlight" | "outline";
  size?: "sm" | "md";
  trackingArea?: string;
  trackingObject?: string;
}

export function OpenDustButton({
  variant = "highlight",
  size = "sm",
  trackingArea = TRACKING_AREAS.NAVIGATION,
  trackingObject = "open_dust",
}: OpenDustButtonProps) {
  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const { defaultWorkspaceUrl, isLoading, isAuthenticated } =
    useLandingAuthContext({ hasSessionCookie: hasSession });

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

  if (!isAuthenticated || !defaultWorkspaceUrl) {
    return null;
  }

  return (
    <Button
      variant={variant}
      size={size}
      label="Open Dust"
      icon={ArrowRightIcon}
      onClick={withTracking(trackingArea, trackingObject, () => {
        // eslint-disable-next-line react-hooks/immutability
        window.location.href = appendUTMParams(defaultWorkspaceUrl);
      })}
    />
  );
}

interface HeroOpenDustButtonProps {
  trackingArea?: string;
  trackingObject?: string;
}

export function HeroOpenDustButton({
  trackingArea = TRACKING_AREAS.HOME,
  trackingObject = "hero_open_dust",
}: HeroOpenDustButtonProps) {
  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const { user, defaultWorkspaceUrl, isLoading, isAuthenticated } =
    useLandingAuthContext({ hasSessionCookie: hasSession });

  if (!hasSession) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          disabled
          className="flex items-center gap-2 rounded-2xl bg-blue-500 px-8 py-4 text-lg font-semibold text-white opacity-70 shadow-sm"
        >
          <Spinner size="xs" />
          Open Dust
        </button>
      </div>
    );
  }

  if (!isAuthenticated || !defaultWorkspaceUrl || !user) {
    return null;
  }

  const firstName = user.firstName || "there";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={withTracking(trackingArea, trackingObject, () => {
          // eslint-disable-next-line react-hooks/immutability
          window.location.href = appendUTMParams(defaultWorkspaceUrl);
        })}
        className="flex items-center gap-2 rounded-2xl bg-blue-500 px-8 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
      >
        <ArrowRightIcon className="h-5 w-5" />
        Open Dust
      </button>
      <p className="text-sm text-muted-foreground">
        Welcome back, {firstName}! Continue where you left off.
      </p>
    </div>
  );
}
