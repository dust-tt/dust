import { useDiscoveryHomepageOptIn } from "@app/hooks/useDiscoveryHomepageOptIn";
import { TRACKING_AREAS, trackEvent, withTracking } from "@app/lib/tracking";
import { Hoverable } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";
import { useEffect } from "react";

export function DiscoveryHomepageOptInLine() {
  const { canToggleHomepage, hasOptedIn, setOptedIn } =
    useDiscoveryHomepageOptIn();
  useEffect(() => {
    if (canToggleHomepage) {
      trackEvent({
        area: TRACKING_AREAS.CONVERSATION,
        object: "discovery_homepage_opt_in_line",
        action: "view",
        extra: { opted_in: hasOptedIn },
      });
    }
  }, [canToggleHomepage, hasOptedIn]);

  if (!canToggleHomepage) {
    return null;
  }

  return (
    <div className="relative h-0 w-full">
      <div className="absolute right-0 top-3 z-10 whitespace-nowrap text-xs text-faint">
        {hasOptedIn ? (
          <Hoverable
            variant="invisible"
            className="text-muted-foreground underline underline-offset-2"
            onClick={withTracking(
              TRACKING_AREAS.CONVERSATION,
              "leave_discovery_homepage_opt_in_line",
              () => setOptedIn(false)
            )}
          >
            <Trans>Switch back to the original homepage.</Trans>
          </Hoverable>
        ) : (
          <Trans>
            Your homepage is getting a refresh.{" "}
            <Hoverable
              variant="invisible"
              className="text-muted-foreground underline underline-offset-2"
              onClick={withTracking(
                TRACKING_AREAS.CONVERSATION,
                "try_discovery_homepage_opt_in_line",
                () => setOptedIn(true)
              )}
            >
              Get a sneak peek!
            </Hoverable>
          </Trans>
        )}
      </div>
    </div>
  );
}
