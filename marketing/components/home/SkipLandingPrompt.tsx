import { useOpenDustTarget } from "@marketing/hooks/useOpenDustTarget";
import {
  DUST_SKIP_LANDING,
  DUST_SKIP_LANDING_PROMPT_DISMISSED,
  isSkipLandingPromptDismissed,
  shouldSkipLanding,
  SKIP_LANDING_COOKIE_OPTIONS,
} from "@marketing/lib/cookies";
import { TRACKING_AREAS, withTracking } from "@marketing/lib/tracking";
import { ArrowRight, LegacyButton as Button, XClose } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

/**
 * Offers a logged-in visitor on the marketing root the option to go straight to
 * the app on subsequent visits. Opting in sets `dust-skip-landing`, which the
 * root page reads server-side to redirect before rendering.
 *
 * Rendered inside the header's CTA cluster, which must be `relative` for the
 * card to anchor under the "Open Dust" button.
 */
export function SkipLandingPrompt() {
  const [cookies, setCookie] = useCookies(
    [DUST_SKIP_LANDING, DUST_SKIP_LANDING_PROMPT_DISMISSED],
    { doNotParse: true }
  );
  const { hasSession, isAuthenticated, target } = useOpenDustTarget();

  // Read the preference cookies on the client only, to avoid a hydration
  // mismatch: the root page is server-rendered for everyone who has not opted
  // in, so the card can never be part of that HTML.
  const [showPrompt, setShowPrompt] = useState(false);
  useEffect(() => {
    setShowPrompt(
      !shouldSkipLanding(cookies[DUST_SKIP_LANDING]) &&
        !isSkipLandingPromptDismissed(
          cookies[DUST_SKIP_LANDING_PROMPT_DISMISSED]
        )
    );
  }, [cookies]);

  if (!showPrompt || !hasSession || !isAuthenticated) {
    return null;
  }

  return (
    <div className="absolute right-0 top-full z-20 mt-3 hidden xs:block">
      <div className="flex w-max flex-col items-start gap-1 rounded-2xl border border-border bg-background p-4 shadow-lg">
        <div className="flex w-full items-center justify-between gap-6">
          <span className="text-sm font-medium text-foreground">
            Skip this page next time?
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            icon={XClose}
            tooltip="Dismiss"
            onClick={withTracking(
              TRACKING_AREAS.NAVIGATION,
              "dismiss_skip_landing_prompt",
              () => {
                setCookie(
                  DUST_SKIP_LANDING_PROMPT_DISMISSED,
                  "1",
                  SKIP_LANDING_COOKIE_OPTIONS
                );
              }
            )}
          />
        </div>
        <Button
          variant="highlight-secondary"
          size="sm"
          label="Always open Dust"
          icon={ArrowRight}
          onClick={withTracking(
            TRACKING_AREAS.NAVIGATION,
            "always_open_dust",
            () => {
              setCookie(DUST_SKIP_LANDING, "1", SKIP_LANDING_COOKIE_OPTIONS);
              // eslint-disable-next-line react-hooks/immutability
              window.location.href = target;
            }
          )}
        />
      </div>
    </div>
  );
}
