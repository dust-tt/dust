import { useOpenDustTarget } from "@marketing/hooks/useOpenDustTarget";
import { TRACKING_AREAS, withTracking } from "@marketing/lib/tracking";
import { ArrowRight, LegacyButton as Button } from "@dust-tt/sparkle";

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
  const { hasSession, user, isLoading, isAuthenticated, target } =
    useOpenDustTarget();

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
