import { ArrowRightIcon, Button, Spinner } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { useLandingPageAuthContext } from "@app/lib/swr/website";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";

interface WorkspaceSelectorProps {
  variant?: "highlight" | "outline";
  size?: "sm" | "md";
  postLoginReturnToUrl?: string;
  trackingArea?: string;
  trackingObject?: string;
  showWelcomeMessage?: boolean;
  welcomeMessageClassName?: string;
}

export function WorkspaceSelector({
  variant = "highlight",
  size = "sm",
  postLoginReturnToUrl = "/api/login",
  trackingArea = TRACKING_AREAS.NAVIGATION,
  trackingObject = "open_dust",
  showWelcomeMessage = false,
  welcomeMessageClassName = "text-xs text-muted-foreground",
}: WorkspaceSelectorProps) {
  // Check session cookie only on client to avoid hydration mismatch.
  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const { user, workspaces, isLoading, isAuthenticated } =
    useLandingPageAuthContext({
      hasSessionCookie: hasSession,
    });

  // If no session cookie, don't show anything (the parent component handles the sign-in flow)
  if (!hasSession) {
    return null;
  }

  // Loading state while fetching auth context
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

  // Not authenticated - this shouldn't happen if hasSession is true, but handle gracefully
  if (!isAuthenticated || !user) {
    return null;
  }

  const firstName = user.firstName || "there";

  // Redirect to first workspace or fallback to login
  const redirectUrl = workspaces[0]?.url ?? postLoginReturnToUrl;

  const button = (
    <Button
      variant={variant}
      size={size}
      label="Open Dust"
      icon={ArrowRightIcon}
      onClick={withTracking(trackingArea, trackingObject, () => {
        // eslint-disable-next-line react-hooks/immutability
        window.location.href = appendUTMParams(redirectUrl);
      })}
    />
  );

  if (!showWelcomeMessage) {
    return button;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {button}
      <span className={welcomeMessageClassName}>
        Welcome back, {firstName}!
      </span>
    </div>
  );
}

/**
 * Hero version of the workspace selector with custom styling for landing pages.
 */
interface HeroWorkspaceSelectorProps {
  trackingArea?: string;
  trackingObject?: string;
}

export function HeroWorkspaceSelector({
  trackingArea = TRACKING_AREAS.HOME,
  trackingObject = "hero_open_dust",
}: HeroWorkspaceSelectorProps) {
  // Check session cookie only on client to avoid hydration mismatch.
  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const { user, workspaces, isLoading, isAuthenticated } =
    useLandingPageAuthContext({
      hasSessionCookie: hasSession,
    });

  // If no session cookie, don't show anything
  if (!hasSession) {
    return null;
  }

  // Loading state
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

  // Not authenticated
  if (!isAuthenticated || !user) {
    return null;
  }

  const firstName = user.firstName || "there";
  const redirectUrl = workspaces[0]?.url ?? "/api/login";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={withTracking(trackingArea, trackingObject, () => {
          // eslint-disable-next-line react-hooks/immutability
          window.location.href = appendUTMParams(redirectUrl);
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
